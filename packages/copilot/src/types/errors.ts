import { TaggedError } from "effect/Data";

export class SessionReadError extends TaggedError("SessionReadError")<{
  message: string;
  cause: unknown;
}> {}

export class EmptyPromptError extends TaggedError("EmptyPromptError")<{
  message: string;
}> {}

export class VSCodeLaunchError extends TaggedError("VSCodeLaunchError")<{
  message: string;
  cause: unknown;
}> {}

export class RecentProjectsError extends TaggedError("RecentProjectsError")<{
  message: string;
  cause?: unknown;
}> {}

export class AgentHostError extends TaggedError("AgentHostError")<{
  message: string;
  cause?: unknown;
}> {}

/** The VS Code Agent Host is not running — a designed state (VS Code closed), not a failure. */
export class AgentHostUnavailableError extends TaggedError("AgentHostUnavailableError")<{
  message: string;
}> {}

/** Failures of AHP operations: a missing agent host or a transport/protocol error. */
export type AhpError = AgentHostError | AgentHostUnavailableError;
