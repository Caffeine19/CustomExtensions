/**
 * Per-app keybindings logic.
 *
 * Configuration data (per-app binding trees) lives in `src/config/keybindings.ts`.
 * This module provides the types and matching/flatten logic.
 */

import { KEYBINDING_REGISTRY } from "../config/keybindings";

export interface KeyBinding {
  /** Single key character at this level */
  key: string;
  /** Display name for this binding */
  name: string;
  /** Menu item breadcrumb path (leaf node) */
  path?: string;
  /** Sub-bindings (group node) */
  bindings?: KeyBinding[];
}

// ─── Flatten tree into path list ───

export interface FlatBinding {
  /** Full key sequence (e.g. "sn") */
  key: string;
  /** Menu item breadcrumb path */
  path: string;
  /** Display name */
  name: string;
}

function flattenBindings(bindings: KeyBinding[], prefix = ""): FlatBinding[] {
  const result: FlatBinding[] = [];
  for (const b of bindings) {
    const fullKey = prefix + b.key;
    if (b.bindings) {
      // Group node: recurse into children
      result.push(...flattenBindings(b.bindings, fullKey));
    }
    if (b.path) {
      // Leaf node
      result.push({ key: fullKey, path: b.path, name: b.name });
    }
  }
  return result;
}

/**
 * Get flattened keybindings for the given app name.
 * Returns empty array if no bindings are configured.
 */
export function getKeyBindings(appName: string): FlatBinding[] {
  const tree = KEYBINDING_REGISTRY[appName];
  return tree ? flattenBindings(tree) : [];
}

/**
 * Get the raw keybinding tree for display purposes.
 */
export function getKeyBindingTree(appName: string): KeyBinding[] {
  return KEYBINDING_REGISTRY[appName] ?? [];
}

/**
 * Format a key sequence for display: "sn" → "s n", "S" → "S"
 */
export function formatKeySequence(key: string): string {
  return key.split("").join(" ");
}

/**
 * Match keybindings against user input.
 *
 * Returns:
 *   - { exact: binding } if input exactly matches one binding
 *   - { partial: true } if input is a prefix of one or more bindings
 */
export function matchKeyBinding(
  appName: string,
  input: string,
  items: { breadcrumb: string }[],
): { exact: { breadcrumb: string } | undefined; partial: boolean } {
  const bindings = getKeyBindings(appName);
  if (!bindings.length || !input) return { exact: undefined, partial: false };

  const lowerInput = input.toLowerCase();

  // Find exact match
  const exactBinding = bindings.find((b) => b.key.toLowerCase() === lowerInput);

  // Find partial matches (input is a prefix of some binding's key)
  const partialMatches = bindings.filter(
    (b) => b.key.toLowerCase().startsWith(lowerInput) && b.key.toLowerCase() !== lowerInput,
  );

  if (exactBinding) {
    const match = items.find((item) => item.breadcrumb === exactBinding.path);
    return { exact: match, partial: partialMatches.length > 0 };
  }

  return { exact: undefined, partial: partialMatches.length > 0 };
}
