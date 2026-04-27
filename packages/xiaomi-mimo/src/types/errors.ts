import { TaggedError } from "effect/Data";

export class MiMoApiError extends TaggedError("MiMoApiError")<{
  message: string;
  status: number;
}> {}

export class AuthenticationError extends TaggedError("AuthenticationError")<{
  message: string;
}> {}
