import { TaggedError } from "effect/Data";

export class AuthenticationError extends TaggedError("AuthenticationError")<{
  message: string;
}> {}

export class GitHubApiError extends TaggedError("GitHubApiError")<{
  message: string;
  status: number;
}> {}

export class OAuthDeviceFlowError extends TaggedError("OAuthDeviceFlowError")<{
  message: string;
}> {}

export class StorageError extends TaggedError("StorageError")<{
  message: string;
}> {}

export class SessionReadError extends TaggedError("SessionReadError")<{
  message: string;
  cause: unknown;
}> {}

export class SessionWriteError extends TaggedError("SessionWriteError")<{
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
