import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync, spawn } from "child_process";
import { Effect, pipe } from "effect";
import { ChatStatus, ResolvedChatSession, VSCodeVariant } from "../types/session";
import { SessionReadError, SessionWriteError, VSCodeLaunchError } from "../types/errors";
import { getVariant, getCliCommand, getScheme } from "./vscode";

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

// ── JSONL / JSON session file reader ─────────────────────────────────────────

interface SerializedRequestMinimal {
  timestamp?: number;
  timeSpentWaiting?: number;
  modelState?: { value: number; completedAt?: number };
}

interface SerializedChatDataMinimal {
  sessionId?: string;
  creationDate?: number;
  customTitle?: string;
  initialLocation?: string;
  hasPendingEdits?: boolean;
  requests?: SerializedRequestMinimal[];
}

interface RawSessionMetadata {
  sessionId: string;
  created: number;
  lastMessageDate: number;
  customTitle: string | undefined;
  isEmpty: boolean;
  hasPendingEdits: boolean;
  initialLocation: string | undefined;
  lastResponseState: number | undefined;
  lastRequestStarted: number | undefined;
  lastRequestEnded: number | undefined;
}

/**
 * Compute RawSessionMetadata from the initial serialized state plus any
 * mutation log entries (JSONL lines after the first Initial entry).
 *
 * Tracked fields:
 *   - customTitle    (kind=1, k=["customTitle"])
 *   - hasPendingEdits (kind=1, k=["hasPendingEdits"])
 *   - requests array  (kind=2, k=["requests"]) — new requests pushed
 *   - request modelState (kind=1, k=["requests",N,"modelState"]) — completion state
 */
function extractMetadataFromMutations(
  initial: SerializedChatDataMinimal,
  mutations: Array<{ kind: number; k?: (string | number)[]; v?: unknown; i?: number }>,
): RawSessionMetadata | null {
  if (!initial.sessionId) return null;

  let customTitle = initial.customTitle;
  let hasPendingEdits = initial.hasPendingEdits ?? false;
  const requests: SerializedRequestMinimal[] = [...(initial.requests ?? [])];

  for (const entry of mutations) {
    const k = entry.k;
    if (!k) continue;

    if (entry.kind === 1) {
      // Set operation
      if (k.length === 1) {
        if (k[0] === "customTitle") customTitle = entry.v as string | undefined;
        else if (k[0] === "hasPendingEdits") hasPendingEdits = entry.v as boolean;
      } else if (k.length === 3 && k[0] === "requests" && k[2] === "modelState") {
        const idx = k[1] as number;
        if (requests[idx]) {
          requests[idx] = { ...requests[idx], modelState: entry.v as { value: number; completedAt?: number } };
        }
      }
    } else if (entry.kind === 2 && k.length === 1 && k[0] === "requests") {
      // Push to requests array; optional i = splice-from index
      if (entry.i !== undefined) requests.splice(entry.i as number);
      const pushed = entry.v as SerializedRequestMinimal[] | undefined;
      if (pushed) {
        for (const item of pushed) requests.push(item);
      }
    }
  }

  const lastRequest = requests.length > 0 ? requests[requests.length - 1] : undefined;
  const lastMessageDate = lastRequest?.timestamp ?? initial.creationDate ?? 0;
  // lastRequestEnded mirrors ChatModel.timing: completedAt (set on finish) or response.timestamp (near-zero diff = in-progress)
  const lastRequestEnded = lastRequest?.modelState?.completedAt ?? lastRequest?.timeSpentWaiting;

  return {
    sessionId: initial.sessionId,
    created: initial.creationDate ?? 0,
    lastMessageDate,
    customTitle,
    isEmpty: requests.length === 0,
    hasPendingEdits,
    initialLocation: initial.initialLocation,
    lastResponseState: lastRequest?.modelState?.value,
    lastRequestStarted: lastRequest?.timestamp,
    lastRequestEnded,
  };
}

const MAX_JSONL_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — skip files larger than this

function readSessionFromJsonl(filePath: string): RawSessionMetadata | null {
  try {
    // Guard against very large files that could exhaust Raycast process memory
    if (statSync(filePath).size > MAX_JSONL_FILE_SIZE) return null;
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    let initial: SerializedChatDataMinimal | null = null;
    const mutations: Array<{ kind: number; k?: (string | number)[]; v?: unknown; i?: number }> = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { kind: number; k?: (string | number)[]; v?: unknown; i?: number };
        if (entry.kind === 0) {
          initial = entry.v as SerializedChatDataMinimal;
        } else {
          mutations.push(entry);
        }
      } catch {
        // skip malformed line, continue with rest of file
      }
    }

    if (!initial) return null;
    return extractMetadataFromMutations(initial, mutations);
  } catch {
    return null;
  }
}

function readSessionFromJson(filePath: string): RawSessionMetadata | null {
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as SerializedChatDataMinimal;
    return extractMetadataFromMutations(data, []);
  } catch {
    return null;
  }
}

// ── Archived session IDs (still from state.vscdb) ────────────────────────────

interface AgentSessionCacheEntry {
  resource: string;
  archived?: boolean;
}

/**
 * Read the agentSessions.state.cache from state.vscdb.
 * Returns the set of session IDs that are archived.
 */
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
 *   lastRequestStarted = request.timestamp          (set via Date.now() in addRequest)
 *   lastRequestEnded   = response.completedAt        (set only when Complete/Cancelled/Failed)
 *                     ?? response.timestamp          (fallback: set via a SEPARATE Date.now()
 *                                                     call inside ChatResponseModel constructor,
 *                                                     which runs synchronously right after)
 *
 * Therefore:
 *   - In-progress:         completedAt = undefined  →  lastRequestEnded = response.timestamp
 *                          Two Date.now() calls in quick succession → diff is 0–1 ms
 *   - Completed/Cancelled: completedAt = actual end time → diff is >> 1 s (at minimum a full
 *                          network round-trip + model inference)
 *
 * IMPORTANT: chatSessionStore.ts `getSessionMetadata` explicitly converts
 * Pending (0) and NeedsInput (4) → Cancelled (2) before persisting. So
 * `lastResponseState=2` means either "user stopped" OR "was in-progress when
 * VS Code serialized". Timing is the only way to tell them apart.
 *
 * ResponseModelState (stored as lastResponseState number):
 *   0 = Pending, 1 = Complete, 2 = Cancelled, 3 = Failed, 4 = NeedsInput
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

// ── Load all sessions ────────────────────────────────────────────────────────

function loadSessionsFromStorage(variant: VSCodeVariant): Effect.Effect<ResolvedChatSession[], SessionReadError> {
  return Effect.try({
    try: () => {
      const storageDir = getWorkspaceStorageDir(variant);
      if (!existsSync(storageDir)) return [];

      const workspaceDirs = readdirSync(storageDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      const sessions: ResolvedChatSession[] = [];
      const customTitles = readCustomTitles(variant);

      for (const wsEntry of workspaceDirs) {
        try {
          const wsDir = join(storageDir, wsEntry.name);
          const wsInfo = readWorkspaceInfo(wsDir);
          if (!wsInfo) continue;

          const chatSessionsDir = join(wsDir, "chatSessions");
          if (!existsSync(chatSessionsDir)) continue;

          // Archived IDs are intentionally not loaded here: calling execSync(sqlite3)
          // for every workspace in a tight loop spawns hundreds of subprocesses and
          // causes Raycast to kill the extension process ("connection closed").
          // Archive status can be surfaced lazily on demand if needed.
          const archivedIds = new Set<string>();

          // Enumerate session files; prefer .jsonl over .json for the same base name
          const files = readdirSync(chatSessionsDir).filter((f) => f.endsWith(".jsonl") || f.endsWith(".json"));
          const sessionFiles = new Map<string, string>(); // sessionId → filePath
          for (const file of files) {
            const id = file.slice(0, file.lastIndexOf("."));
            if (!sessionFiles.has(id) || file.endsWith(".jsonl")) {
              sessionFiles.set(id, join(chatSessionsDir, file));
            }
          }

          for (const [, filePath] of sessionFiles) {
            try {
              const meta = filePath.endsWith(".jsonl") ? readSessionFromJsonl(filePath) : readSessionFromJson(filePath);
              if (!meta) continue;

              const chatStatus = archivedIds.has(meta.sessionId)
                ? "archived"
                : deriveChatStatus(
                    meta.isEmpty,
                    meta.lastRequestStarted,
                    meta.lastRequestEnded,
                    meta.lastResponseState,
                  );

              sessions.push({
                sessionId: meta.sessionId,
                title: customTitles[meta.sessionId] || meta.customTitle || "Untitled",
                created: new Date(meta.created),
                lastMessageDate: new Date(meta.lastMessageDate),
                chatStatus,
                hasPendingEdits: meta.hasPendingEdits,
                workspacePath: wsInfo.folderPath,
                workspaceName: wsInfo.folderName,
                workspaceHash: wsInfo.hash,
                sessionFilePath: filePath,
                initialLocation: meta.initialLocation,
                lastResponseState: meta.lastResponseState,
              });
            } catch {
              // skip this session file, continue with others
            }
          }
        } catch {
          // skip this workspace, continue with others
        }
      }

      sessions.sort((a, b) => b.lastMessageDate.getTime() - a.lastMessageDate.getTime());
      return sessions;
    },
    catch: (cause) =>
      new SessionReadError({
        cause,
        message: "Failed to load sessions from workspace storage",
      }),
  });
}

export function loadAllSessions(): Promise<ResolvedChatSession[]> {
  const variant = getVariant();
  return Effect.runPromise(
    pipe(
      loadSessionsFromStorage(variant),
      Effect.catchAll((err) => {
        console.error("[session-reader]", err.message, err.cause);
        return Effect.succeed([] as ResolvedChatSession[]);
      }),
    ),
  );
}

// ── Custom titles store ──────────────────────────────────────────────────────
//
// VS Code keeps the session index in memory and periodically flushes it back
// to state.vscdb, overwriting any direct DB edits. We store custom titles in
// a separate JSON file that VS Code never touches.

type CustomTitles = Record<string, string>; // sessionId → custom title

function getCustomTitlesPath(variant: VSCodeVariant): string {
  return join(getAppSupportDir(variant), "User/custom-session-titles.json");
}

function readCustomTitles(variant: VSCodeVariant): CustomTitles {
  const path = getCustomTitlesPath(variant);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CustomTitles;
  } catch {
    return {};
  }
}

function writeCustomTitles(variant: VSCodeVariant, titles: CustomTitles): Effect.Effect<void, SessionWriteError> {
  return Effect.try({
    try: () => {
      writeFileSync(getCustomTitlesPath(variant), JSON.stringify(titles, null, 2), "utf-8");
    },
    catch: (cause) =>
      new SessionWriteError({
        cause,
        message: "Failed to write custom titles file",
      }),
  });
}

// ── Rename session ───────────────────────────────────────────────────────────

export function renameSession(session: ResolvedChatSession, newTitle: string): Effect.Effect<void, SessionWriteError> {
  const variant = getVariant();
  const titles = readCustomTitles(variant);
  titles[session.sessionId] = newTitle;
  return writeCustomTitles(variant, titles);
}

// ── Open session ─────────────────────────────────────────────────────────────

/**
 * Open a chat session via the companion VS Code extension.
 *
 * Sends the request directly to the extension URI handler. The companion
 * extension decides whether to activate an existing editor tab or open the
 * session in the chat sidebar.
 */
export const openSessionViaUriHandler = (session: ResolvedChatSession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.try({
    try: () => {
      const scheme = getScheme();
      const encodedId = Buffer.from(session.sessionId, "utf-8").toString("base64url");
      const encodedWorkspace = encodeURIComponent(session.workspacePath);
      const encodedTitle = encodeURIComponent(session.title);
      const url = `${scheme}://CaffeineCat.open-chat-session/open?session=${encodedId}&workspace=${encodedWorkspace}&title=${encodedTitle}`;
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
    },
    catch: (cause) =>
      new VSCodeLaunchError({
        message: "Could not open chat session via the VS Code URI handler.",
        cause,
      }),
  });

/**
 * Open the workspace folder in VS Code without opening a specific session.
 */
export const openWorkspaceInVSCode = (session: ResolvedChatSession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.try({
    try: () => {
      const cliCommand = getCliCommand();
      execSync(`${cliCommand} "${session.workspacePath}"`, { timeout: 5000, stdio: "ignore" });
    },
    catch: (cause) =>
      new VSCodeLaunchError({
        message: `Could not open workspace. Is ${getCliCommand()} in your PATH?`,
        cause,
      }),
  });

/**
 * Open the raw .jsonl session file in the default editor.
 */
export const openSessionFile = (session: ResolvedChatSession): Effect.Effect<void, VSCodeLaunchError> =>
  Effect.try({
    try: () => {
      if (!existsSync(session.sessionFilePath)) {
        throw new Error("Session file not found: " + session.sessionFilePath);
      }
      execSync(`open "${session.sessionFilePath}"`, { timeout: 5000, stdio: "ignore" });
    },
    catch: (cause) =>
      new VSCodeLaunchError({
        message: `Could not open session file: ${session.sessionFilePath}`,
        cause,
      }),
  });
