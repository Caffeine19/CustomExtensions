import { callHammerspoon } from "./call-hammerspoon";

/** One in-app shortcut entry, as exported by `__IN_APP_SHORTCUTS__.list()` in Hammerspoon. */
export interface InAppShortcut {
  /** Unique id, `<appName>:<hotkeyLabel>` */
  id: string;
  /** Resolved application name, e.g. "Microsoft Edge" */
  appName: string;
  /** Name passed to `registerInAppShortcut`, e.g. "edge" */
  requestedAppName: string;
  /** Glyph label, e.g. "⌘b" */
  hotkeyLabel: string;
  /** Raw modifiers, e.g. ["cmd", "alt"] */
  mods: string[];
  /** Raw key character, e.g. "b" */
  key: string;
  /** Human-readable description of what the shortcut does */
  description?: string;
  /** Whether the hotkey is currently enabled (i.e. its app is focused) */
  enabled: boolean;
}

/** Shortcuts grouped under one application. */
export interface AppShortcutGroup {
  app: string;
  items: InAppShortcut[];
}

/**
 * Fetch all registered in-app shortcuts from Hammerspoon (live query).
 * Throws if Hammerspoon is unreachable or answers with something unexpected
 * (e.g. an outdated config without `__IN_APP_SHORTCUTS__`).
 */
export async function fetchShortcuts(): Promise<InAppShortcut[]> {
  const res = await callHammerspoon(`return __IN_APP_SHORTCUTS__.list()`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(res);
  } catch {
    throw new Error("Unexpected response from Hammerspoon — try reloading the Hammerspoon config (hs.reload()).");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected __IN_APP_SHORTCUTS__.list() payload — try reloading the Hammerspoon config.");
  }

  return parsed as InAppShortcut[];
}

/** Group shortcuts by application name, sections sorted alphabetically. */
export function groupByApp(shortcuts: InAppShortcut[]): AppShortcutGroup[] {
  const map = new Map<string, InAppShortcut[]>();
  for (const s of shortcuts) {
    const group = map.get(s.appName);
    if (group) group.push(s);
    else map.set(s.appName, [s]);
  }
  return Array.from(map, ([app, items]) => ({ app, items })).sort((a, b) => a.app.localeCompare(b.app));
}
