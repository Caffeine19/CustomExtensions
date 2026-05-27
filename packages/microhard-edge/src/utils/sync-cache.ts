import { Cache } from "@raycast/api";

import { SyncImport } from "../types/sync-workspace";

export const SYNC_CACHE_KEY = "sync-import-v1";

const cache = new Cache({ namespace: "workspace-sync" });

export const saveSyncImport = (data: SyncImport): void => {
  cache.set(SYNC_CACHE_KEY, JSON.stringify(data));
};

export const loadSyncImport = (): SyncImport | null => {
  const raw = cache.get(SYNC_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncImport;
  } catch {
    return null;
  }
};

export const clearSyncImport = (): void => {
  cache.remove(SYNC_CACHE_KEY);
};
