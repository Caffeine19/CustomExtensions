import type { CopilotSession } from "./copilotSession";
import type { LocalSession } from "./localSession";

/** "empty" is local-only. */
export type ChatStatus = "empty" | "in-progress" | "completed" | "failed" | "needs-input" | "unread" | "archived";

/** One list row: local-harness session or Copilot Harness chat */
export type AnySession = LocalSession | CopilotSession;
