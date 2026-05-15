/** Session metadata from the chat.ChatSessionStore.index in state.vscdb */
export interface ChatSessionEntryMetadata {
  sessionId: string;
  title: string;
  lastMessageDate: number;
  timing: {
    created: number;
    lastRequestStarted?: number;
    lastRequestEnded?: number;
  };
  initialLocation?: string;
  hasPendingEdits?: boolean;
  isEmpty?: boolean;
  isExternal?: boolean;
  lastResponseState?: number;
  permissionLevel?: string;
  stats?: Record<string, unknown>;
}

/** The full index structure stored in state.vscdb */
export interface ChatSessionIndex {
  version: number;
  entries: Record<string, ChatSessionEntryMetadata>;
}

/**
 * Chat session status derived from metadata.
 *
 * Maps from VS Code's `ResponseModelState` enum:
 *   Pending → "in-progress"
 *   Complete / Cancelled → "completed"
 *   Failed → "failed"
 *   NeedsInput → "needs-input"
 *
 * "empty" is a local-only status for sessions with no messages.
 */
export type ChatStatus = "empty" | "in-progress" | "completed" | "failed" | "needs-input" | "archived";

/** A fully resolved chat session with workspace info */
export interface ResolvedChatSession {
  sessionId: string;
  title: string;
  created: Date;
  lastMessageDate: Date;
  chatStatus: ChatStatus;
  hasPendingEdits: boolean;
  workspacePath: string;
  workspaceName: string;
  workspaceHash: string;
  sessionFilePath: string;
  initialLocation?: string;
  lastResponseState?: number;
}

/** VS Code variant preference */
export type VSCodeVariant = "insiders" | "stable";
