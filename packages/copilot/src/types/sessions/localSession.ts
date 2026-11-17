/**
 * Typed mirror of the `chat.ChatSessionStore.index` persisted format in state.vscdb.
 *
 * Sources (microsoft/vscode, workbench internals — not exposed by the public VS Code API):
 *
 * - `src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts` (`IChatSessionEntryMetadata`,
 *   `IChatSessionIndexData`)
 * - `src/vs/workbench/contrib/chat/common/chatService/chatService.ts` (`ResponseModelState`, `IChatSessionTiming`,
 *   `IChatSessionStats`)
 * - `src/vs/workbench/contrib/chat/common/constants.ts` (`ChatAgentLocation`, `ChatPermissionLevel`)
 */
import { Schema } from "effect";

/** @see chatService.ts `ResponseModelState` */
export enum ResponseModelState {
  Pending,
  Complete,
  Cancelled,
  Failed,
  NeedsInput,
}

/** @see chatService.ts `IChatSessionTiming` */
export const ChatSessionTiming = Schema.Struct({
  /** Session creation, ms since epoch */
  created: Schema.Number,
  /** Absent when no request has been made yet */
  lastRequestStarted: Schema.optional(Schema.Number),
  /** Absent while the latest request is still in progress */
  lastRequestEnded: Schema.optional(Schema.Number),
});
export type ChatSessionTiming = Schema.Schema.Type<typeof ChatSessionTiming>;

/** @see chatService.ts `IChatSessionStats` */
export const ChatSessionStats = Schema.Struct({
  fileCount: Schema.Number,
  added: Schema.Number,
  removed: Schema.Number,
});
export type ChatSessionStats = Schema.Schema.Type<typeof ChatSessionStats>;

/** @see constants.ts `ChatAgentLocation` */
export enum ChatAgentLocation {
  /** Sidebar, chat editor or quick chat ("panel" is the persisted value) */
  Chat = "panel",
  Terminal = "terminal",
  Notebook = "notebook",
  EditorInline = "editor",
}

/** @see constants.ts `ChatPermissionLevel` */
export enum ChatPermissionLevel {
  Default = "default",
  Assisted = "assisted",
  AutoApprove = "autoApprove",
  Autopilot = "autopilot",
}

/**
 * @see chatSessionStore.ts `IChatSessionEntryMetadata` — the persisted contract is `sessionId`/`title`/
 * `lastMessageDate` (VS Code's own `isChatSessionEntryMetadata` checks exactly these). Optional fields are validated
 * when present; unknown keys pass through verbatim.
 */
export const ChatSessionEntryMetadata = Schema.StructWithRest(
  Schema.Struct({
    sessionId: Schema.String,
    title: Schema.String,
    lastMessageDate: Schema.Number,
    timing: Schema.optional(ChatSessionTiming),
    initialLocation: Schema.optional(
      Schema.Literals([
        ChatAgentLocation.Chat,
        ChatAgentLocation.Terminal,
        ChatAgentLocation.Notebook,
        ChatAgentLocation.EditorInline,
      ]),
    ),
    hasPendingEdits: Schema.optional(Schema.Boolean),
    stats: Schema.optional(ChatSessionStats),
    /** Collapses Pending/NeedsInput → Cancelled before persisting */
    lastResponseState: Schema.optional(
      Schema.Literals([
        ResponseModelState.Pending,
        ResponseModelState.Complete,
        ResponseModelState.Cancelled,
        ResponseModelState.Failed,
        ResponseModelState.NeedsInput,
      ]),
    ),
    /**
     * Only exists because migrated data from the storage service had empty sessions persisted; `clearSession` deletes
     * empty sessions now, so this just filters the old ones out of history.
     */
    isEmpty: Schema.optional(Schema.Boolean),
    /** Whether this session was loaded from an external provider (e.g. background/cloud sessions) */
    isExternal: Schema.optional(Schema.Boolean),
    /** Permission level for tool auto-approval, if not default */
    permissionLevel: Schema.optional(
      Schema.Literals([
        ChatPermissionLevel.Default,
        ChatPermissionLevel.Assisted,
        ChatPermissionLevel.AutoApprove,
        ChatPermissionLevel.Autopilot,
      ]),
    ),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
export type ChatSessionEntryMetadata = Schema.Schema.Type<typeof ChatSessionEntryMetadata>;

/** @see chatSessionStore.ts `IChatSessionIndexData` */
export const ChatSessionIndex = Schema.Struct({
  /** Never read by the loader */
  version: Schema.optional(Schema.Number),
  entries: Schema.Record(Schema.String, ChatSessionEntryMetadata),
});
export type ChatSessionIndex = Schema.Schema.Type<typeof ChatSessionIndex>;

/** Persisted `workspaceStorage/<hash>/workspace.json` */
export const WorkspaceJson = Schema.Struct({
  folder: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
});
export type WorkspaceJson = Schema.Schema.Type<typeof WorkspaceJson>;

/** Workspace attribution from `workspaceStorage/<hash>/workspace.json` */
export interface WorkspaceInfo {
  hash: string;
  folderPath: string;
  folderName: string;
}

/** A local-harness session: one state.vscdb index entry with its workspace attribution. */
export type LocalSession = {
  source: "local";
  /** The state.vscdb index entry, stored verbatim */
  metadata: ChatSessionEntryMetadata;
  workspace: WorkspaceInfo;
  /** The session's JSONL op log (`<wsDir>/chatSessions/<sessionId>.jsonl`) */
  sessionFilePath: string;
  /**
   * Whether a request awaits the user (question / confirmation). The index collapses NeedsInput to Cancelled, so this
   * can only come from the JSONL op log.
   */
  awaitingInput: boolean;
};
