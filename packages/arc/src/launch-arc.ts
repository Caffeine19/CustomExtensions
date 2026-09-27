import { getPreferenceValues } from "@raycast/api";
import { execSync } from "child_process";

/** Chromium flags that enable CDP remote debugging. */
const DEBUG_ARGS = ["--remote-debugging-port=9333", "--remote-allow-origins=*"];

/** Returns whether the Arc process is running. */
export function isArcRunning(): boolean {
  try {
    execSync("pgrep -x Arc", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Returns whether Arc is running with the remote debugging flags applied. */
export function isRemoteDebuggingActive(): boolean {
  if (!isArcRunning()) {
    return false;
  }

  try {
    execSync("pgrep -f remote-debugging-port=9333", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Launches Arc with remote debugging (CDP) enabled on port 9333. */
export function launchArcWithRemoteDebugging(): void {
  execSync(`open -a Arc --args ${DEBUG_ARGS.join(" ")}`);
}

/** Whether Arc should be cold-launched with remote debugging flags. */
export function isRemoteDebuggingEnabled(): boolean {
  return getPreferenceValues().enableRemoteDebugging;
}

/**
 * Ensures Arc is running, cold-launching it when it is not. With the "Enable
 * Remote Debugging" preference on (default), the cold launch passes the remote
 * debugging flags. No-op when Arc is already running (`open --args` cannot add
 * flags to a running instance — use the Remote Debugging command to restart it).
 */
export async function ensureArcLaunched(): Promise<void> {
  if (isArcRunning()) {
    return;
  }

  if (isRemoteDebuggingEnabled()) {
    launchArcWithRemoteDebugging();
  } else {
    execSync("open -a Arc");
  }

  // Give Arc a moment to start up before scripting it
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
