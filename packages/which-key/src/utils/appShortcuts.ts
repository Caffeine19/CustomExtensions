import { execFile } from "child_process";
import { confirmAlert, showToast, Toast } from "@raycast/api";
import { sleep } from "radash";

// ─── Types ───

/** A preset modifier combination offered by the Remap Key form. */
export interface ModifierCombo {
  /** Dropdown value, e.g. "cmd+option" (or "none" for the clear option) */
  id: string;
  /** Dropdown label, e.g. "⌘⌥  Command + Option" */
  label: string;
  /** Encoded modifier prefix for NSUserKeyEquivalents, e.g. "@~" */
  prefix: string;
  /** Glyph prefix for display, e.g. "⌘⌥" */
  display: string;
}

// NSUserKeyEquivalents modifier encoding: @ = cmd, ~ = option, $ = shift, ^ = control
/** Preset modifier combos in dropdown order; "none" clears the shortcut instead of setting one. */
export const MODIFIER_COMBOS: ModifierCombo[] = [
  { id: "none", label: "None — Clear Shortcut", prefix: "", display: "" },
  { id: "cmd", label: "⌘  Command", prefix: "@", display: "⌘" },
  { id: "cmd+shift", label: "⌘⇧  Command + Shift", prefix: "@$", display: "⌘⇧" },
  { id: "cmd+option", label: "⌘⌥  Command + Option", prefix: "@~", display: "⌘⌥" },
  { id: "cmd+option+shift", label: "⌘⌥⇧  Command + Option + Shift", prefix: "@~$", display: "⌘⌥⇧" },
  { id: "option", label: "⌥  Option", prefix: "~", display: "⌥" },
  { id: "option+shift", label: "⌥⇧  Option + Shift", prefix: "~$", display: "⌥⇧" },
  { id: "control+option", label: "⌃⌥  Control + Option", prefix: "^~", display: "⌃⌥" },
  { id: "control+shift", label: "⌃⇧  Control + Shift", prefix: "^$", display: "⌃⇧" },
];

// ─── Process helpers ───

/** Run a command, optionally piping stdin; resolves with stdout, rejects with stderr. */
function run(cmd: string, args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout);
    });
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

/** Append the Full Disk Access hint used when defaults access to a sandboxed container is denied. */
function withGuidance(message: string): string {
  return `${message}. If the target app is sandboxed, grant Raycast Full Disk Access (System Settings → Privacy & Security → Full Disk Access) and try again.`;
}

// ─── App Shortcut (NSUserKeyEquivalents) operations ───

/** Resolve an application's bundle id by name (fallback when Raycast does not provide one). */
export async function resolveBundleId(appName: string): Promise<string> {
  const escaped = appName.replace(/"/g, '\\"');
  const out = await run("osascript", ["-e", `id of application "${escaped}"`]);
  return out.trim();
}

/**
 * Resolve the NSUserKeyEquivalents key for a menu item: the exact leaf title,
 * or an ESC-separated path ("\eTop\eLeaf") when the leaf title appears more than once in the app.
 */
export function resolveMenuKey(item: { name: string; breadcrumb: string }, allItems: { name: string }[]): string {
  const duplicated = allItems.filter((i) => i.name === item.name).length > 1;
  if (!duplicated) return item.name;
  // Hierarchical keys are a leading ESC + ESC-separated titles; breadcrumb has no app prefix
  return "\u001b" + item.breadcrumb.split(" → ").join("\u001b");
}

/** Apply a menu shortcut override via the app's NSUserKeyEquivalents defaults domain. */
export async function applyKeyEquivalent(bundleId: string, menu: string, encoded: string): Promise<void> {
  try {
    // -dict-add merges into the existing dict so the user's other App Shortcuts survive
    await run("defaults", ["write", bundleId, "NSUserKeyEquivalents", "-dict-add", menu, encoded]);
  } catch (e) {
    throw new Error(withGuidance(`Failed to write App Shortcut: ${(e as Error).message}`));
  }
}

// ─── Status check (ledger entry vs what is actually written) ───

/** How a ledger entry compares to the value currently written in the app's defaults domain. */
export type ShortcutStatus = "applied" | "not-applied" | "mismatch" | "unknown";

/** Read the NSUserKeyEquivalents dict for a bundle id; undefined = unreadable (e.g. no Full Disk Access). */
export async function readKeyEquivalents(bundleId: string): Promise<Record<string, string> | undefined> {
  try {
    // Read ONLY this key and convert via plutil: exporting the whole domain to JSON
    // fails when the domain contains <data> values (JSON plists cannot represent them,
    // e.g. Edge's NSOSPLastRootDirectory → "invalid object in plist for destination format")
    const raw = await run("defaults", ["read", bundleId, "NSUserKeyEquivalents"]);
    const json = await run("plutil", ["-convert", "json", "-o", "-", "-"], raw);
    const parsed = JSON.parse(json) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch (e) {
    // "does not exist" = domain or key missing → nothing written yet; anything else = unreadable
    return (e as Error).message.includes("does not exist") ? {} : undefined;
  }
}

/** Compare a ledger entry against the value currently written to the app's defaults domain. */
export function checkStatus(
  entry: { menu: string; encoded: string },
  dict: Record<string, string> | undefined,
): ShortcutStatus {
  if (!dict) return "unknown";
  const actual = dict[entry.menu];
  if (actual === undefined) return "not-applied";
  return actual === entry.encoded ? "applied" : "mismatch";
}

/** Remove one NSUserKeyEquivalents entry, preserving the user's other App Shortcuts. */
export async function removeKeyEquivalent(bundleId: string, menu: string): Promise<void> {
  // Read the current state so a single entry can be dropped safely
  const dict = await readKeyEquivalents(bundleId);
  if (!dict) {
    // Unreadable (permissions) — fail loudly instead of silently leaving a stale system entry
    throw new Error(withGuidance(`Failed to read App Shortcuts for ${bundleId}`));
  }
  if (!(menu in dict)) return; // entry already gone
  delete dict[menu];
  try {
    if (Object.keys(dict).length === 0) {
      await run("defaults", ["delete", bundleId, "NSUserKeyEquivalents"]);
      return;
    }
    const args = ["write", bundleId, "NSUserKeyEquivalents", "-dict"];
    for (const [key, value] of Object.entries(dict)) args.push(key, value);
    await run("defaults", args);
  } catch (e) {
    throw new Error(withGuidance(`Failed to clear App Shortcut: ${(e as Error).message}`));
  }
}

// ─── App restart (NSUserKeyEquivalents only applies after relaunch) ───

/** Force-quit and reopen the app so NSUserKeyEquivalents changes take effect. */
export async function restartApp(appName: string): Promise<void> {
  // killall exits 1 when no process matches (app not running) — that is fine
  await run("killall", [appName]).catch(() => undefined);
  // Wait for the process to fully exit: opening while the old process is still
  // tearing down makes Launch Services fail with -600 (procNotFound)
  for (let i = 0; i < 20; i++) {
    const alive = await run("pgrep", ["-x", appName])
      .then(() => true)
      .catch(() => false);
    if (!alive) break;
    await sleep(100);
  }
  try {
    await run("open", ["-a", appName]);
  } catch {
    // -600 can also fire transiently right after quit — retry once before failing
    await sleep(500);
    await run("open", ["-a", appName]);
  }
}

/** Ask whether to restart the app now; restarts on confirm. */
export async function promptRestart(appName: string): Promise<void> {
  const shouldRestart = await confirmAlert({
    title: `Restart ${appName}?`,
    message: "Shortcut changes take effect after the app restarts. Unsaved work may be lost.",
    primaryAction: { title: "Restart App" },
    dismissAction: { title: "Later" },
  });
  if (!shouldRestart) return;
  try {
    await restartApp(appName);
  } catch (e) {
    await showToast({ style: Toast.Style.Failure, title: `Failed to restart ${appName}`, message: String(e) });
  }
}

/** Ask whether to restart the given apps now (single dialog for multiple apps); restarts on confirm. */
export async function promptRestartApps(appNames: string[]): Promise<void> {
  const unique = [...new Set(appNames)];
  if (unique.length === 0) return;
  if (unique.length === 1) return promptRestart(unique[0]);
  const shouldRestart = await confirmAlert({
    title: `Restart ${unique.length} apps?`,
    message: `Shortcut changes take effect after these apps restart:\n${unique.join(", ")}\nUnsaved work may be lost.`,
    primaryAction: { title: "Restart Apps" },
    dismissAction: { title: "Later" },
  });
  if (!shouldRestart) return;
  const failed: string[] = [];
  for (const appName of unique) {
    await restartApp(appName).catch(() => failed.push(appName));
  }
  if (failed.length) {
    await showToast({ style: Toast.Style.Failure, title: "Failed to restart some apps", message: failed.join(", ") });
  }
}
