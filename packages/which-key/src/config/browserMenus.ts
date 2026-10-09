/** bundleId → top-level menu title → allowed leaf item titles. */
export const BROWSER_MENUS: Record<string, Record<string, string[]>> = {
  "com.microsoft.edgemac": {
    Favorites: ["Open Bookmarks Manager", "Bookmark This Tab…", "Bookmark All Tabs…"],
    History: ["Home", "Back", "Forward", "Show Full History"],
    Tab: [
      "New Tab Below",
      "Select Next Tab",
      "Select Previous Tab",
      "Duplicate",
      "Duplicate Selected Tab",
      "Switch to Last Active Tab",
      "Mute Tab",
      "Mute Selected Site",
      "Pin Tab",
      "Pin Selected Tab",
      "Group Tab",
      "Group Selected Tab",
      "Close Other Tabs",
      "Close Tabs Below",
      "Move Tab to New Window",
      "Add Tab to New Split View",
      "Search Tabs…",
    ],
  },
};
