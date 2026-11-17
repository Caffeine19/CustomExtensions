import { execFileSync, spawn } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";

import { getPreferenceValues, showInFinder } from "@raycast/api";

import { Effect, Match, pipe } from "effect";
import { sort, unique } from "radash";

import { AgentHostError, SessionReadError, VSCodeLaunchError } from "../../types/errors";
import type { CopilotSession } from "../../types/sessions/copilotSession";
import type { LocalSession } from "../../types/sessions/localSession";
import type { AnySession } from "../../types/sessions/session";
import {
  copilotChatUri,
  copilotIsDefaultChat,
  sessionLastActivity,
  sessionRowKey,
  sessionWorkspacePath,
} from "../../utils/sessionDisplay";
import { getCliCommand, getScheme, getVariant } from "../../utils/vscode";
import { loadCopilotSessions } from "./copilot/copilotSessionService";
import { loadLocalSessions } from "./local/localSessionService";

export interface SessionLoadResult {
  sessions: AnySession[];
  /** False when the copilot side was requested but no live Agent Host answered. */
  ahpReachable: boolean;
}

function getSessionScope(): "all" | "local" | "copilot" {
  return getPreferenceValues().sessionScope;
}

/** Loads sessions on both sides; load failures stay in the error channel for the caller to handle. */
export function loadAllSessions(): Effect.Effect<SessionLoadResult, SessionReadError | AgentHostError> {
  const variant = getVariant();
  const scope = getSessionScope();

  const localSessions: Effect.Effect<LocalSession[], SessionReadError> =
    scope === "copilot" ? Effect.succeed([]) : loadLocalSessions(variant);

  // Only a missing agent host is a designed state (VS Code not running) — any other AHP failure surfaces to the caller.
  const copilotSessions: Effect.Effect<{ sessions: CopilotSession[]; reachable: boolean }, AgentHostError> =
    scope === "local"
      ? Effect.succeed({ sessions: [], reachable: true })
      : pipe(
          loadCopilotSessions(),
          Effect.map((sessions) => ({ sessions, reachable: true })),
          Effect.catchTag("AgentHostUnavailableError", () =>
            Effect.succeed({ sessions: [] as CopilotSession[], reachable: false }),
          ),
        );

  return Effect.all([localSessions, copilotSessions]).pipe(
    Effect.map(([local, copilot]) => {
      const newestFirst = sort(
        [...local, ...copilot.sessions],
        (session) => sessionLastActivity(session).valueOf(),
        true,
      );
      return {
        // Dedup by rowKey, not sessionId: copilot sessions carry one row per chat.
        sessions: unique(newestFirst, sessionRowKey),
        ahpReachable: copilot.reachable,
      };
    }),
  );
}

/**
 * Build a `vscode://…?session=<uri>` deep link (VS Code 1.128+). Local sessions use the `vscode-chat-session://` URI;
 * copilot sessions must use the workbench client resource `agent-host-<provider>:/<uuid>` (the backend `ahp-session:`
 * form is not addressable outside the host), with a `#<chatUuid>` fragment for non-default chats — matching VS Code's
 * own "Open in Editor" action.
 *
 * @see https://code.visualstudio.com/updates/v1_128#_deep-links-to-a-specific-chat
 */
export function buildSessionDeepLink(session: AnySession): string {
  const scheme = getScheme();
  const sessionUri = Match.value(session).pipe(
    Match.when({ source: "copilot" }, (s) => {
      let uri = s.summary.resource.replace(/^ahp-session:/, `agent-host-${s.summary.provider || "copilotcli"}:`);
      // The fragment selects a peer chat; the default chat is addressed without one.
      const chatUri = copilotChatUri(s);
      if (!copilotIsDefaultChat(s) && chatUri) {
        uri += `#${chatUri.replace(/^ahp-chat:\//, "")}`;
      }
      return uri;
    }),
    Match.when({ source: "local" }, (s) => {
      const encodedId = Buffer.from(s.metadata.sessionId, "utf-8").toString("base64url");
      return `vscode-chat-session://local/${encodedId}`;
    }),
    Match.exhaustive,
  );
  const params = new URLSearchParams();
  params.set("windowId", "_blank");
  params.set("session", sessionUri);
  const workspacePath = sessionWorkspacePath(session) || homedir();
  return `${scheme}://file${encodeURI(workspacePath)}?${params.toString()}`;
}

/** Open a chat session via the native VS Code deep link. */
export const openSessionViaUriHandler = (session: AnySession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.try({
    try: () => {
      const child = spawn("open", [buildSessionDeepLink(session)], { detached: true, stdio: "ignore" });
      child.unref();
    },
    catch: (cause) =>
      new VSCodeLaunchError({
        message: "Could not open chat session via the VS Code deep link.",
        cause,
      }),
  });

/** Open the workspace folder in VS Code without opening a specific session. */
export const openWorkspaceInVSCode = (session: AnySession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.try({
    try: () => {
      const cliCommand = getCliCommand();
      // Single argv entry — no shell, so spaces/quotes/$ in the path cannot break it.
      execFileSync(cliCommand, [sessionWorkspacePath(session)], { timeout: 5000, stdio: "ignore" });
    },
    catch: (cause) =>
      new VSCodeLaunchError({
        message: `Could not open workspace. Is ${getCliCommand()} in your PATH?`,
        cause,
      }),
  });

/** Reveal the raw .jsonl session file in Finder (`showInFinder`, not `open`: no shell, no default app needed). */
export const revealSessionFileInFinder = (session: AnySession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.tryPromise({
    try: async () => {
      if (!existsSync(session.sessionFilePath)) {
        throw new Error("Session file not found: " + session.sessionFilePath);
      }
      await showInFinder(session.sessionFilePath);
    },
    catch: (cause) =>
      new VSCodeLaunchError({
        message: `Could not reveal session file in Finder: ${session.sessionFilePath}`,
        cause,
      }),
  });
