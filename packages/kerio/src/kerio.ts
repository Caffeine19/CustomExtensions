import { execFile } from "child_process";
import { open } from "fs/promises";
import { homedir, uptime } from "os";
import { join } from "path";
import { setTimeout } from "timers/promises";
import { promisify } from "util";
import { runAppleScript } from "@raycast/utils";
import { tryit } from "radash";
import { createTotpCleanupConcern } from "./edge";
import { createSecoClientConcern } from "./secoclient";
import { createTailscaleConcern } from "./tailscale";
import type { ToggleConcern, ToggleContext, TogglePhase } from "./types";

const exec = promisify(execFile);
const scutil = "/usr/sbin/scutil";
const preferencePane = "/Library/PreferencePanes/KVpnClient.prefPane";
const uiLog = join(homedir(), ".kerio/vpnclient/logs/debug.log");

export type State =
  | "Connected"
  | "Connecting"
  | "Disconnecting"
  | "Disconnected"
  | "Unavailable";
export type Service = { id: string; name: string; state: State };

const serviceLine =
  /^\s*\*?\s*\(([^)]+)\)\s+([\da-f-]{36})\s+VPN\s+\(com\.kerio\.VPN\.(?:ie|fr)\.agent\)\s+"(.*)"\s+\[VPN:/i;

const connectScript = /* appleScript */ `
on run arguments
set cancelPending to (item 1 of arguments is "cancel")
set paneLabels to {"Kerio Control VPN Client", "Persistent connection", "持续连接"}
set connectLabels to {"Connect", "连接"}
set disconnectLabels to {"Disconnect", "断开"}

tell application "System Events"
    repeat 16 times
        set settingsProcesses to every application process whose bundle identifier is "com.apple.systempreferences"
        if (count settingsProcesses) > 0 then
            tell item 1 of settingsProcesses
                if exists window 1 then
                    set paneFound to false
                    set connectButton to missing value
                    set disconnectButton to missing value
                    set controls to entire contents of window 1
                    repeat with controlRef in controls
                        try
                            set controlName to (name of controlRef) as text
                            if controlName is in paneLabels then set paneFound to true
                            if role of controlRef is "AXButton" then
                                if controlName is in connectLabels then set connectButton to contents of controlRef
                                if controlName is in disconnectLabels then set disconnectButton to contents of controlRef
                            end if
                        end try
                    end repeat
                    if paneFound then
                        if disconnectButton is not missing value then
                            if not cancelPending then return "disconnect-visible"
                            if not (enabled of disconnectButton) then return "cancel-unavailable"
                            click disconnectButton
                            return "cancelled"
                        end if
                        if connectButton is not missing value then
                            if cancelPending then return "cancel-unavailable"
                            if not (enabled of connectButton) then return "needs-input"
                            click connectButton
                            return "clicked"
                        end if
                    end if
                end if
            end tell
        end if
        delay 0.3
    end repeat
end tell
return "pane-not-found"
end run
`;

export function parseServices(output: string): Service[] {
  return output.split("\n").flatMap((line) => {
    const match = serviceLine.exec(line);
    if (!match) return [];
    const [, label, id, name] = match;
    const state = [
      "Connected",
      "Connecting",
      "Disconnecting",
      "Disconnected",
    ].find((value) => value === label);
    return [{ id, name, state: (state as State | undefined) ?? "Unavailable" }];
  });
}

export async function listServices(): Promise<Service[]> {
  const { stdout } = await exec(scutil, ["--nc", "list"], {
    timeout: 4000,
    env: { ...process.env, LC_ALL: "C" },
  });
  return parseServices(stdout);
}

export function connectionStatus(
  services: Service[],
): State | "No Kerio VPN profile" {
  const states: State[] = [
    "Connected",
    "Connecting",
    "Disconnecting",
    "Disconnected",
    "Unavailable",
  ];
  return (
    states.find((state) =>
      services.some((service) => service.state === state),
    ) ?? "No Kerio VPN profile"
  );
}

export function certificateAttemptTime(logTail: string): number | undefined {
  for (const line of logTail.split("\n").reverse()) {
    if (/TinyDB RPC Client: (?:Connect|Disconnect) called\./.test(line)) return;
    const status = /received status packet \(([^,]+),/.exec(line);
    if (!status) continue;
    if (status[1] !== "checking certificate") return;
    const time =
      /^\[(\d{2})\/([A-Za-z]{3})\/(\d{4}) (\d{2}:\d{2}:\d{2})\]/.exec(line);
    if (!time) return;
    const [, day, month, year, clock] = time;
    const timestamp = Date.parse(`${day} ${month} ${year} ${clock}`);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
}

async function readCertificateAttempt(): Promise<number | undefined> {
  const [openErr, file] = await tryit(async () => open(uiLog, "r"))();
  if (openErr || !file) return; // The client log may be disabled, rotated, or inaccessible.

  const [readErr, attempt] = await tryit(async () => {
    const { size } = await file.stat();
    const bytes = Buffer.alloc(Math.min(size, 128 * 1024));
    const { bytesRead } = await file.read(
      bytes,
      0,
      bytes.length,
      size - bytes.length,
    );
    return certificateAttemptTime(
      bytes.subarray(0, bytesRead).toString("utf8"),
    );
  })();
  await tryit(() => file.close())(); // Always release the handle.

  if (readErr) return;
  const now = Date.now();
  let earliest = now - 24 * 60 * 60 * 1000;
  const [, up] = tryit(uptime)();
  if (typeof up === "number") earliest = now - up * 1000; // Some environments restrict reading the host boot time.
  return attempt !== undefined && attempt >= earliest && attempt <= now
    ? attempt
    : undefined;
}

export async function statusSubtitle(services: Service[]): Promise<string> {
  const status = connectionStatus(services);
  if (
    services.length > 1 ||
    (status !== "Connecting" && status !== "Disconnected")
  )
    return status;
  return (await readCertificateAttempt()) === undefined
    ? status
    : "Checking certificate";
}

async function openKerio(): Promise<void> {
  await exec("/usr/bin/open", [preferencePane], { timeout: 5000 });
}

async function waitForState(
  id: string,
  state: State,
  timeout: number,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const services = await listServices();
    const current = services.find((service) => service.id === id);
    if (current?.state === state || (!current && state === "Disconnected"))
      return true;
    if (Date.now() >= deadline) return false;
    await setTimeout(400);
  }
}

async function waitForStableConnection(): Promise<boolean> {
  const deadline = Date.now() + 90000;
  let lastId: string | undefined;
  let connectedSince = 0;
  while (Date.now() < deadline) {
    const id = (await listServices()).find(
      ({ state }) => state === "Connected",
    )?.id;
    const now = Date.now();
    if (id !== lastId) {
      lastId = id;
      connectedSince = now;
    }
    if (id && now - connectedSince >= 6000) return true;
    await setTimeout(500);
  }
  return false;
}

async function connectKerio(
  services: Service[],
  cancelPending: boolean,
): Promise<string> {
  await openKerio();
  if (services.length > 1) return "Choose the VPN profile in Kerio";
  const [execErr, result] = await tryit(() =>
    runAppleScript(connectScript, [cancelPending ? "cancel" : "connect"], {
      timeout: 12000,
    }),
  )();
  if (execErr || result === undefined)
    return "Kerio opened. Allow Raycast Automation and Accessibility, or continue in Kerio.";

  if (result === "cancelled")
    return "Pending Kerio connection cancelled. Toggle again to retry.";
  if (result === "cancel-unavailable")
    return "No pending attempt found in Kerio. Check the Kerio window.";
  if (result === "disconnect-visible")
    return "Kerio shows a pending or active connection. Check Kerio VPN Status.";
  if (result === "clicked") {
    const [service] = services;
    if (service && (await waitForState(service.id, "Connected", 7000)))
      return "Kerio VPN connected";
    return "Connection requested. Check Kerio for sign-in or status.";
  }
  return cancelPending
    ? "Kerio opened. Click Disconnect to clear the pending attempt."
    : "Kerio opened. Complete the connection in Kerio.";
}

async function disconnectKerio(service: Service): Promise<string> {
  await exec(scutil, ["--nc", "stop", service.id], { timeout: 5000 });
  return (await waitForState(service.id, "Disconnected", 8000))
    ? "Kerio VPN disconnected"
    : "Disconnect requested. Check Kerio VPN Status.";
}

function withNotes(message: string, notes: string[]): string {
  return notes.reduce(
    (msg, note) => `${msg.replace(/[.\s]+$/, "")}. ${note}`,
    message,
  );
}

function createContext(phase: TogglePhase): ToggleContext {
  let stable: Promise<boolean> | undefined;
  return {
    phase,
    message: "",
    notes: [],
    // Memoized so several concerns can share a single stability wait.
    ensureStable: () => (stable ??= waitForStableConnection()),
  };
}

async function runToggle(
  services: Service[],
  concerns: ToggleConcern[],
): Promise<string> {
  const status = connectionStatus(services);
  if (status === "Connecting" || status === "Disconnecting")
    return `Kerio VPN is already ${status.toLowerCase()}`;

  if (status === "Connected") {
    const connected = services.filter(({ state }) => state === "Connected");
    if (connected.length > 1) {
      await openKerio();
      return "Multiple profiles are connected. Choose which to disconnect in Kerio.";
    }
    const ctx = createContext("disconnect");
    for (const concern of concerns) await concern.before?.(ctx);
    ctx.message = await disconnectKerio(connected[0]);
    for (const concern of concerns) await concern.after?.(ctx);
    return withNotes(ctx.message, ctx.notes);
  }

  const cancelPending =
    status === "Disconnected" &&
    services.length === 1 &&
    (await readCertificateAttempt()) !== undefined;
  if (cancelPending) return connectKerio(services, true);

  const ctx = createContext("connect");
  for (const concern of concerns) await concern.before?.(ctx);
  ctx.message = await connectKerio(services, false);
  for (const concern of concerns) await concern.after?.(ctx);
  return withNotes(ctx.message, ctx.notes);
}

/**
 * Fluent builder that composes companion-client side effects around a Kerio
 * toggle. Opt in with `withSecoClient()` / `withTailscale()` / `withTotpCleanup()`,
 * then `run()` (or simply `await` the builder) to get the HUD message.
 */
export class KerioToggle {
  private readonly concerns: ToggleConcern[] = [];
  private result?: Promise<string>;

  constructor(private readonly services: Service[]) {}

  /** Quit SecoClient before connecting and reopen it once Kerio is stable. */
  withSecoClient(): this {
    this.concerns.push(createSecoClientConcern());
    return this;
  }

  /** Pause Tailscale while Kerio holds the tunnel and restore it afterward. */
  withTailscale(): this {
    this.concerns.push(createTailscaleConcern());
    return this;
  }

  /** Close the Kerio TOTP verification tab in Edge once Kerio is connected. */
  withTotpCleanup(): this {
    this.concerns.push(createTotpCleanupConcern());
    return this;
  }

  /** Execute the toggle and return the HUD message. */
  run(): Promise<string> {
    return (this.result ??= runToggle(this.services, this.concerns));
  }

  // Awaitable so `await toggleKerio(...).withTailscale()` resolves to the message.
  then<TResult1 = string, TResult2 = never>(
    onfulfilled?: ((value: string) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export function toggleKerio(services: Service[]): KerioToggle {
  return new KerioToggle(services);
}
