import type { FlatMenuItem } from "./menuItems";
import { BROWSER_MENUS } from "../config/browserMenus";

/**
 * Normalize a menu item title for whitelist comparison:
 * trim, collapse whitespace, and strip a trailing ellipsis ("…" ≡ "...").
 */
export function normalizeMenuName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(\.{3}|…)\s*$/, "")
    .trim();
}

/**
 * Filter out dynamic browser content (bookmarks, history, open tabs) using
 * the whitelist in `config/browserMenus.ts`. Only menus configured for the
 * given bundle id are filtered; every other browser/menu passes through.
 */
export function filterBrowserMenuItems(items: FlatMenuItem[], bundleId: string): FlatMenuItem[] {
  const menus = BROWSER_MENUS[bundleId];
  if (!menus) return items;
  return items.filter((item) => {
    // Breadcrumb has no app prefix, so segment 0 is the top-level menu title
    const topMenu = item.breadcrumb.split(" → ")[0];
    const allowed = menus[topMenu];
    if (!allowed) return true; // menu not managed → keep as-is
    return allowed.some((name) => normalizeMenuName(name) === normalizeMenuName(item.name));
  });
}
