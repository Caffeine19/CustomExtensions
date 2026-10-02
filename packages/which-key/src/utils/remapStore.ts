import fs from "fs";
import os from "os";
import path from "path";

// ─── Types ───

/** A single shortcut remap record persisted to `~/.config/which-key/remaps.json` */
export interface RemapEntry {
  /** Target application display name, e.g. "Shottr" */
  app: string;
  /** Target application bundle id (also the `defaults` domain), e.g. "cc.ffitch.shottr" */
  bundleId: string;
  /** Full menu breadcrumb, e.g. "Shottr → Tools → Pin to Screen" */
  breadcrumb: string;
  /** NSUserKeyEquivalents dictionary key: exact leaf title, or "TopLevel > … > Leaf" when duplicated */
  menu: string;
  /** Human-readable shortcut glyphs, e.g. "⌘⌥A" */
  shortcut: string;
  /** NSUserKeyEquivalents encoded value, e.g. "@~a" */
  encoded: string;
  /** ISO timestamp of the last update */
  updatedAt: string;
}

// ─── Storage ───

// Ledger location: user-visible and dotfiles-friendly, survives extension reinstalls
const REMAP_DIR = path.join(os.homedir(), ".config", "which-key");
const REMAP_FILE = path.join(REMAP_DIR, "remaps.json");

/** Load all remap entries; a missing or corrupt file yields an empty list. */
export async function loadRemaps(): Promise<RemapEntry[]> {
  try {
    const raw = await fs.promises.readFile(REMAP_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RemapEntry[]) : [];
  } catch {
    return [];
  }
}

/** Write the full remap list back to disk, creating the config directory on demand. */
export async function saveRemaps(remaps: RemapEntry[]): Promise<void> {
  await fs.promises.mkdir(REMAP_DIR, { recursive: true });
  await fs.promises.writeFile(REMAP_FILE, JSON.stringify(remaps, null, 2), "utf-8");
}

/** Find an existing remap for the given app + menu item. */
export function findRemap(remaps: RemapEntry[], bundleId: string, breadcrumb: string): RemapEntry | undefined {
  return remaps.find((r) => r.bundleId === bundleId && r.breadcrumb === breadcrumb);
}

/** Insert or replace the remap for (bundleId, breadcrumb), returning the updated list. */
export async function upsertRemap(entry: RemapEntry): Promise<RemapEntry[]> {
  const remaps = await loadRemaps();
  const next = remaps.filter((r) => !(r.bundleId === entry.bundleId && r.breadcrumb === entry.breadcrumb));
  next.push(entry);
  await saveRemaps(next);
  return next;
}

/** Remove the remap for (bundleId, breadcrumb), returning the updated list. */
export async function removeRemap(bundleId: string, breadcrumb: string): Promise<RemapEntry[]> {
  const remaps = await loadRemaps();
  const next = remaps.filter((r) => !(r.bundleId === bundleId && r.breadcrumb === breadcrumb));
  await saveRemaps(next);
  return next;
}
