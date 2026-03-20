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
