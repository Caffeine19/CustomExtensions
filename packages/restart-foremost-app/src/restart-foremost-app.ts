import { execFile } from "child_process";
import { basename } from "path";
import { promisify } from "util";
import {
  closeMainWindow,
  getFrontmostApplication,
  showHUD,
  type Application,
} from "@raycast/api";
import { retry, sleep, tryit } from "radash";

const execFileAsync = promisify(execFile);

/** How long a graceful shutdown may take before escalating to a force kill. */
const TERM_TIMEOUT_MS = 10_000;
/** How long a force kill may take before giving up on the process. */
const KILL_TIMEOUT_MS = 3_000;
/** How long to wait for a fresh process to appear after each relaunch attempt. */
const VERIFY_TIMEOUT_MS = 5_000;
/** Delay between process polls. */
const POLL_INTERVAL_MS = 200;
/** Relaunch attempts — `open` can fail while the old instance is still tearing down. */
const RELAUNCH_ATTEMPTS = 3;
/** How often / how long to wait for focus to leave Raycast's own window. */
const FRONTMOST_SETTLE_RETRIES = 10;
const FRONTMOST_SETTLE_MS = 100;

/** Apps that must never be killed by this command. */
const BLOCKLIST = ["Finder"];

/** Whether a process with this pid currently exists (signal 0 probe). */
function isAlive(pid: number): boolean {
  const [err] = tryit(() => process.kill(pid, 0))();
  // EPERM means "exists but is not ours"; anything else means it is gone
  return !err || (err as NodeJS.ErrnoException).code === "EPERM";
}

/**
 * Raycast itself is never a restart target
 */
function isRaycast(app: Application): boolean {
  return (
    /^com\.raycast\./i.test(app.bundleId ?? "") ||
    app.name.toLowerCase() === "raycast"
  );
}

/**
 * PIDs of the processes that belong to this app.
 */
async function findAppPids(
  app: Application,
  anyInstall = false,
): Promise<number[]> {
  const [err, result] = await tryit(() =>
    execFileAsync("ps", ["-axo", "pid=,comm="]),
  )();
  // A ps failure must not look like "the app has no process"
  if (err || !result) return [];

  const bundlePath = app.path.replace(/\/+$/, "");
  const marker = anyInstall
    ? `/${basename(bundlePath)}/Contents/MacOS/`.toLowerCase()
    : `${bundlePath}/Contents/MacOS/`.toLowerCase();
  return result.stdout
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => {
      if (!match) return false;
      const comm = match[2].toLowerCase();
      return anyInstall ? comm.includes(marker) : comm.startsWith(marker);
    })
    .map((match) => Number(match[1]));
}

/** Ask the process to quit (SIGTERM). "Gone already" is fine. */
function requestQuit(pid: number): void {
  const [err] = tryit(() => process.kill(pid, "SIGTERM"))();
  if (err && (err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
}

/** Forcefully kill the process (SIGKILL). */
function forceKill(pid: number): void {
  const [err] = tryit(() => process.kill(pid, "SIGKILL"))();
  if (err && (err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
}

/** Poll until every pid is gone; resolves true when they are. */
async function waitForExit(
  pids: number[],
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pids.some(isAlive)) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return !pids.some(isAlive);
}

/** Kill the app's processes and make sure they are really gone. */
async function killAndWait(pids: number[]): Promise<boolean> {
  for (const pid of pids) requestQuit(pid);
  if (await waitForExit(pids, TERM_TIMEOUT_MS)) return true;
  for (const pid of pids) forceKill(pid);
  return waitForExit(pids, KILL_TIMEOUT_MS);
}

/** Relaunch the app through LaunchServices (`open -b`, falling back to the bundle path). */
async function relaunch(app: Application): Promise<void> {
  await execFileAsync("open", app.bundleId ? ["-b", app.bundleId] : [app.path]);
}

/** Wait until a fresh instance appears under a pid different from the killed ones. */
async function waitForNewInstance(
  app: Application,
  oldPids: number[],
): Promise<boolean> {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const fresh = await findAppPids(app, true);
    if (fresh.some((pid) => !oldPids.includes(pid))) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

/** The app to restart. closeMainWindow resolves before focus lands back — hence the short poll. */
async function getTargetApplication(): Promise<Application> {
  for (let attempt = 0; ; attempt++) {
    const app = await getFrontmostApplication();
    if (!isRaycast(app) || attempt >= FRONTMOST_SETTLE_RETRIES) return app;
    await sleep(FRONTMOST_SETTLE_MS);
  }
}

/** Quit the frontmost app, wait for it to die, then relaunch and verify it came back. */
async function restartForemostApp(): Promise<void> {
  // Hand focus back to the app we're about to restart.
  await closeMainWindow();

  const app = await getTargetApplication();
  if (isRaycast(app) || BLOCKLIST.includes(app.name)) {
    await showHUD(`Skipped ${app.name}`);
    return;
  }

  // Locate the app's processes: exact bundle path first, any install as a fallback.
  let oldPids = await findAppPids(app);
  if (oldPids.length === 0) oldPids = await findAppPids(app, true);
  if (oldPids.length === 0) {
    await showHUD(`⚠️ Couldn't find a running process of ${app.name}`);
    return;
  }

  // 1. Kill and wait — relaunching while the old instance is still tearing down loses the app.
  if (!(await killAndWait(oldPids))) {
    await showHUD(`⚠️ ${app.name} didn't quit`);
    return;
  }

  // 2. Relaunch and verify a fresh process appeared; retry with a growing backoff.
  const [relaunchErr] = await tryit(() =>
    retry(
      { times: RELAUNCH_ATTEMPTS, backoff: (attempt) => attempt * 500 },
      async () => {
        await relaunch(app);
        if (!(await waitForNewInstance(app, oldPids)))
          throw new Error("no fresh process appeared");
      },
    ),
  )();

  if (relaunchErr) {
    await showHUD(`⚠️ ${app.name} quit but didn't relaunch`);
    return;
  }

  await showHUD(`🎉 Restarted ${app.name}`);
}

export default async function main(): Promise<void> {
  const [err] = await tryit(restartForemostApp)();
  if (err) {
    await showHUD(
      `⚠️ ${err instanceof Error ? err.message : "Restart failed"}`,
    );
  }
}
