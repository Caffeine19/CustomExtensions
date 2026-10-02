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

/** Remove one NSUserKeyEquivalents entry, preserving the user's other App Shortcuts. */
export async function removeKeyEquivalent(bundleId: string, menu: string): Promise<void> {
  let xml: string;
  try {
    // Read the whole domain as JSON so a single entry can be dropped safely
    xml = await run("defaults", ["export", bundleId, "-"]);
  } catch {
    return; // domain does not exist → nothing to clear
  }
  try {
    const json = await run("plutil", ["-convert", "json", "-", "-o", "-"], xml);
    const domain = JSON.parse(json) as Record<string, unknown>;
    const dict = domain.NSUserKeyEquivalents as Record<string, string> | undefined;
    if (!dict || !(menu in dict)) return; // entry already gone
    delete dict[menu];
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
