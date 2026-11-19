import { execFile } from "child_process";
import { access, rm, writeFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
import { environment } from "@raycast/api";
import { tryit } from "radash";
import type { ToggleConcern, ToggleContext } from "./types";

const exec = promisify(execFile);

// Tailscale ships its CLI inside the app bundle on macOS; Homebrew installs it on PATH.
const candidates = [
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/usr/bin/tailscale",
];

// Marker file recording that this extension paused Tailscale and should restore it later.
const markerPath = () => join(environment.supportPath, "tailscale-paused");

async function resolveTailscale(): Promise<string> {
  for (const candidate of candidates) {
    const [err] = await tryit(access)(candidate);
    if (!err) return candidate;
    // Try the next known location.
  }
  // Fall back to whatever `tailscale` resolves to on PATH.
  return "tailscale";
}

async function backendState(bin: string): Promise<string> {
  const [, state] = await tryit(async () => {
    const { stdout } = await exec(bin, ["status", "--json"], { timeout: 5000 });
    return String(
      (JSON.parse(stdout) as { BackendState?: string }).BackendState ?? "",
    );
  })();
  return state ?? "";
}

/**
 * Pause Tailscale so it does not compete with the Kerio tunnel.
 * Records a marker so resumeTailscale() can restore it after Kerio disconnects.
 * Returns a short note only when Tailscale was actually disconnected.
 */
export async function suspendTailscale(): Promise<string | undefined> {
  const bin = await resolveTailscale();
  if ((await backendState(bin)) !== "Running") return undefined;
  const [err] = await tryit(async () => {
    await exec(bin, ["down"], { timeout: 10000 });
    await writeFile(markerPath(), "");
  })();
  return err ? undefined : "Tailscale disconnected";
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
  if ((await backendState(bin)) === "Running") {
    await rm(marker, { force: true });
    return undefined; // Already connected.
  }
  const [err] = await tryit(async () => {
    await exec(bin, ["up"], { timeout: 15000 });
    await rm(marker, { force: true });
  })();
  if (err) {
    // Leave the marker in place so a later Kerio disconnect can retry.
    return "Tailscale could not reconnect; enable it in Tailscale if needed.";
  }
  return "Tailscale reconnected";
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
