import { useMemo } from "react";

import { useCachedPromise } from "@raycast/utils";

import { loadAllSessions, rehydrateSessionDates } from "./session-reader";

/**
 * Load all VS Code Copilot chat sessions
 */
export function useAllSessions() {
  const { data: cachedSessions, isLoading, error, revalidate } = useCachedPromise(loadAllSessions, []);
  const sessions = useMemo(() => cachedSessions?.map(rehydrateSessionDates), [cachedSessions]);
  return { sessions, isLoading, error, revalidate };
}
