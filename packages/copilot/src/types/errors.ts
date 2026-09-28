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
