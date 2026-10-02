import { execFileSync, execSync, spawn } from "child_process";
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";

import { showInFinder } from "@raycast/api";

import dayjs from "dayjs";
import { Effect, pipe } from "effect";
import { sort, unique } from "radash";

import { SessionReadError, VSCodeLaunchError } from "../types/errors";
import { ChatSessionIndex, ChatStatus, ResolvedChatSession, VSCodeVariant } from "../types/session";
import { getCliCommand, getScheme, getVariant } from "./vscode";

// ── Preferences ──────────────────────────────────────────────────────────────

function getAppSupportDir(variant: VSCodeVariant): string {
  const home = homedir();
  switch (variant) {
    case "insiders":
      return join(home, "Library/Application Support/Code - Insiders");
    case "stable":
      return join(home, "Library/Application Support/Code");
  }
}

function getWorkspaceStorageDir(variant: VSCodeVariant): string {
  return join(getAppSupportDir(variant), "User/workspaceStorage");
}

// ── Workspace info ───────────────────────────────────────────────────────────

interface WorkspaceInfo {
  hash: string;
  folderPath: string;
  folderName: string;
}

function readWorkspaceInfo(wsDir: string): WorkspaceInfo | null {
  const wsJsonPath = join(wsDir, "workspace.json");
  if (!existsSync(wsJsonPath)) return null;

  try {
    const wsJson = JSON.parse(readFileSync(wsJsonPath, "utf-8"));
    const folderUri: string = wsJson.folder || wsJson.workspace || "";
    if (!folderUri) return null;

    const folderPath = folderUri.replace(/^file:\/\//, "").replace(/^localhost/, "");
    const decodedPath = decodeURIComponent(folderPath);
    const rawName = basename(decodedPath);
    // Strip .code-workspace extension for multi-root workspaces
    const folderName = rawName.replace(/\.code-workspace$/, "");

    return {
      hash: basename(wsDir),
      folderPath: decodedPath,
      folderName,
    };
  } catch {
    return null;
  }
}

// ── Session index (state.vscdb) ─────────────────────────────────────────

// Reads session metadata from the `chat.ChatSessionStore.index` entry that
// VS Code maintains in each workspace's `state.vscdb` (written by
// chatSessionStore.ts `getSessionMetadata`). The index holds exactly the
// fields we need — title, timing, isEmpty, hasPendingEdits, lastResponseState
// — so sessions can be listed without parsing the chatSessions JSONL files
// (1000+ files / gigabytes in aggregate, which made loading take seconds).
//
// Access strategy — do NOT spawn one `sqlite3` per workspace in a loop; that
// used to get the extension killed by Raycast ("connection closed"). Instead:
//   1. `node:sqlite` (in-process, zero subprocesses) when the runtime has it;
//   2. batched `sqlite3` invocations that ATTACH 10 state.vscdb files each
//      (SQLite's SQLITE_LIMIT_ATTACHED caps one connection at 10 databases,
//      so ~100 workspaces cost ~10 spawns instead of ~100).

const CHAT_INDEX_KEY = "chat.ChatSessionStore.index";

interface SqliteDatabase {
  prepare(sql: string): { get(...params: unknown[]): unknown };
  close(): void;
}

type DatabaseSyncCtor = new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;

function readSessionIndexes(databases: Map<string, string>): Map<string, ChatSessionIndex> {
  const rawValues = readIndexValuesInProcess(databases) ?? readIndexValuesViaSqliteCli(databases);
  const indexes = new Map<string, ChatSessionIndex>();

  for (const [hash, raw] of rawValues) {
    try {
      const parsed = JSON.parse(raw) as ChatSessionIndex;
      if (parsed && typeof parsed.entries === "object" && parsed.entries !== null) {
        indexes.set(hash, parsed);
      }
    } catch {
      // malformed index payload — skip this workspace
    }
  }
  return indexes;
}

/** Returns null when `node:sqlite` is unavailable in the host runtime. */
function readIndexValuesInProcess(databases: Map<string, string>): Map<string, string> | null {
  let DatabaseSync: DatabaseSyncCtor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ DatabaseSync } = require("node:sqlite") as { DatabaseSync: DatabaseSyncCtor });
  } catch {
    return null;
  }

  const values = new Map<string, string>();
  for (const [hash, dbPath] of databases) {
    try {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(CHAT_INDEX_KEY) as
        | { value?: string }
        | undefined;
      db.close();
      if (typeof row?.value === "string") values.set(hash, row.value);
    } catch {
      // unreadable workspace DB — skip it
    }
  }
  return values;
}

/** Fallback: batched sqlite3 subprocesses (≤10 ATTACHed DBs per connection). */
const MAX_ATTACHED_DATABASES = 10; // SQLite's SQLITE_LIMIT_ATTACHED compile-time default

function readIndexValuesViaSqliteCli(databases: Map<string, string>): Map<string, string> {
  const values = new Map<string, string>();
  const entries = Array.from(databases.entries());

  for (let start = 0; start < entries.length; start += MAX_ATTACHED_DATABASES) {
    const chunk = entries.slice(start, start + MAX_ATTACHED_DATABASES);
    const attach = chunk
      .map(([, dbPath], i) => `ATTACH DATABASE 'file:${dbPath.replace(/'/g, "''")}?mode=ro' AS w${i};`)
      .join(" ");
    const select = chunk
      .map(([hash], i) => {
        const stmt = `SELECT '${hash.replace(/'/g, "''")}' AS id, value FROM w${i}.ItemTable WHERE key = '${CHAT_INDEX_KEY}'`;
        return i === 0 ? stmt : `UNION ALL ${stmt}`;
      })
      .join(" ");

    try {
      const stdout = execFileSync("/usr/bin/sqlite3", ["-json", ":memory:", `${attach} ${select}`], {
        encoding: "utf-8",
        timeout: 15000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const rows = JSON.parse(stdout.trim() || "[]") as Array<{ id: string; value: string }>;
      for (const row of rows) {
        if (typeof row.value === "string") values.set(row.id, row.value);
      }
    } catch {
      // sqlite3 unavailable or this chunk failed — skip it and keep going
    }
  }
  return values;
}

// ── Archived session IDs (still from state.vscdb) ────────────────────────────

interface AgentSessionCacheEntry {
  resource: string;
  archived?: boolean;
}

/** Read the agentSessions.state.cache from state.vscdb. Returns the set of session IDs that are archived. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Kept for future use; currently causes Raycast to kill the extension
function readArchivedSessionIds(dbPath: string): Set<string> {
  const archived = new Set<string>();
  try {
    const result = execSync(`sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key='agentSessions.state.cache'"`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    if (!result) return archived;

    const cache = JSON.parse(result) as AgentSessionCacheEntry[];
    for (const entry of cache) {
      if (!entry.archived) continue;
      // Parse session ID from vscode-chat-session://local/<base64url-id>
      const match = entry.resource.match(/^vscode-chat-session:\/\/local\/(.+)$/);
      if (match) {
        const sessionId = Buffer.from(match[1], "base64url").toString("utf-8");
        archived.add(sessionId);
      }
    }
  } catch {
    // cache may not exist in older workspaces
  }
  return archived;
}

// ── Chat status derivation ───────────────────────────────────────────────────

// Any real AI response (even the fastest network round-trip + inference) takes well
// over 1 second. We use this threshold to distinguish "serialized while in-progress"
// from "actually completed".
const IN_PROGRESS_TIMING_THRESHOLD_MS = 1000;

/**
 * Derive a human-readable ChatStatus from session metadata.
 *
 * How VS Code writes timing (from chatModel.ts `timing` getter):
 *
 * - `lastRequestStarted` = request.timestamp — set via Date.now() in addRequest.
 * - `lastRequestEnded` = response.completedAt — set only when Complete/Cancelled/Failed. Otherwise it falls back to
 *   response.timestamp, which is a SEPARATE Date.now() call inside the ChatResponseModel constructor, running
 *   synchronously right after.
 *
 * Therefore:
 *
 * - In-progress: completedAt = undefined → lastRequestEnded = response.timestamp. Two Date.now() calls in quick
 *   succession → diff is 0–1 ms.
 * - Completed/Cancelled: completedAt = actual end time → diff is >> 1 s (at minimum a full network round-trip + model
 *   inference).
 *
 * IMPORTANT: chatSessionStore.ts `getSessionMetadata` explicitly converts Pending (0) and NeedsInput (4) → Cancelled
 * (2) before persisting. So `lastResponseState=2` means either "user stopped" OR "was in-progress when VS Code
 * serialized". Timing is the only way to tell them apart. The same collapse hides sessions that are waiting for the
 * user to answer a question or confirm an action — those also look "in-progress" here and are refined from the session
 * JSONL op log by `isWaitingForInput` below.
 *
 * ResponseModelState (stored as lastResponseState number): 0 = Pending, 1 = Complete, 2 = Cancelled, 3 = Failed, 4 =
 * NeedsInput
 */
function deriveChatStatus(
  isEmpty: boolean | undefined,
  lastRequestStarted: number | undefined,
  lastRequestEnded: number | undefined,
  lastResponseState?: number,
): ChatStatus {
  if (isEmpty ?? true) return "empty";

  // Timing is the most reliable signal for in-progress detection.
  // Use a threshold rather than strict equality because VS Code makes two
  // separate Date.now() calls (one for the request, one for the response
  // object), which can differ by up to ~1 ms. A real completion/cancellation
  // always sets completedAt to the actual end time, so end - start is always
  // >> 1 s for any genuine terminal state.
  if (
    lastRequestStarted !== undefined &&
    lastRequestEnded !== undefined &&
    lastRequestEnded - lastRequestStarted < IN_PROGRESS_TIMING_THRESHOLD_MS
  ) {
    return "in-progress";
  }

  // Fall back to lastResponseState for terminal states
  if (lastResponseState !== undefined) {
    switch (lastResponseState) {
      case 3: // ResponseModelState.Failed
        return "failed";
      case 4: // ResponseModelState.NeedsInput
        return "needs-input";
      case 0: // ResponseModelState.Pending (no timing data, but pending)
        return "in-progress";
      case 1: // ResponseModelState.Complete
      case 2: // ResponseModelState.Cancelled
        return "completed";
    }
  }

  return "completed";
}

// ── Waiting-for-input detection (session JSONL op log) ──────────────────────

// A session that is waiting for the user to answer a question (askQuestions carousel), confirm
// an action or fill an elicitation is invisible in the chat.ChatSessionStore.index:
// getSessionMetadataSync collapses ResponseModelState.NeedsInput (4) to Cancelled (2) before
// persisting, and a waiting response never gets `completedAt`, so its timing always matches the
// in-progress heuristic. The session's JSONL op log keeps the real per-request `modelState`.
//
// JSONL format (objectMutationLog.ts EntryKind), one JSON entry per line:
//   kind 0 — Initial: full snapshot; `v.requests` holds the request array (records carry `modelState`)
//   kind 1 — Set: replace the value at path `k`, e.g. ["requests", 3, "modelState"]
//   kind 2 — Push: append `v` items to the array at `k`; when `i` is set the array is first
//            truncated at `i` (splice-replace)
//   kind 3 — Delete: drop the value at `k`
//
// Only request-array and modelState lines can change what we care about, so the huge
// response-part lines (hundreds of KB each) are skipped with substring checks before JSON.parse.

/** ResponseModelState.NeedsInput — awaiting user interaction (question, confirmation, elicitation). */
const RESPONSE_MODEL_STATE_NEEDS_INPUT = 4;

// Session files grow without bound (200 MB+ for long sessions), so exact replay is capped by a
// read budget; larger files fall back to a tail scan of their most recent ops.
const FULL_REPLAY_MAX_BYTES = 24 * 1024 * 1024;
const TAIL_SCAN_BYTES = 256 * 1024;

interface SessionOpLogEntry {
  kind: number;
  k?: (string | number)[];
  v?: unknown;
  i?: number;
}

/** Replay of the `requests` array: index → last known `modelState.value`, plus bookkeeping. */
interface RequestStateReplay {
  count: number;
  states: Map<number, number | undefined>;
  /** Most recent modelState written anywhere — used when indices cannot be trusted (tail scan). */
  lastWrittenValue: number | undefined;
}

function recordModelStateWrite(replay: RequestStateReplay, index: number, modelState: unknown): void {
  const rawValue = (modelState as { value?: unknown } | null | undefined)?.value;
  const value = typeof rawValue === "number" ? rawValue : undefined;
  replay.states.set(index, value);
  replay.lastWrittenValue = value;
}

function applyOp(replay: RequestStateReplay, entry: SessionOpLogEntry): void {
  if (entry.kind === 0) {
    // Initial snapshot — the request array becomes the replay baseline.
    const requests = (entry.v as { requests?: unknown[] } | null | undefined)?.requests;
    if (!Array.isArray(requests)) return;
    replay.count = requests.length;
    replay.states.clear();
    for (const [index, request] of requests.entries()) {
      const modelState = (request as { modelState?: unknown } | null | undefined)?.modelState;
      if (modelState !== undefined) recordModelStateWrite(replay, index, modelState);
    }
    return;
  }

  const path = entry.k;
  if (!Array.isArray(path) || path[0] !== "requests") return;

  if (entry.kind === 2) {
    // Push onto the `requests` array; `i` means "truncate at i, then append" (splice-replace).
    const items = Array.isArray(entry.v) ? entry.v : [];
    const spliceIndex = typeof entry.i === "number" ? entry.i : replay.count;
    for (const index of [...replay.states.keys()]) {
      if (index >= spliceIndex) replay.states.delete(index);
    }
    replay.count = spliceIndex + items.length;
    for (const [offset, item] of items.entries()) {
      const modelState = (item as { modelState?: unknown } | null | undefined)?.modelState;
      if (modelState !== undefined) recordModelStateWrite(replay, spliceIndex + offset, modelState);
    }
    return;
  }

  const index = path[1];
  if (typeof index !== "number") return;
  if (path.length === 3 && path[2] === "modelState") {
    if (entry.kind === 1) recordModelStateWrite(replay, index, entry.v);
    else if (entry.kind === 3) replay.states.delete(index);
  } else if (path.length === 2 && entry.kind === 1) {
    // A whole-record Set still carries the request's current modelState.
    const modelState = (entry.v as { modelState?: unknown } | null | undefined)?.modelState;
    if (modelState !== undefined) recordModelStateWrite(replay, index, modelState);
  }
}

/** Cheap pre-filter: only lines that can affect request model states get parsed. */
function parseOpLogEntry(raw: string): SessionOpLogEntry | undefined {
  if (!raw.startsWith('{"kind":0') && !raw.includes('"k":["requests"]') && !raw.includes('"modelState"')) {
    return undefined;
  }
  try {
    const entry = JSON.parse(raw) as SessionOpLogEntry | undefined;
    return typeof entry?.kind === "number" ? entry : undefined;
  } catch {
    return undefined;
  }
}

/** Full read, unless the file exceeds the replay budget (returns undefined then). */
function readAllLines(path: string): string[] | undefined {
  if (statSync(path).size > FULL_REPLAY_MAX_BYTES) return undefined;
  return readFileSync(path, "utf-8").split("\n");
}

/** Last {@link TAIL_SCAN_BYTES} of the file as lines, minus the leading partial line. */
function readTailLines(path: string): string[] {
  const fd = openSync(path, "r");
  try {
    const { size } = fstatSync(fd);
    const length = Math.min(TAIL_SCAN_BYTES, size);
    const buffer = Buffer.allocUnsafe(length);
    readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.toString("utf-8").split("\n");
    if (size > length) lines.shift(); // first line is likely cut mid-entry
    return lines;
  } finally {
    closeSync(fd);
  }
}

/**
 * Whether the session has a request awaiting the user (question carousel, tool confirmation or elicitation) — VS Code's
 * `ResponseModelState.NeedsInput`.
 *
 * Only "in-progress"-looking sessions need this check: a waiting response has no `completedAt`, so its timing always
 * matches the in-progress heuristic. Falls back to `false` for unreadable or oversized files, keeping the timing-based
 * status.
 */
function isWaitingForInput(sessionFilePath: string): boolean {
  try {
    if (!existsSync(sessionFilePath)) return false;

    const allLines = readAllLines(sessionFilePath);
    const replay: RequestStateReplay = { count: 0, states: new Map(), lastWrittenValue: undefined };
    for (const raw of allLines ?? readTailLines(sessionFilePath)) {
      const entry = parseOpLogEntry(raw);
      if (entry) applyOp(replay, entry);
    }

    if (allLines) {
      // Exact replay: any request whose latest modelState is NeedsInput means an unanswered prompt.
      return [...replay.states.values()].some((value) => value === RESPONSE_MODEL_STATE_NEEDS_INPUT);
    }
    // Tail scan: mid-file indices cannot be attributed to requests, but the latest modelState write is a faithful
    // proxy — a waiting session has no newer activity.
    return replay.lastWrittenValue === RESPONSE_MODEL_STATE_NEEDS_INPUT;
  } catch {
    return false;
  }
}

// ── Load all sessions ────────────────────────────────────────────────────────

function loadSessionsFromIndex(variant: VSCodeVariant): Effect.Effect<ResolvedChatSession[], SessionReadError> {
  return Effect.try({
    try: () => {
      const storageDir = getWorkspaceStorageDir(variant);
      if (!existsSync(storageDir)) return [];

      const workspaceDirs = readdirSync(storageDir, { withFileTypes: true }).filter((d) => d.isDirectory());

      // Resolve workspace info first, then read every index in one pass.
      const workspaces: Array<{ info: WorkspaceInfo; wsDir: string }> = [];
      const databases = new Map<string, string>(); // workspace hash → state.vscdb path
      for (const wsEntry of workspaceDirs) {
        const wsDir = join(storageDir, wsEntry.name);
        const wsInfo = readWorkspaceInfo(wsDir);
        if (!wsInfo) continue;
        const dbPath = join(wsDir, "state.vscdb");
        if (!existsSync(dbPath)) continue;
        workspaces.push({ info: wsInfo, wsDir });
        databases.set(wsInfo.hash, dbPath);
      }

      const indexes = readSessionIndexes(databases);
      const sessions: ResolvedChatSession[] = [];

      for (const { info, wsDir } of workspaces) {
        const index = indexes.get(info.hash);
        if (!index) continue;

        for (const entry of Object.values(index.entries)) {
          if (!entry?.sessionId) continue;
          // External (cloud/background) sessions have no local session file and
          // cannot be opened through the `vscode-chat-session://local/` deep link.
          if (entry.isExternal) continue;

          const sessionFilePath = join(wsDir, "chatSessions", `${entry.sessionId}.jsonl`);
          let chatStatus = deriveChatStatus(
            entry.isEmpty,
            entry.timing?.lastRequestStarted,
            entry.timing?.lastRequestEnded,
            entry.lastResponseState,
          );
          // A session waiting for the user to answer/confirm is indistinguishable from a running one in the index
          // (see deriveChatStatus), so refine those candidates against the session's JSONL op log.
          if (chatStatus === "in-progress" && isWaitingForInput(sessionFilePath)) {
            chatStatus = "needs-input";
          }

          sessions.push({
            sessionId: entry.sessionId,
            title: entry.title || "Untitled",
            created: dayjs(entry.timing?.created ?? entry.lastMessageDate),
            lastMessageDate: dayjs(entry.lastMessageDate),
            chatStatus,
            hasPendingEdits: entry.hasPendingEdits ?? false,
            workspacePath: info.folderPath,
            workspaceName: info.folderName,
            workspaceHash: info.hash,
            sessionFilePath,
            initialLocation: entry.initialLocation,
            lastResponseState: entry.lastResponseState,
          });
        }
      }

      // The same session can be copied into multiple workspaces (e.g. a folder
      // later added to a multi-root workspace), so keep only the first — i.e.
      // freshest — occurrence per sessionId to avoid duplicate React keys.
      const newestFirst = sort(sessions, (session) => session.lastMessageDate.valueOf(), true);
      return unique(newestFirst, (session) => session.sessionId);
    },
    catch: (cause) =>
      new SessionReadError({
        cause,
        message: "Failed to load sessions from the chat session index",
      }),
  });
}

export function loadAllSessions(): Promise<ResolvedChatSession[]> {
  const variant = getVariant();
  return Effect.runPromise(
    pipe(
      loadSessionsFromIndex(variant),
      Effect.catchAll(() => Effect.succeed([] as ResolvedChatSession[])),
    ),
  );
}

/**
 * Rehydrate the date fields of a session restored from `useCachedPromise`'s cache.
 *
 * The cache is persisted as JSON, where `Dayjs` values round-trip through `toJSON()` and come back as plain strings —
 * calling `.fromNow()`/`.isSame()` on them throws. `dayjs()` accepts strings, Dates and Dayjs instances alike, so this
 * wrapper is idempotent and safe to run on every load.
 */
export function rehydrateSessionDates(session: ResolvedChatSession): ResolvedChatSession {
  return {
    ...session,
    created: dayjs(session.created),
    lastMessageDate: dayjs(session.lastMessageDate),
  };
}

// ── Open session ─────────────────────────────────────────────────────────────

/**
 * Build a VS Code deep link URL for a chat session.
 *
 * Uses the built-in `vscode://…?session=<uri>` protocol introduced in VS Code 1.128+. The session URI follows the
 * `vscode-chat-session://` scheme and does not require a companion extension.
 *
 * Matches VS Code's own "Open in VS Code" action (OpenInVSCodeAction in sessions/browser/actions/vscodeActions.ts).
 *
 * @see https://code.visualstudio.com/updates/v1_128#_deep-links-to-a-specific-chat
 */
export function buildSessionDeepLink(session: ResolvedChatSession): string {
  const scheme = getScheme();
  const encodedId = Buffer.from(session.sessionId, "utf-8").toString("base64url");
  const sessionUri = `vscode-chat-session://local/${encodedId}`;
  const params = new URLSearchParams();
  params.set("windowId", "_blank");
  params.set("session", sessionUri);
  return `${scheme}://file${encodeURI(session.workspacePath)}?${params.toString()}`;
}

/** Open a chat session via the native VS Code deep link. */
export const openSessionViaUriHandler = (session: ResolvedChatSession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.try({
    try: () => {
      const child = spawn("open", [buildSessionDeepLink(session)], { detached: true, stdio: "ignore" });
      child.unref();
    },
    catch: (cause) =>
      new VSCodeLaunchError({
        message: "Could not open chat session via the VS Code deep link.",
        cause,
      }),
  });

/** Open the workspace folder in VS Code without opening a specific session. */
export const openWorkspaceInVSCode = (session: ResolvedChatSession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.try({
    try: () => {
      const cliCommand = getCliCommand();
      // Pass the path as a single argv entry — no shell involved, so spaces/quotes/$ in the path can never break it.
      execFileSync(cliCommand, [session.workspacePath], { timeout: 5000, stdio: "ignore" });
    },
    catch: (cause) =>
      new VSCodeLaunchError({
        message: `Could not open workspace. Is ${getCliCommand()} in your PATH?`,
        cause,
      }),
  });

/** Reveal the raw .jsonl session file in Finder. */
// Uses Raycast's showInFinder instead of shelling out to `open`: no shell means paths with spaces, quotes or `$`
// can never break the command, and it also works when no default app is registered for .jsonl files.
export const revealSessionFileInFinder = (session: ResolvedChatSession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.tryPromise({
    try: async () => {
      if (!existsSync(session.sessionFilePath)) {
        throw new Error("Session file not found: " + session.sessionFilePath);
      }
      await showInFinder(session.sessionFilePath);
    },
    catch: (cause) =>
      new VSCodeLaunchError({
        message: `Could not reveal session file in Finder: ${session.sessionFilePath}`,
        cause,
      }),
  });
