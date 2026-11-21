import { matchScoreValue, matchTextFields, normalizeQuery, spaceJoinPath } from "./search";

// ─── Result ordering (mirrors Raycast's Search Menu Bar Items comparator) ───

export interface RankItem {
  /** Leaf title of the menu item */
  name: string;
  /** Full menu breadcrumb without app prefix */
  breadcrumb: string;
}

/**
 * Sort matched items by relevance:
 *   1. pinned before unpinned
 *   2. with normalized query length > 3: title exact match, then path exact match
 *   3. title score, then path score
 *   4. full ties: saved pin order (when both pinned), then localized title
 */
export function rankItems<T extends RankItem>(items: T[], query: string, pinIndexOf: (item: T) => number): T[] {
  const normalizedQuery = normalizeQuery(query);
  const queryLength = normalizedQuery.length;

  const decorated = items.map((item) => {
    const pin = pinIndexOf(item);
    return {
      item,
      pin: pin >= 0 ? pin : undefined,
      match: matchTextFields(item.name, spaceJoinPath(item.breadcrumb), normalizedQuery),
    };
  });

  decorated.sort((a, b) => {
    if (a.pin === undefined && b.pin !== undefined) return 1;
    if (a.pin !== undefined && b.pin === undefined) return -1;

    if (queryLength > 3) {
      if (b.match.title === "exact" && a.match.title !== "exact") return 1;
      if (a.match.title === "exact" && b.match.title !== "exact") return -1;
      if (b.match.path === "exact" && a.match.path !== "exact") return 1;
      if (a.match.path === "exact" && b.match.path !== "exact") return -1;
    }

    const titleA = matchScoreValue(a.match.title);
    const titleB = matchScoreValue(b.match.title);
    if (titleA !== titleB) return titleB - titleA;

    const pathA = matchScoreValue(a.match.path);
    const pathB = matchScoreValue(b.match.path);
    if (pathA !== pathB) return pathB - pathA;

    if (a.pin !== undefined && b.pin !== undefined && a.pin !== b.pin) return a.pin - b.pin;
    return a.item.name.localeCompare(b.item.name);
  });

  return decorated.map((d) => d.item);
}
