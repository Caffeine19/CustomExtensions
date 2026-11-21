import fs from "fs";
import os from "os";
import path from "path";

// ─── Types ───

/**
 * A pinned menu item record persisted to `~/.config/which-key/pins.json`,
 * following the remaps.json ledger convention.
 * Mirrors Raycast's AppMenuBarItemsRepository (list / pin / unpin / move up / down):
 * pinning only changes display order — execution always goes by menu path.
 */
export interface PinEntry {
  /** Target application display name, e.g. "Finder" */
  app: string;
  /** Application key: bundle id, falling back to the app name when missing */
  appKey: string;
  /** Stable menu item id (the breadcrumb, deduped upstream) */
  itemId: string;
  /** Full menu breadcrumb without app prefix, e.g. "File → Open" */
  breadcrumb: string;
  /** Leaf title of the menu item */
  name: string;
  /** Display order within the app (ascending) */
  order: number;
  /** ISO timestamp of the last update */
  updatedAt: string;
}

// ─── Storage ───

// Ledger location: user-visible and dotfiles-friendly, survives extension reinstalls
const pinDir = () => path.join(os.homedir(), ".config", "which-key");
const pinFile = () => path.join(pinDir(), "pins.json");

/** Load all pin entries; a missing or corrupt file yields an empty list. */
export async function loadPins(): Promise<PinEntry[]> {
  try {
    const raw = await fs.promises.readFile(pinFile(), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PinEntry[]) : [];
  } catch {
    return [];
  }
}

/** Write the full pin list back to disk, creating the config directory on demand. */
export async function savePins(pins: PinEntry[]): Promise<void> {
  await fs.promises.mkdir(pinDir(), { recursive: true });
  await fs.promises.writeFile(pinFile(), JSON.stringify(pins, null, 2), "utf-8");
}

// ─── Repository operations (per app) ───

/** Pins for one app in saved display order. */
export async function listPins(appKey: string): Promise<PinEntry[]> {
  const pins = await loadPins();
  return pins.filter((p) => p.appKey === appKey).sort((a, b) => a.order - b.order);
}

/** Next display order for an app (append to the end). */
function nextOrder(appPins: PinEntry[]): number {
  return appPins.reduce((max, p) => Math.max(max, p.order), -1) + 1;
}

/**
 * Pin a menu item (idempotent: pinning an already-pinned item keeps its place).
 * Returns the updated pin list for the app.
 */
export async function pinItem(entry: {
  app: string;
  appKey: string;
  itemId: string;
  breadcrumb: string;
  name: string;
}): Promise<PinEntry[]> {
  const pins = await loadPins();
  const appPins = pins.filter((p) => p.appKey === entry.appKey).sort((a, b) => a.order - b.order);
  if (appPins.some((p) => p.itemId === entry.itemId)) return appPins;

  const newEntry: PinEntry = {
    ...entry,
    order: nextOrder(appPins),
    updatedAt: new Date().toISOString(),
  };
  await savePins([...pins, newEntry]);
  return [...appPins, newEntry];
}

/** Unpin a menu item. Returns the updated pin list for the app. */
export async function unpinItem(appKey: string, itemId: string): Promise<PinEntry[]> {
  const pins = await loadPins();
  const remaining = pins.filter((p) => !(p.appKey === appKey && p.itemId === itemId));
  if (remaining.length !== pins.length) await savePins(remaining);
  return remaining.filter((p) => p.appKey === appKey).sort((a, b) => a.order - b.order);
}

/**
 * Move a pinned item up or down in its app's saved order.
 * Returns the updated pin list for the app.
 */
export async function movePin(appKey: string, itemId: string, direction: "up" | "down"): Promise<PinEntry[]> {
  const pins = await loadPins();
  const appPins = pins.filter((p) => p.appKey === appKey).sort((a, b) => a.order - b.order);
  const index = appPins.findIndex((p) => p.itemId === itemId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= appPins.length) return appPins;

  [appPins[index], appPins[swapWith]] = [appPins[swapWith], appPins[index]];
  // Renumber so order stays dense and stable
  appPins.forEach((p, i) => {
    p.order = i;
    p.updatedAt = new Date().toISOString();
  });

  const others = pins.filter((p) => p.appKey !== appKey);
  await savePins([...others, ...appPins]);
  return appPins;
}
