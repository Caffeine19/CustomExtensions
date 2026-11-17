import { ChatInteractivity, SessionStatus } from "@microsoft/agent-host-protocol";
import dayjs, { type Dayjs } from "dayjs";
import { Match } from "effect";

import type { CopilotSession, WorkspacelessCopilotSession } from "../types/sessions/copilotSession";
import { type ChatSessionEntryMetadata, ResponseModelState } from "../types/sessions/localSession";
import type { AnySession, ChatStatus } from "../types/sessions/session";

/** Strip the `ahp-session:/` scheme to get the session UUID. */
export function uriToSessionId(resource: string): string {
  return resource.replace(/^ahp-session:\//, "");
}

// A real response takes well over 1s; a sub-second diff means VS Code serialized the
// session while it was still running (it records request start and response construction
// with two back-to-back Date.now() calls).
const IN_PROGRESS_TIMING_THRESHOLD_MS = 1000;

// lastResponseState collapses Pending/NeedsInput → Cancelled (2) before persisting, so
// timing is the only way to tell "user stopped" from "was in-progress"; awaiting-input
// sessions are refined later from the JSONL op log.
// 0 = Pending, 1 = Complete, 2 = Cancelled, 3 = Failed, 4 = NeedsInput
export function deriveLocalBaseStatus(metadata: ChatSessionEntryMetadata): ChatStatus {
  // Only an explicit true marks a session empty; a missing field must not hide it.
  if (metadata.isEmpty === true) return "empty";

  const started = metadata.timing?.lastRequestStarted;
  const ended = metadata.timing?.lastRequestEnded;
  if (started !== undefined && ended !== undefined && ended - started < IN_PROGRESS_TIMING_THRESHOLD_MS) {
    return "in-progress";
  }

  if (metadata.lastResponseState !== undefined) {
    switch (metadata.lastResponseState) {
      case ResponseModelState.Failed:
        return "failed";
      case ResponseModelState.NeedsInput:
        return "needs-input";
      case ResponseModelState.Pending: // no timing data, but pending
        return "in-progress";
      case ResponseModelState.Complete:
      case ResponseModelState.Cancelled:
        return "completed";
    }
  }

  return "completed";
}

function mapChatStatus(status: SessionStatus): ChatStatus {
  if ((status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded) return "needs-input";
  if (status & SessionStatus.InProgress) return "in-progress";
  if (status & SessionStatus.Error) return "failed";
  if (status & SessionStatus.IsArchived) return "archived";
  return "completed";
}

/** Whether this chat is its session's default (main) chat — its status carries the session-scoped flags. */
export function copilotIsDefaultChat(session: CopilotSession): boolean {
  const visibleChats = (session.summary.chats ?? []).filter((chat) => chat.interactivity !== ChatInteractivity.Hidden);
  const defaultChatUri = session.summary.defaultChat ?? visibleChats[0]?.resource ?? session.summary.resource;
  return session.chat.resource === defaultChatUri;
}

/** The row's effective status bits: session-scoped flags win for the default chat. */
export function copilotRowStatus(session: CopilotSession): SessionStatus {
  return copilotIsDefaultChat(session) ? session.summary.status : (session.chat.status ?? session.summary.status);
}

/** The chat's AHP channel URI (`ahp-chat:/…`) — fork/archive/delete target; undefined for synthetic rows. */
export function copilotChatUri(session: CopilotSession): string | undefined {
  return session.chat.resource.startsWith("ahp-chat:") ? session.chat.resource : undefined;
}

/** The session's AHP channel URI (`ahp-session:/<uuid>`) — rename target. */
export function copilotSessionUri(session: CopilotSession): string {
  return session.summary.resource;
}

export function sessionId(session: AnySession): string {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => s.metadata.sessionId),
    Match.when({ source: "copilot" }, (s) => uriToSessionId(s.summary.resource)),
    Match.exhaustive,
  );
}

/** Stable unique key for list rendering and dedup (a session may hold several chats). */
export function sessionRowKey(session: AnySession): string {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => `local:${s.metadata.sessionId}`),
    Match.when({ source: "copilot" }, (s) => `copilot:${uriToSessionId(s.summary.resource)}:${s.chat.resource}`),
    Match.exhaustive,
  );
}

export function sessionTitle(session: AnySession): string {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => s.metadata.title || "Untitled"),
    // Session title updates immediately on rename; a default chat's own title can lag.
    Match.when({ source: "copilot" }, (s) =>
      copilotIsDefaultChat(s)
        ? s.summary.title || s.chat.title || "Untitled"
        : s.chat.title || s.summary.title || "Untitled",
    ),
    Match.exhaustive,
  );
}

export function sessionCreated(session: AnySession): Dayjs {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => dayjs(s.metadata.timing?.created ?? s.metadata.lastMessageDate)),
    Match.when({ source: "copilot" }, (s) => dayjs(s.summary.createdAt)),
    Match.exhaustive,
  );
}

export function sessionLastActivity(session: AnySession): Dayjs {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => dayjs(s.metadata.lastMessageDate)),
    Match.when({ source: "copilot" }, (s) => dayjs(s.summary.modifiedAt)),
    Match.exhaustive,
  );
}

export function sessionChatStatus(session: AnySession): ChatStatus {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => {
      const base = deriveLocalBaseStatus(s.metadata);
      return base === "in-progress" && s.awaitingInput ? "needs-input" : base;
    }),
    Match.when({ source: "copilot" }, (s) => mapChatStatus(copilotRowStatus(s))),
    Match.exhaustive,
  );
}

/** Archived is orthogonal to the activity badge (a running turn in an archived chat still reports InProgress). */
export function sessionIsArchived(session: AnySession): boolean {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, () => false),
    Match.when({ source: "copilot" }, (s) => (copilotRowStatus(s) & SessionStatus.IsArchived) !== 0),
    Match.exhaustive,
  );
}

export function sessionIsWorkspaceless(session: AnySession): session is WorkspacelessCopilotSession {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, () => false),
    Match.when({ source: "copilot" }, (s) => s.workspaceless),
    Match.exhaustive,
  );
}

export function sessionHasPendingEdits(session: AnySession): boolean {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => s.metadata.hasPendingEdits ?? false),
    Match.when({ source: "copilot" }, () => false),
    Match.exhaustive,
  );
}

export function sessionIsForked(session: AnySession): boolean {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, () => false),
    Match.when({ source: "copilot" }, (s) => (s.chat.origin as { kind?: string } | undefined)?.kind === "fork"),
    Match.exhaustive,
  );
}

export function sessionWorkspaceName(session: AnySession): string {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => s.workspace.folderName),
    Match.when({ source: "copilot" }, (s) => s.workspace.name),
    Match.exhaustive,
  );
}

export function sessionWorkspacePath(session: AnySession): string {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => s.workspace.folderPath),
    Match.when({ source: "copilot" }, (s) => s.workspace.path),
    Match.exhaustive,
  );
}

export function sessionInitialLocation(session: AnySession): string | undefined {
  return Match.value(session).pipe(
    Match.when({ source: "local" }, (s) => s.metadata.initialLocation),
    Match.orElse(() => undefined),
  );
}
