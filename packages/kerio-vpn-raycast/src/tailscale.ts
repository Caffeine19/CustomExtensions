import { execFile } from "child_process";
import { constants } from "fs";
import { access, mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { setTimeout } from "timers/promises";
import { promisify } from "util";
import { environment } from "@raycast/api";
import { tryit } from "radash";
import type { ToggleConcern, ToggleContext } from "./types";

const exec = promisify(execFile);

const candidates = [
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/usr/bin/tailscale",
];

// Marker file recording that this extension paused Tailscale and should restore it later.
const markerPath = () => join(environment.supportPath, "tailscale-paused");

async function resolveTailscale(): Promise<string | undefined> {
  const pathCandidates = (process.env.PATH ?? "")
    .split(":")
    .filter((directory) => directory.startsWith("/"))
    .map((directory) => join(directory, "tailscale"));
  for (const candidate of [...new Set([...candidates, ...pathCandidates])]) {
    const [err] = await tryit(access)(candidate, constants.X_OK);
    if (!err) return candidate;
  }
}

function runTailscale(bin: string, args: string[], timeout: number) {
  return exec(bin, args, {
    timeout,
    env: { ...process.env, TAILSCALE_BE_CLI: "1" },
  });
}

async function backendState(bin: string, timeout = 5000): Promise<string> {
  const { stdout } = await runTailscale(bin, ["status", "--json"], timeout);
  const { BackendState } = JSON.parse(stdout) as { BackendState?: string };
  if (!BackendState)
    throw new Error("Tailscale did not report its backend state.");
  return BackendState;
}

function isActive(state: string): boolean {
  return state === "Running" || state === "Starting";
}

/**
 * Pause Tailscale so it does not compete with the Kerio tunnel.
 * Records a marker so resumeTailscale() can restore it after Kerio disconnects.
 * Returns a short note only when Tailscale was actually disconnected.
 */
export async function suspendTailscale(): Promise<string | undefined> {
  const bin = await resolveTailscale();
  if (!bin) return;
  const [statusError, state] = await tryit(backendState)(bin);
  if (statusError || !state) {
    throw new Error(
      "Could not read Tailscale status. Check Tailscale before connecting Kerio.",
    );
  }
  if (!isActive(state)) return;

  const [pauseError] = await tryit(async () => {
    await mkdir(environment.supportPath, { recursive: true });
    await writeFile(markerPath(), "");
    await runTailscale(bin, ["down"], 10000);
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (
        !isActive(
          await backendState(
            bin,
            Math.min(3000, Math.max(1, deadline - Date.now())),
          ),
        )
      ) {
        return;
      }
      await setTimeout(300);
    }
    throw new Error("Timed out waiting for Tailscale to stop.");
  })();
  if (pauseError) {
    throw new Error(
      "Could not confirm Tailscale disconnected. Check Tailscale before connecting Kerio.",
    );
  }
  return "Tailscale disconnected";
}

/**
 * Restore Tailscale after Kerio disconnects, but only if this extension paused it.
 * Returns a short note only when Tailscale was actually reconnected.
 */
export async function resumeTailscale(): Promise<string | undefined> {
  const marker = markerPath();
  const [markerErr] = await tryit(access)(marker);
  if (markerErr) return undefined; // We never paused Tailscale; leave it alone.
  const bin = await resolveTailscale();
  const [err, reconnected] = await tryit(async () => {
    if (!bin) throw new Error("Tailscale CLI not found.");
    const alreadyRunning = (await backendState(bin)) === "Running";
    if (!alreadyRunning) await runTailscale(bin, ["up"], 15000);
    await rm(marker, { force: true });
    return !alreadyRunning;
  })();
  if (err) {
    // Leave the marker in place so a later Kerio disconnect can retry.
    return "Tailscale could not reconnect; enable it in Tailscale if needed.";
  }
  return reconnected ? "Tailscale reconnected" : undefined;
}

/**
 * ToggleConcern that pauses Tailscale while Kerio holds the tunnel and restores
 * it after Kerio disconnects.
 */
export function createTailscaleConcern(): ToggleConcern {
  return {
    name: "Tailscale",
    async before(ctx: ToggleContext) {
      if (ctx.phase !== "connect") return;
      const note = await suspendTailscale();
      if (note) ctx.notes.push(note);
    },
    async after(ctx: ToggleContext) {
      if (ctx.phase !== "disconnect") return;
      const note = await resumeTailscale();
      if (note) ctx.notes.push(note);
    },
  };
}
