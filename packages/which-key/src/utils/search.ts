/**
 * Search utilities for matching menu items by name AND keyboard shortcuts.
 * Shortcut queries are a Which Key extension; text matching mirrors Raycast's
 * built-in Search Menu Bar Items matcher (weights, separator table, threshold)
 * so results stay consistent with the built-in command.
 */

import { transliterate } from "transliteration";

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
  const normalized = query.trimStart().toLowerCase();
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
 * Reorder a shortcut's modifier glyphs to the standard macOS display order
 * (fn, then ⌃ ⌥ ⇧ ⌘) while preserving the key part exactly.
 * e.g. "⌘⌃S" → "⌃⌘S", "⌘⌥⇧T" → "⌥⇧⌘T", "⌥Space" → "⌥Space".
 */
export function formatShortcut(shortcut: string): string {
  if (!shortcut) return shortcut;
  let hasFn = false;
  let rest = shortcut;
  if (rest.startsWith("fn")) {
    hasFn = true;
    rest = rest.slice(2);
  }
  const mods: string[] = [];
  let key = "";
  for (const ch of rest) {
    if (["⌃", "⌥", "⇧", "⌘"].includes(ch)) mods.push(ch);
    else key += ch;
  }
  const order: Record<string, number> = { "⌃": 0, "⌥": 1, "⇧": 2, "⌘": 3 };
  mods.sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9));
  return `${hasFn ? "fn" : ""}${mods.join("")}${key}`;
}

// ─── Text matching (mirrors Raycast's Search Menu Bar Items matcher) ───

/** Separators the matcher may skip in queries and match interchangeably in text. */
const SEPARATOR_CHARS = new Set(["\t", "\n", " ", "-", ".", "/", "(", ")", "[", "]"]);

// Per-character scores: start-of-text hit (first query char) > word beginning
// (camelCase hump or after a separator) > separator-alias hit > plain hit.
const SCORE_FIRST = 4;
const SCORE_WORD_BEGINNING = 3;
const SCORE_DEFAULT = 2;
const SCORE_SEPARATOR_ALIAS = 1;
const SCORE_GAP_PENALTY = 1;
const MIN_SCORE = -(2 ** 53 - 1);
const MAX_SCORE = 2 ** 53 - 1;
/** Effective queries longer than this get a cheap subsequence prefilter. */
const PREFILTER_MIN_LENGTH = 2;

function isSeparatorCode(code: number): boolean {
  return code < 128 && SEPARATOR_CHARS.has(String.fromCharCode(code));
}

export interface PreparedText {
  /** Transliterated (non-ASCII) + lowercased text used for comparisons */
  normalizedText: string;
  /** camelCase hump positions (lower/digit → upper), used for scoring bonuses */
  wordBoundaries: Uint8Array;
}

/**
 * Prepare text for matching: transliteration attempt for non-ASCII characters
 * (same library Raycast bundles), then lowercase. Word boundaries are computed
 * on the pre-lowercase text so camelCase humps survive.
 */
export function prepareText(text: string): PreparedText {
  const transliterated = /\P{ASCII}/u.test(text) ? transliterate(text) : text;
  const length = transliterated.length;
  const wordBoundaries = new Uint8Array(length);
  for (let i = 1; i < length; i++) {
    const prev = transliterated.charCodeAt(i - 1);
    const cur = transliterated.charCodeAt(i);
    const prevIsWord = (prev >= 97 && prev <= 122) || (prev >= 48 && prev <= 57);
    if (prevIsWord && cur >= 65 && cur <= 90) wordBoundaries[i] = 1;
  }
  return { normalizedText: transliterated.toLowerCase(), wordBoundaries };
}

/** The full menu path joined by spaces (Raycast matches against this too). */
export function spaceJoinPath(breadcrumb: string): string {
  return breadcrumb.split(" → ").join(" ");
}

/** Query normalization: only leading whitespace is trimmed before matching. */
export function normalizeQuery(query: string): string {
  const trimmed = query.trimStart();
  return (/\P{ASCII}/u.test(trimmed) ? transliterate(trimmed) : trimmed).toLowerCase();
}

function wordBeginningScore(field: PreparedText, pos: number): number {
  const afterBoundary = field.wordBoundaries[pos] === 1 || isSeparatorCode(field.normalizedText.charCodeAt(pos - 1));
  return afterBoundary && !isSeparatorCode(field.normalizedText.charCodeAt(pos)) ? SCORE_WORD_BEGINNING : SCORE_DEFAULT;
}

/** Cheap subsequence existence check used before the scoring pass. */
function subsequenceExists(text: string, query: string): boolean {
  let cursor = 0;
  for (let q = 0; q < query.length; q++) {
    const queryChar = query.charCodeAt(q);
    if (isSeparatorCode(queryChar)) {
      if (cursor < text.length && isSeparatorCode(text.charCodeAt(cursor))) cursor++;
      continue;
    }
    let found = false;
    while (cursor < text.length) {
      if (text.charCodeAt(cursor) === queryChar) {
        cursor++;
        found = true;
        break;
      }
      cursor++;
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Two-row rolling score buffer. The row bookkeeping mirrors Raycast's matcher:
 * a skipped separator frees its row again unless it trails the query, so the
 * final score of a trailing-separator query is read from the previous slot.
 */
class ScoreRows {
  private readonly width: number;
  private rows = -1;
  private readonly storage: number[];

  constructor(width: number) {
    this.width = width;
    this.storage = new Array(Math.max(2 * width, 128)).fill(MIN_SCORE);
  }

  startRow(): void {
    this.rows += 1;
  }

  ignoreRow(): void {
    this.rows -= 1;
  }

  setColumn(col: number, score: number): void {
    this.storage[this.rowOffset + col] = score;
  }

  previousRowColumn(col: number): number {
    return this.storage[((this.rows - 1) % 2) * this.width + col] ?? MIN_SCORE;
  }

  maxScore(): number {
    const start = this.rowOffset;
    let max = MIN_SCORE;
    for (let i = start; i < start + this.width; i++) {
      if (this.storage[i] > max) max = this.storage[i];
    }
    return max;
  }

  private get rowOffset(): number {
    return (this.rows % 2) * this.width;
  }
}

/** Result of scoring one field: exact hit, no match, or fuzzy score + skipped separators. */
export type FieldMatch = "exact" | "unmatched" | { score: number; skipped: number };

/**
 * Score one prepared field against a normalized query.
 * Ordered character-sequence matching: consecutive hits add the per-position
 * weight, gapped hits lose SCORE_GAP_PENALTY regardless of gap length; query
 * separators may match any text separator (weight SCORE_SEPARATOR_ALIAS) or be
 * skipped entirely (counted in `skipped`).
 */
export function scoreFieldMatch(field: PreparedText, query: string): FieldMatch {
  const text = field.normalizedText;
  if (text === query) return "exact";

  const textLength = text.length;
  const queryLength = query.length;

  let separatorCount = 0;
  for (let i = 0; i < queryLength; i++) {
    if (isSeparatorCode(query.charCodeAt(i))) separatorCount++;
  }
  const effectiveLength = queryLength - separatorCount;
  if (effectiveLength > textLength) return "unmatched";
  if (effectiveLength > PREFILTER_MIN_LENGTH && !subsequenceExists(text, query)) return "unmatched";

  const rows = new ScoreRows(textLength);
  let lastMatch = -1; // leftmost hit position of the previous query character
  let skipped = 0;
  let matched = 0;

  for (let q = 0; q < queryLength; q++) {
    rows.startRow();
    const queryChar = query.charCodeAt(q);
    const queryIsSeparator = isSeparatorCode(queryChar);
    // Keep enough room on the right for the remaining effective characters
    const windowEnd = textLength - (effectiveLength - 1 - matched);
    let firstMatchPos = -1;
    let bestGapSource = MIN_SCORE;

    for (let pos = lastMatch + 1; pos < windowEnd; pos++) {
      if (lastMatch >= 0 && pos - 2 >= lastMatch) {
        const source = rows.previousRowColumn(pos - 2);
        if (source > bestGapSource) bestGapSource = source;
      }
      const textChar = text.charCodeAt(pos);
      const exactChar = textChar === queryChar;
      const separatorAlias = !exactChar && queryIsSeparator && isSeparatorCode(textChar);
      if (!exactChar && !separatorAlias) continue;

      const weight = separatorAlias ? SCORE_SEPARATOR_ALIAS : wordBeginningScore(field, pos);
      if (lastMatch < 0) {
        rows.setColumn(
          pos,
          separatorAlias ? SCORE_SEPARATOR_ALIAS : pos === 0 ? SCORE_FIRST : wordBeginningScore(field, pos),
        );
      } else {
        let next = MIN_SCORE;
        const consecutive = rows.previousRowColumn(pos - 1);
        if (consecutive > MIN_SCORE) next = consecutive + weight;
        if (bestGapSource > MIN_SCORE) next = Math.max(next, bestGapSource + weight - SCORE_GAP_PENALTY);
        rows.setColumn(pos, next);
      }
      if (firstMatchPos < 0) firstMatchPos = pos;
    }

    if (firstMatchPos >= 0) {
      lastMatch = firstMatchPos;
      matched += 1;
    } else if (queryIsSeparator) {
      skipped += 1;
      if (q < queryLength - 1) rows.ignoreRow();
    } else {
      return "unmatched";
    }
  }

  return { score: rows.maxScore(), skipped };
}

/**
 * High-threshold acceptance for a fuzzy score: score > 2 × (query length − skipped
 * separators). Exact matches pass directly; substring matches bypass the threshold
 * and are handled by the caller.
 */
function passesThreshold(match: FieldMatch, queryLength: number): boolean {
  if (match === "unmatched") return false;
  if (match === "exact") return true;
  return match.score > 2 * (queryLength - match.skipped);
}

export interface TextMatch {
  title: FieldMatch;
  path: FieldMatch;
  isMatching: boolean;
}

/** Match one item's title and space-joined path against a normalized query. */
export function matchTextFields(title: string, path: string, normalizedQuery: string): TextMatch {
  const preparedTitle = prepareText(title);
  const preparedPath = prepareText(path);
  const titleMatch = scoreFieldMatch(preparedTitle, normalizedQuery);
  const pathMatch = scoreFieldMatch(preparedPath, normalizedQuery);
  return {
    title: titleMatch,
    path: pathMatch,
    isMatching:
      preparedTitle.normalizedText.includes(normalizedQuery) ||
      preparedPath.normalizedText.includes(normalizedQuery) ||
      passesThreshold(titleMatch, normalizedQuery.length) ||
      passesThreshold(pathMatch, normalizedQuery.length),
  };
}

/** Convert a field match to the ranking score (exact ranks highest, unmatched lowest). */
export function matchScoreValue(match: FieldMatch): number {
  if (match === "unmatched") return MIN_SCORE;
  if (match === "exact") return MAX_SCORE;
  return match.score;
}

export { MIN_SCORE };

/**
 * A shortcut string made only of modifier glyphs (no key) is an AX artifact:
 * some macOS menu items (e.g. "Arrange in Front") report a modifier mask with
 * no key character. Raycast hides these; cached snapshots may still contain them.
 */
export function isModifierOnlyShortcut(shortcut: string): boolean {
  if (!shortcut) return false;
  const stripped = shortcut.replace(/fn/g, "").replace(/[⌃⌥⇧⌘]/g, "");
  return stripped.trim().length === 0;
}

/**
 * Check if a menu item matches the search query.
 * Matches against:
 *   1. Title and the space-joined full path (Raycast semantics: substring or
 *      high-threshold fuzzy, with transliteration)
 *   2. Keyboard shortcut (Which Key extension: e.g. "⌘⇧S" matches "cmd s")
 */
export function matchesQuery(item: { breadcrumb: string; shortcut: string; name: string }, query: string): boolean {
  const parsed = parseQuery(query);
  if (!parsed.text) return true; // empty query matches everything

  // Title or full-path text match (Raycast semantics)
  const textMatch = matchTextFields(item.name, spaceJoinPath(item.breadcrumb), normalizeQuery(parsed.text)).isMatching;

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
