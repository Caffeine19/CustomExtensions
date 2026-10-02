/**
 * Per-app keybindings configuration data.
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

import { KeyBinding } from "../utils/keybindings";

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

// Shared album list — used by both "Go to Albums" (View → Collections) and "Add to Albums" (Image → Add to)
const PHOTOS_ALBUM_BINDINGS: KeyBinding[] = [
  { key: "l", name: "Life", path: "View → Collections → Life" },
  { key: "w", name: "Wall", path: "View → Collections → Wall" },
  { key: "a", name: "Avatar", path: "View → Collections → Avatar" },
  { key: "m", name: "Meme", path: "View → Collections → Meme" },
  { key: "to", name: "Todo", path: "View → Collections → Todo" },
  { key: "j", name: "Joke", path: "View → Collections → Joke" },
  { key: "c", name: "Config", path: "View → Collections → Config" },
  { key: "b", name: "Bug", path: "View → Collections → Bug " },
  { key: "te", name: "Tech", path: "View → Collections → Tech" },
  { key: "g", name: "Game", path: "View → Collections → Game" },
  { key: "sk", name: "Skin", path: "View → Collections → Skin" },
  { key: "d", name: "Cards", path: "View → Collections → Cards" },
  { key: "sc", name: "Screenshot", path: "View → Collections → Screenshot" },
  { key: "i", name: "MobileIcon", path: "View → Collections → MobileIcon" },
  { key: "k", name: "Trash", path: "View → Collections → Trash" },
];

// Same albums but via "Image → Add to" path
const PHOTOS_ADD_TO_BINDINGS: KeyBinding[] = [
  { key: "n", name: "New Album", path: "Image → Add to → New Album" },
  { key: "l", name: "Life", path: "Image → Add to → Life" },
  { key: "w", name: "Wall", path: "Image → Add to → Wall" },
  { key: "a", name: "Avatar", path: "Image → Add to → Avatar" },
  { key: "m", name: "Meme", path: "Image → Add to → Meme" },
  { key: "to", name: "Todo", path: "Image → Add to → Todo" },
  { key: "j", name: "Joke", path: "Image → Add to → Joke" },
  { key: "c", name: "Config", path: "Image → Add to → Config" },
  { key: "b", name: "Bug", path: "Image → Add to → Bug " },
  { key: "te", name: "Tech", path: "Image → Add to → Tech" },
  { key: "g", name: "Game", path: "Image → Add to → Game" },
  { key: "sk", name: "Skin", path: "Image → Add to → Skin" },
  { key: "d", name: "Cards", path: "Image → Add to → Cards" },
  { key: "sc", name: "Screenshot", path: "Image → Add to → Screenshot" },
  { key: "i", name: "MobileIcon", path: "Image → Add to → MobileIcon" },
  { key: "k", name: "Trash", path: "Image → Add to → Trash" },
];

const PHOTOS_BINDINGS: KeyBinding[] = [
  // View → Photos
  { key: "l", name: "Library", path: "View → Photos → Library" },
  // View → Collections (go to album)
  { key: "g", name: "Go to Albums", bindings: PHOTOS_ALBUM_BINDINGS },
  // Image → Add to (add selected photo to album)
  { key: "a", name: "Add to Albums", bindings: PHOTOS_ADD_TO_BINDINGS },
  // View → Filter By
  {
    key: "f",
    name: "Filter By",
    bindings: [
      { key: "a", name: "All Items", path: "View → Filter By → All Items" },
      { key: "f", name: "Favorites", path: "View → Filter By → Favorites" },
      { key: "e", name: "Edited", path: "View → Filter By → Edited" },
      { key: "p", name: "Photos", path: "View → Filter By → Photos" },
      { key: "v", name: "Videos", path: "View → Filter By → Videos" },
      { key: "s", name: "Screenshots", path: "View → Filter By → Screenshots" },
      { key: "n", name: "Not in an Album", path: "View → Filter By → Not in an Album" },
      { key: "k", name: "Keyword Manager…", path: "View → Filter By → Keyword Manager…" },
    ],
  },
];

// ─── Registry ───

/** App name → keybinding tree. Add new apps here. */
export const KEYBINDING_REGISTRY: Record<string, KeyBinding[]> = {
  Finder: FINDER_BINDINGS,
  Photos: PHOTOS_BINDINGS,
  // Add more apps here...
};
