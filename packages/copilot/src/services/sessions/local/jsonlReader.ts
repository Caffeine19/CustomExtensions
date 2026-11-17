import { closeSync, existsSync, fstatSync, openSync, readSync } from "fs";

import { Effect, Result, Schema } from "effect";

import { ResponseModelState } from "../../../types/sessions/localSession";
import { parseJson } from "../../../utils/parseJson";

// The index collapses ResponseModelState.NeedsInput to Cancelled at persist time (VS Code chatSessionStore:
// `getSessionMetadataSync`), so the JSONL journal is the only place the "awaiting input" bit survives. VS Code itself
// reads only the last request's `modelState` (`getSessionStatusForModel`), and journal entries are written in file
// order — so the last `modelState` write in the tail is the state; no replay needed.

/** Only the tail is scanned: the last write is by definition near the end of the journal. */
const TAIL_SCAN_BYTES = 256 * 1024;

const SessionOpLogEntry = Schema.Struct({
  kind: Schema.Number,
  k: Schema.optional(Schema.Array(Schema.Union([Schema.String, Schema.Number]))),
  v: Schema.optional(Schema.Unknown),
  i: Schema.optional(Schema.Number),
});
type SessionOpLogEntry = Schema.Schema.Type<typeof SessionOpLogEntry>;

const OpItems = Schema.Array(Schema.Unknown);
const RequestRecord = Schema.Struct({ modelState: Schema.optional(Schema.Unknown) });
const RequestsValue = Schema.Struct({ requests: OpItems });
const ModelStateValue = Schema.Struct({ value: Schema.optional(Schema.Number) });

function stateValue(modelState: unknown): number | undefined {
  return Schema.is(ModelStateValue)(modelState) ? modelState.value : undefined;
}

/** The `modelState.value` one journal entry writes, if any (kind 0 snapshot / 1 set / 2 splice-push). */
function entryModelState(entry: SessionOpLogEntry): number | undefined {
  if (entry.kind === 0) {
    return lastState(Schema.is(RequestsValue)(entry.v) ? entry.v.requests : []);
  }
  if (entry.kind === 2) {
    return lastState(Schema.is(OpItems)(entry.v) ? entry.v : []);
  }
  const path = entry.k;
  if (entry.kind === 1 && path && path[0] === "requests") {
    if (path.length === 3 && path[2] === "modelState") return stateValue(entry.v);
    // A whole-record Set still carries the request's current modelState.
    if (path.length === 2 && Schema.is(RequestRecord)(entry.v)) return stateValue(entry.v.modelState);
  }
  return undefined;
}

/** Last `modelState.value` in a batch of request records — the newest request comes last. */
function lastState(items: readonly unknown[]): number | undefined {
  let last: number | undefined;
  for (const item of items) {
    const value = Schema.is(RequestRecord)(item) ? stateValue(item.modelState) : undefined;
    if (value !== undefined) last = value;
  }
  return last;
}

/**
 * Cheap pre-filter: only lines that can affect request model states get parsed.
 *
 * Deliberately plain (not Effect): it runs once per tail line, and its `undefined` result is parser semantics ("no
 * parse, no entry"), not error handling.
 */
function parseOpLogEntry(raw: string): SessionOpLogEntry | undefined {
  if (!raw.startsWith('{"kind":0') && !raw.includes('"k":["requests"]') && !raw.includes('"modelState"')) {
    return undefined;
  }
  const entry = parseJson<SessionOpLogEntry>(raw);
  return Result.isSuccess(entry) ? entry.success : undefined;
}

/** Last {@link TAIL_SCAN_BYTES} of the file as lines, minus the leading partial line. */
function readTailLines(path: string): Effect.Effect<string[], unknown> {
  return Effect.acquireUseRelease(
    Effect.try(() => openSync(path, "r")),
    (fd) =>
      Effect.try(() => {
        const { size } = fstatSync(fd);
        const length = Math.min(TAIL_SCAN_BYTES, size);
        const buffer = Buffer.allocUnsafe(length);
        readSync(fd, buffer, 0, length, size - length);
        const lines = buffer.toString("utf-8").split("\n");
        if (size > length) lines.shift(); // first line is likely cut mid-entry
        return lines;
      }),
    (fd) => Effect.sync(() => closeSync(fd)),
  );
}

/**
 * Whether a request awaits the user (question/confirmation/elicitation) — VS Code's `ResponseModelState.NeedsInput`.
 * Only meaningful for sessions that look "in-progress": a waiting response never gets `completedAt`. Unreadable
 * journals fall back to `false`, keeping the timing-based status.
 */
export function isWaitingForInput(sessionFilePath: string): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    if (!existsSync(sessionFilePath)) return false;

    let last: number | undefined;
    for (const raw of yield* readTailLines(sessionFilePath)) {
      const entry = parseOpLogEntry(raw);
      const value = entry ? entryModelState(entry) : undefined;
      if (value !== undefined) last = value;
    }
    return last === ResponseModelState.NeedsInput;
  }).pipe(Effect.catch(() => Effect.succeed(false)));
}
