import { Result } from "effect";

/** `JSON.parse` whose success type is declared by the caller; the thrown failure is preserved in the `Result`. */
export function parseJson<T>(raw: string): Result.Result<T, unknown> {
  try {
    return Result.succeed(JSON.parse(raw));
  } catch (cause) {
    return Result.fail(cause);
  }
}
