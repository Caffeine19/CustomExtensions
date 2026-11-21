import { LocalStorage } from "@raycast/api";
import type { FlatMenuItem } from "./menuItems";

// ─── Snapshot cache (mirrors Raycast's snapshotPerPid + useCache semantics) ───

/**
 * A cached menu snapshot for one application.
 * The snapshot is stored raw (before any client-side filtering) so preference
 * changes apply without re-reading the menu bar.
 */
export interface MenuSnapshot {
  /** PID of the menu-bar-owning process at capture time (invalidation signal) */
  pid?: number;
  /** Localized name of the menu-bar-owning app */
  appName: string;
  /** Bundle id of the menu-bar-owning app ("" when unknown) */
  bundleId: string;
  items: FlatMenuItem[];
  savedAt: string;
}

const cacheKeyFor = (appKey: string) => `menu-snapshot:${appKey}`;

/** Application cache key: bundle id, falling back to the app name. */
export function appCacheKey(bundleId: string | undefined, appName: string): string {
  return bundleId || appName;
}

/**
 * Read the cached snapshot for an app. Returns undefined when absent or corrupt.
 * The cached snapshot is served immediately (first paint) and replaced by the
 * fresh read; it survives command re-runs, unlike the per-launch fetch.
 */
export async function readSnapshot(appKey: string): Promise<MenuSnapshot | undefined> {
  try {
    const raw = await LocalStorage.getItem<string>(cacheKeyFor(appKey));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as MenuSnapshot;
    if (!parsed || !Array.isArray(parsed.items)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Persist a fresh snapshot (write-through after the refresh read).
 * A snapshot from a different PID fully replaces the old one — matching
 * Raycast's per-process snapshots being dropped when the app exits.
 */
export async function writeSnapshot(appKey: string, snapshot: MenuSnapshot): Promise<void> {
  try {
    await LocalStorage.setItem(cacheKeyFor(appKey), JSON.stringify(snapshot));
  } catch {
    // Cache writes are best-effort; a failure must never break the listing
  }
}

/**
 * Guards against stale async results overwriting fresh state: when the app
 * changes or a newer request starts, older in-flight results are dropped
 * (Raycast uses a cleanup flag the same way).
 */
export class StaleGuard {
  private token = 0;

  /** Start a new request; any previously issued token becomes stale. */
  begin(): number {
    this.token += 1;
    return this.token;
  }

  /** Whether the given token still identifies the latest request. */
  isCurrent(token: number): boolean {
    return token === this.token;
  }
}
