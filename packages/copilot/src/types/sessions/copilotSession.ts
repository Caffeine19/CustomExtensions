import type { SessionChatSummary, SessionSummary } from "@microsoft/agent-host-protocol";

/** Workspace attribution resolved for a Copilot Harness session (project / code-workspace / scratch) */
export interface CopilotWorkspace {
  /** Code-workspace file, project dir or scratch dir — `""` for workspaceless chats */
  path: string;
  name: string;
  /** The `.code-workspace` file when the session was created in a multi-root workspace */
  workspaceFile?: string;
}

/** A Copilot Harness session: one chat of an AHP session catalog entry (raw AHP wire shape). */
export type CopilotSession = {
  source: "copilot";
  /** `root/listSessions` session-level summary */
  summary: SessionSummary;
  /** This row's chat — a `summary.chats` entry, or a synthetic default-chat row when the catalog is empty */
  chat: SessionChatSummary;
  workspace: CopilotWorkspace;
  /** Agents-window chat without a workspace (`_meta.workspaceless` / `~/.copilot` scratch dir) */
  workspaceless: boolean;
  /** The session's events log (`~/.copilot/session-state/<uuid>/events.jsonl`) */
  sessionFilePath: string;
};

/** A workspaceless Copilot Harness chat (the "Chats" section of the Agents window) */
export type WorkspacelessCopilotSession = CopilotSession & { workspaceless: true };
