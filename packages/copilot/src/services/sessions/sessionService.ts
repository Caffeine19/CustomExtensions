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
  uriToSessionId,
} from "../../utils/sessionDisplay";
import { getCliCommand, getScheme, getVariant, isSessionBridgeInstalled } from "../../utils/vscode";
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

/** `agent-host-session://` link — the format VS Code's own openers consume; the default chat opens without `chat=`. */
export function buildAgentSessionLink(session: CopilotSession): string {
  const provider = session.summary.provider || "copilotcli";
  const rawId = uriToSessionId(session.summary.resource);
  const chatUri = copilotChatUri(session);
  const chatId = !copilotIsDefaultChat(session) && chatUri ? chatUri.replace(/^ahp-chat:\//, "") : undefined;
  return `agent-host-session://${provider}/${rawId}${chatId ? `?chat=${encodeURIComponent(chatId)}` : ""}`;
}

function openUrl(url: string): Effect.Effect<void, VSCodeLaunchError> {
  return Effect.try({
    try: () => {
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
    },
    catch: (cause) => new VSCodeLaunchError({ message: `Could not open ${url}`, cause }),
  });
}

/**
 * Open a chat session via VS Code. Copilot sessions use the session bridge (whose opener reveals an already-open chat
 * editor, cold tabs included) after focusing the session's workspace window — the bridge URL lands in the active
 * window, so without the focus step a cross-workspace session opens in the wrong window's sidebar. Local sessions and
 * bridge-less installs use the plain deep link.
 */
export const openSessionViaUriHandler = (session: AnySession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.gen(function* () {
    if (session.source === "copilot" && isSessionBridgeInstalled()) {
      const bridgeUrl = `${getScheme()}://caffeinecat.raycast-session-bridge/open?link=${encodeURIComponent(buildAgentSessionLink(session))}`;
      const workspacePath = sessionWorkspacePath(session);
      if (workspacePath) {
        yield* openUrl(`${getScheme()}://file${encodeURI(workspacePath)}`);
        yield* Effect.sleep("500 millis");
      }
      yield* openUrl(bridgeUrl);
    } else {
      yield* openUrl(buildSessionDeepLink(session));
    }
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
