/**
 * Per-app keybindings configuration.
 * Nested tree structure inspired by VS Code's whichkey.json.
 *
 * A binding can be either:
 *   - A leaf: has a `path` (triggers a menu item)
 *   - A group: has a `name` and `bindings` (sub-keys)
 *
 * To add a new binding:
 *   1. Use "Copy App Name" action in the app to get the exact app name
 *   2. Use "Copy Menu Path" action to get the exact breadcrumb path
 *   3. Add an entry below
 */

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

// ─── Per-app keybinding trees ───

const FINDER_BINDINGS: KeyBinding[] = [
  // File
  { key: "i", name: "Get Info", path: "File → Get Info" },
  { key: "o", name: "Open", path: "File → Open" },
  { key: "w", name: "Close Window", path: "File → Close Window" },
  { key: "n", name: "New Window", path: "File → New Finder Window" },
  { key: "f", name: "New Folder", path: "File → New Folder" },
  { key: "d", name: "Duplicate", path: "File → Duplicate" },
  { key: "m", name: "Move to Trash", path: "File → Move to Trash" },
  // Edit
  { key: "a", name: "Select All", path: "Edit → Select All" },
  { key: "c", name: "Copy", path: "Edit → Copy" },
  { key: "v", name: "Paste", path: "Edit → Paste" },
  { key: "z", name: "Undo", path: "Edit → Undo" },
  // View
  { key: "1", name: "Icons View", path: "View → as Icons" },
  { key: "2", name: "List View", path: "View → as List" },
  { key: "3", name: "Columns View", path: "View → as Columns" },
  { key: "4", name: "Gallery View", path: "View → as Gallery" },
  // Group By
  {
    key: "g",
    name: "Group By",
    bindings: [
      { key: "n", name: "Name", path: "View → Group By → Name" },
      { key: "k", name: "Kind", path: "View → Group By → Kind" },
      { key: "d", name: "Date Last Opened", path: "View → Group By → Date Last Opened" },
      { key: "a", name: "Date Added", path: "View → Group By → Date Added" },
      { key: "m", name: "Date Modified", path: "View → Group By → Date Modified" },
      { key: "s", name: "Size", path: "View → Group By → Size" },
      { key: "t", name: "Tags", path: "View → Group By → Tags" },
    ],
  },
  // Sort Groups By
  {
    key: "s",
    name: "Sort Groups By",
    bindings: [
      { key: "n", name: "Name", path: "View → Sort Groups By → Name" },
      { key: "k", name: "Kind", path: "View → Sort Groups By → Kind" },
      { key: "d", name: "Date Last Opened", path: "View → Sort Groups By → Date Last Opened" },
      { key: "a", name: "Date Added", path: "View → Sort Groups By → Date Added" },
      { key: "m", name: "Date Modified", path: "View → Sort Groups By → Date Modified" },
      { key: "s", name: "Size", path: "View → Sort Groups By → Size" },
      { key: "t", name: "Tags", path: "View → Sort Groups By → Tags" },
    ],
  },
  // Go
  { key: "h", name: "Home", path: "Go → Home" },
  { key: "r", name: "Recents", path: "Go → Recents" },
  { key: "/", name: "Go to Folder", path: "Go → Go to Folder…" },
];

const VS_CODE_BINDINGS: KeyBinding[] = [
  // File
  {
    key: "f",
    name: "File",
    bindings: [
      { key: "s", name: "Save", path: "File → Save" },
      { key: "a", name: "Save All", path: "File → Save All" },
      { key: "n", name: "New File", path: "File → New Text File" },
      { key: "o", name: "Open", path: "File → Open…" },
      { key: "w", name: "Close Editor", path: "File → Close Editor" },
    ],
  },
  // Edit
  {
    key: "e",
    name: "Edit",
    bindings: [
      { key: "z", name: "Undo", path: "Edit → Undo" },
      { key: "/", name: "Toggle Comment", path: "Edit → Toggle Line Comment" },
      { key: "f", name: "Find", path: "Edit → Find" },
      { key: "h", name: "Replace", path: "Edit → Replace" },
    ],
  },
  // View
  {
    key: "v",
    name: "View",
    bindings: [
      { key: "p", name: "Command Palette", path: "View → Command Palette…" },
      { key: "b", name: "Toggle Sidebar", path: "View → Appearance → Primary Side Bar" },
    ],
  },
  // Terminal
  { key: "t", name: "New Terminal", path: "Terminal → New Terminal" },
  // Run
  { key: "d", name: "Start Debugging", path: "Run → Start Debugging" },
  { key: "r", name: "Run Without Debug", path: "Run → Run Without Debugging" },
];

// ─── Registry ───

/** App name → keybinding tree. Add new apps here. */
const KEYBINDING_REGISTRY: Record<string, KeyBinding[]> = {
  Finder: FINDER_BINDINGS,
  "Code - Insiders": VS_CODE_BINDINGS,
  "Visual Studio Code": VS_CODE_BINDINGS,
  // Add more apps here...
};

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
