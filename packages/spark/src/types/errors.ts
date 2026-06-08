import { Data } from "effect";

/** Spark CLI is not found or not set up — needs manual verification */
export class SparkNotSetupError extends Data.TaggedError("SparkNotSetupError")<{
  readonly message: string;
}> {}

/** Triage access required but not available (free plan) */
export class TriageNotAvailableError extends Data.TaggedError("TriageNotAvailableError")<{
  readonly message: string;
}> {}

/** Generic Spark CLI command execution error */
export class SparkCommandError extends Data.TaggedError("SparkCommandError")<{
  readonly command: string;
  readonly message: string;
  readonly stderr?: string;
}> {}

/** Failed to parse Spark CLI output */
export class SparkParseError extends Data.TaggedError("SparkParseError")<{
  readonly message: string;
  readonly raw?: string;
}> {}

export type SparkError = SparkNotSetupError | TriageNotAvailableError | SparkCommandError | SparkParseError;
