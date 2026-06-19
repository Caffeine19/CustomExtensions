/**
 * Search utilities for matching menu items by name AND keyboard shortcuts.
 * Inspired by VS Code's keybinding search implementation.
 */

// ─── Modifier aliases ───
// Maps various input forms → canonical symbol
const MODIFIER_ALIASES: Record<string, string> = {
  // Command / Meta
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
  "⌘": "⌘",
  // Shift
  shift: "⇧",
  "⇧": "⇧",
  // Option / Alt
  opt: "⌥",
  option: "⌥",
  alt: "⌥",
  "⌥": "⌥",
  // Control
  ctrl: "⌃",
  control: "⌃",
  "⌃": "⌃",
  // Fn / Globe
  fn: "fn",
  globe: "fn",
};

/**
 * Parse a search query into structured parts.
 * Supports formats like:
 *   "cmd b"        → modifiers: ["⌘"], key: "b"
 *   "command shift s" → modifiers: ["⌘", "⇧"], key: "s"
 *   "⌘B"           → modifiers: ["⌘"], key: "b"
 *   "⇧⌘S"          → modifiers: ["⌘", "⇧"], key: "s"
 *   'cmd "b"'      → modifiers: ["⌘"], key: "b", exactKey (exact match only)
 *   "save"         → text: "save"  (no shortcut match)
 *   "file save"    → text: "file save" (no shortcut match)
 */
function parseQuery(query: string): {
  /** Modifier symbols to match (e.g. ["⌘", "⇧"]) */
  modifiers: string[];
  /** Key character to match (e.g. "b") */
  key: string;
  /** Whether the key should be matched exactly (triggered by "" quotes) */
  exactKey: boolean;
  /** Whether the query looks like a shortcut search */
  isShortcutQuery: boolean;
  /** Original text for fallback text search */
  text: string;
} {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { modifiers: [], key: "", exactKey: false, isShortcutQuery: false, text: "" };
  }

  // Detect exact key matching via double quotes: cmd "b", "s", ⇧⌘"a"
  let exactKey = false;
  let workQuery = normalized;
  const quotedKey = workQuery.match(/"([^"]+)"/);
  if (quotedKey) {
    exactKey = true;
    workQuery = workQuery.replace(quotedKey[0], quotedKey[1]);
  }

  // Try to extract Unicode modifier symbols directly from the query
  const unicodeMods: string[] = [];
  let remaining = workQuery;
  for (const sym of ["⌘", "⇧", "⌥", "⌃"]) {
    while (remaining.includes(sym)) {
      unicodeMods.push(sym);
      remaining = remaining.replace(sym, "");
    }
  }

  // If we found Unicode modifiers, extract the remaining key
  if (unicodeMods.length > 0) {
    const key = remaining.trim();
    return {
      modifiers: unicodeMods,
      key,
      exactKey,
      isShortcutQuery: true,
      text: normalized,
    };
  }

  // Split into words and classify each as modifier or key
  const words = workQuery.split(/[\s+]+/).filter(Boolean);
  const mods: string[] = [];
  let keyChar = "";

  for (const word of words) {
    const mapped = MODIFIER_ALIASES[word];
    if (mapped) {
      if (!mods.includes(mapped)) mods.push(mapped);
    } else {
      // Could be a key character (single char like "b", "s", "/" etc.)
      // or a key name (like "escape", "enter", "tab", "space", etc.)
      keyChar = word;
    }
  }

  const isShortcutQuery = mods.length > 0;

  return {
    modifiers: mods,
    key: keyChar,
    exactKey,
    isShortcutQuery,
    text: normalized,
  };
}

/**
 * Normalize a shortcut string (e.g. "⌘⇧S") into a sorted set of modifiers + key.
 */
function normalizeShortcut(shortcut: string): { mods: string; key: string } {
  const mods: string[] = [];
  let remaining = shortcut;

  // Extract "fn" prefix (always comes first in formatMod output)
  if (remaining.startsWith("fn")) {
    mods.push("fn");
    remaining = remaining.slice(2);
  }

  // Extract single-char Unicode modifiers and key
  let key = "";
  for (const ch of remaining) {
    if (["⌘", "⇧", "⌥", "⌃"].includes(ch)) {
      mods.push(ch);
    } else if (ch.trim()) {
      key += ch;
    }
  }

  // Sort modifiers: fn first, then ⌃⌥⇧⌘
  const order = { fn: -1, "⌃": 0, "⌥": 1, "⇧": 2, "⌘": 3 };
  mods.sort((a, b) => (order[a as keyof typeof order] ?? 9) - (order[b as keyof typeof order] ?? 9));

  return { mods: mods.join(""), key: key.toLowerCase() };
}

/**
 * Check if a menu item matches the search query.
 * Matches against:
 *   1. Breadcrumb text (e.g. "File → Save As…")
 *   2. Keyboard shortcut (e.g. "⌘⇧S" matches "cmd s", "command shift s", "⇧⌘S")
 */
export function matchesQuery(item: { breadcrumb: string; shortcut: string; name: string }, query: string): boolean {
  const parsed = parseQuery(query);
  if (!parsed.text) return true; // empty query matches everything

  // Always check text match against breadcrumb and name (case-insensitive)
  const lowerBreadcrumb = item.breadcrumb.toLowerCase();
  const lowerName = item.name.toLowerCase();
  const textMatch = lowerBreadcrumb.includes(parsed.text) || lowerName.includes(parsed.text);

  // If query has modifiers, also check shortcut match
  if (parsed.isShortcutQuery && item.shortcut) {
    const normalized = normalizeShortcut(item.shortcut);

    // Check all query modifiers are present in the shortcut
    const allModsMatch = parsed.modifiers.every((mod) => normalized.mods.includes(mod));

    // Check key matches (if specified)
    // When exactKey is set (via "" quotes), use exact comparison
    const keyMatch =
      !parsed.key || (parsed.exactKey ? normalized.key === parsed.key : normalized.key.includes(parsed.key));

    if (allModsMatch && keyMatch) return true;
  }

  // Fallback: pure text search also works for shortcuts
  // e.g. typing "⌘S" in the search bar will match via text
  if (textMatch) return true;

  // Also match shortcut text directly (e.g. user types "⌘S")
  if (item.shortcut && item.shortcut.toLowerCase().includes(parsed.text)) return true;

  return false;
}
