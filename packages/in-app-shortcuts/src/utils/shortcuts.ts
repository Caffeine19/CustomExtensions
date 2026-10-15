import { alphabetical, fork, group, mapEntries, sort } from "radash";
import { callHammerspoon } from "./call-hammerspoon";

/** One in-app shortcut entry, as exported by `__IN_APP_SHORTCUTS__.list()` in Hammerspoon. */
export interface InAppShortcut {
  /** Unique id */
  id: string;
  /** Resolved application name */
  appName: string;
  /** Name passed to `registerInAppShortcut` */
  requestedAppName: string;
  /** Glyph label */
  hotkeyLabel: string;
  /** Raw modifiers */
  mods: string[];
  /** Raw key character */
  key: string;
  /** Human-readable description of what the shortcut does */
  description?: string;
  /** Whether the hotkey is currently enabled */
  enabled: boolean;
}

/** Shortcuts grouped under one application. */
export interface AppShortcutGroup {
  app: string;
  items: InAppShortcut[];
}

/**
 * Fetch all registered in-app shortcuts from Hammerspoon
 */
export async function fetchShortcuts(): Promise<InAppShortcut[]> {
  const res = await callHammerspoon(`return __IN_APP_SHORTCUTS__.list()`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(res);
  } catch {
    throw new Error("Unexpected response from Hammerspoon — try reloading the Hammerspoon config (hs.reload()).");
  }

  return parsed as InAppShortcut[];
}

/** Group shortcuts by application name, sections sorted alphabetically. */
export function groupByApp(shortcuts: InAppShortcut[]): AppShortcutGroup[] {
  const grouped = mapEntries(
    group(shortcuts, (s) => s.appName),
    (app, items) => [app, { app, items: items ?? [] }],
  );
  return alphabetical(Object.values(grouped), (g) => g.app);
}

/** Modifier glyphs in standard macOS display order. */
const MODS = ["⌃", "⌥", "⇧", "⌘"];

/** Reorder modifiers to ⌃⌥⇧⌘ and uppercase the key: "⌘⌥⇧i" → "⌥⇧⌘I", "⌘\\" stays "⌘\\". */
export function formatShortcut(shortcut: string): string {
  const [mods, keys] = fork([...shortcut], (ch) => MODS.includes(ch));
  const key = keys.join("");
  return sort(mods, (ch) => MODS.indexOf(ch)).join("") + (key.length === 1 ? key.toUpperCase() : key);
}
