import { Toast, showToast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";

import { Effect, Result } from "effect";

import { type SessionLoadResult, loadAllSessions } from "../services/sessions/sessionService";

/** Load all VS Code Copilot chat sessions (local harness + Copilot Harness via AHP) */
export function useAllSessions() {
  const { data, isLoading, revalidate } = useCachedPromise(async (): Promise<SessionLoadResult> => {
    const result = await Effect.runPromise(Effect.result(loadAllSessions()));
    if (Result.isFailure(result)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load sessions",
        message: result.failure.message,
      });
      return { sessions: [], ahpReachable: true };
    }
    return result.success;
  }, []);

  return {
    sessions: data?.sessions,
    ahpReachable: data?.ahpReachable ?? true,
    isLoading,
    revalidate,
  };
}
