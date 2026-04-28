import { getPreferenceValues } from "@raycast/api";
import { readdirSync, readFileSync, existsSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { Effect, pipe, Data } from "effect";
import { ChatSessionIndex, ChatStatus, ResolvedChatSession, VSCodeVariant } from "../types/session";

// ── Error types ──────────────────────────────────────────────────────────────

class SessionReadError extends Data.TaggedError("SessionReadError")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

class SessionWriteError extends Data.TaggedError("SessionWriteError")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

// ── Preferences ──────────────────────────────────────────────────────────────

interface Preferences {
  vscodeVariant: VSCodeVariant;
}

function getVariant(): VSCodeVariant {
  const prefs = getPreferenceValues<Preferences>();
  return prefs.vscodeVariant || "insiders";
}

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

// ── Session index reader ─────────────────────────────────────────────────────

function readSessionIndex(dbPath: string): Effect.Effect<ChatSessionIndex | null, SessionReadError> {
  return Effect.try({
    try: () => {
      const result = execSync(
        `sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key='chat.ChatSessionStore.index'"`,
        { encoding: "utf-8", timeout: 5000 },
      ).trim();

      if (!result) return null;
      return JSON.parse(result) as ChatSessionIndex;
    },
    catch: (cause) =>
      new SessionReadError({
        cause,
        message: `Failed to read session index from ${dbPath}`,
      }),
  });
}

// ── Chat status derivation ───────────────────────────────────────────────────

/**
 * Derive a human-readable ChatStatus from session metadata.
 *
 * VS Code's `lastResponseState` is a snapshot of the last completed
 * response — it does NOT reflect whether a new request is currently
 * in flight. The timing fields are more reliable:
 *
 * When VS Code starts a new request, it persists both `lastRequestStarted`
 * and `lastRequestEnded` to the SAME timestamp (the start time). When the
 * request completes or is cancelled, it updates `lastRequestEnded` to the
 * actual end time, which is always > start. Therefore:
 *   - start === end  → in-progress (initial write, not yet finished)
 *   - start < end    → completed/cancelled/failed (use lastResponseState)
 *   - !start         → empty or no requests yet
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
  // When VS Code starts a new request, it writes both lastRequestStarted
  // and lastRequestEnded to the SAME timestamp as the initial persisted
  // state. When the request finishes, it updates lastRequestEnded to the
  // actual completion time (always > start). So equal values = in-progress.
  if (lastRequestStarted && lastRequestStarted === lastRequestEnded) return "in-progress";

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
  return Effect.gen(function* () {
    const storageDir = getWorkspaceStorageDir(variant);

    if (!existsSync(storageDir)) return [];

    const workspaceDirs = readdirSync(storageDir, {
      withFileTypes: true,
    }).filter((d) => d.isDirectory());

    const sessions: ResolvedChatSession[] = [];
    const customTitles = readCustomTitles(variant);

    for (const wsEntry of workspaceDirs) {
      const wsDir = join(storageDir, wsEntry.name);
      const wsInfo = readWorkspaceInfo(wsDir);
      if (!wsInfo) continue;

      const dbPath = join(wsDir, "state.vscdb");
      if (!existsSync(dbPath)) continue;

      const index = yield* readSessionIndex(dbPath);
      if (!index?.entries) continue;

      for (const [sessionId, meta] of Object.entries(index.entries)) {
        const sessionFilePath = join(wsDir, "chatSessions", `${sessionId}.jsonl`);
        const created = new Date(meta.timing?.created || meta.lastMessageDate || 0);
        const lastMessageDate = new Date(meta.lastMessageDate || 0);

        sessions.push({
          sessionId,
          title: customTitles[sessionId] || meta.title || "Untitled",
          created,
          lastMessageDate,
          chatStatus: deriveChatStatus(
            meta.isEmpty,
            meta.timing?.lastRequestStarted,
            meta.timing?.lastRequestEnded,
            meta.lastResponseState,
          ),
          hasPendingEdits: meta.hasPendingEdits ?? false,
          workspacePath: wsInfo.folderPath,
          workspaceName: wsInfo.folderName,
          workspaceHash: wsInfo.hash,
          sessionFilePath,
          initialLocation: meta.initialLocation,
          lastResponseState: meta.lastResponseState,
        });
      }
    }

    sessions.sort((a, b) => b.lastMessageDate.getTime() - a.lastMessageDate.getTime());

    return sessions;
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

export function renameSession(session: ResolvedChatSession, newTitle: string): Promise<void> {
  const variant = getVariant();
  const titles = readCustomTitles(variant);
  titles[session.sessionId] = newTitle;
  return Effect.runPromise(
    pipe(
      writeCustomTitles(variant, titles),
      Effect.catchAll((err: SessionWriteError) => Effect.fail(new Error(`${err.message}: ${err.cause}`))),
    ),
  );
}

// ── Open session ─────────────────────────────────────────────────────────────

/**
 * Open a chat session via the companion VS Code extension.
 *
 * Writes the session ID to `~/.vscode-chat-session-pending`, then opens the
 * workspace in VS Code. The companion extension watches for this file and
 * opens the session via `vscode-chat-session://` URI.
 */
export async function openSessionViaUriHandler(session: ResolvedChatSession): Promise<void> {
  const pendingPath = join(homedir(), ".vscode-chat-session-pending");
  writeFileSync(pendingPath, session.sessionId, "utf-8");

  const variant = getVariant();
  const cliCommand = variant === "insiders" ? "code-insiders" : "code";

  try {
    execSync(`${cliCommand} "${session.workspacePath}"`, {
      timeout: 5000,
      stdio: "ignore",
    });
  } catch {
    throw new Error(`Could not open workspace. Is ${cliCommand} in your PATH?`);
  }
}

/**
 * Open the workspace folder in VS Code without opening a specific session.
 */
export function openWorkspaceInVSCode(session: ResolvedChatSession): void {
  const variant = getVariant();
  const cliCommand = variant === "insiders" ? "code-insiders" : "code";

  try {
    execSync(`${cliCommand} "${session.workspacePath}"`, {
      timeout: 5000,
      stdio: "ignore",
    });
  } catch {
    throw new Error(`Could not open workspace. Is ${cliCommand} in your PATH?`);
  }
}

/**
 * Open the raw .jsonl session file in the default editor.
 */
export function openSessionFile(session: ResolvedChatSession): void {
  if (!existsSync(session.sessionFilePath)) {
    throw new Error("Session file not found: " + session.sessionFilePath);
  }
  execSync(`open "${session.sessionFilePath}"`, {
    timeout: 5000,
    stdio: "ignore",
  });
}
