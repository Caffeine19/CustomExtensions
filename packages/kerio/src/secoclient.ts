import { execFile } from "child_process";
import { setTimeout } from "timers/promises";
import { promisify } from "util";
import { tryit } from "radash";
import type { ToggleConcern, ToggleContext } from "./types";

const exec = promisify(execFile);
const appPath = "/Applications/secoclient.app";
const quitScript = `
ObjC.import("AppKit");
var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier("work.VPNClient");
for (var i = 0; i < apps.count; i++) {
  apps.objectAtIndex(i).terminate;
}
`;

async function isSecoClientRunning(): Promise<boolean> {
  const { stdout } = await exec("/bin/ps", ["-ax", "-o", "comm="], {
    timeout: 4000,
  });
  return stdout
    .split("\n")
    .some((line) => /(?:^|\/)SecoClient(?:CS)?$/.test(line.trim()));
}

export async function quitSecoClientIfRunning(): Promise<boolean> {
  if (!(await isSecoClientRunning())) return false;
  await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", quitScript], {
    timeout: 8000,
  });

  const deadline = Date.now() + 15000;
  for (;;) {
    if (!(await isSecoClientRunning())) return true;
    if (Date.now() >= deadline) break;
    await setTimeout(300);
  }
  throw new Error(
    "SecoClient is still running. Quit it before connecting Kerio VPN.",
  );
}

export async function reopenSecoClient(): Promise<void> {
  await exec("/usr/bin/open", ["-a", appPath], { timeout: 5000 });
}

/**
 * ToggleConcern that quits SecoClient before a connection and reopens it once
 * Kerio is stable, so the two VPN clients do not fight over the tunnel.
 */
export function createSecoClientConcern(): ToggleConcern {
  let shouldRestore = false;
  return {
    name: "SecoClient",
    async before(ctx: ToggleContext) {
      if (ctx.phase !== "connect") return;
      shouldRestore = await quitSecoClientIfRunning();
    },
    async after(ctx: ToggleContext) {
      if (ctx.phase !== "connect" || !shouldRestore) return;
      // macOS can briefly report Connected while the Kerio extension is still starting.
      if (!(await ctx.ensureStable())) {
        ctx.message =
          "Kerio VPN did not stay connected. SecoClient remains closed.";
        return;
      }
      const [err] = await tryit(reopenSecoClient)();
      ctx.message = err
        ? "Kerio VPN connected. Could not reopen SecoClient."
        : "Kerio VPN connected. SecoClient reopened.";
    },
  };
}
