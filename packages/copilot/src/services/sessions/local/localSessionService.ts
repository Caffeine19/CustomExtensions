import { execFileSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

import { Effect } from "effect";
import { objectify, sort, unique } from "radash";

import { EmptyPromptError, SessionReadError, VSCodeLaunchError } from "../../../types/errors";
import type { LocalSession, WorkspaceInfo } from "../../../types/sessions/localSession";
import { deriveLocalBaseStatus } from "../../../utils/sessionDisplay";
import { type VSCodeVariant, getCliCommand, getWorkspaceStorageDir } from "../../../utils/vscode";
import { isWaitingForInput } from "./jsonlReader";
import { readSessionIndexes } from "./vscdbReader";
import { readWorkspaceInfo } from "./workspaceReader";

export function loadLocalSessions(variant: VSCodeVariant): Effect.Effect<LocalSession[], SessionReadError> {
  return Effect.gen(function* () {
    const storageDir = getWorkspaceStorageDir(variant);
    if (!existsSync(storageDir)) return [];

    const workspaceDirs = yield* Effect.try(() =>
      readdirSync(storageDir, { withFileTypes: true }).filter((d) => d.isDirectory()),
    );

    // Resolve workspace info first, then read every index in one pass.
    const workspaces: Array<{ info: WorkspaceInfo; wsDir: string }> = [];
    for (const wsEntry of workspaceDirs) {
      const wsDir = join(storageDir, wsEntry.name);
      const wsInfo = yield* readWorkspaceInfo(wsDir);
      if (!wsInfo) continue;
      if (!existsSync(join(wsDir, "state.vscdb"))) continue;
      workspaces.push({ info: wsInfo, wsDir });
    }

    // workspace hash → state.vscdb path
    const databases = objectify(
      workspaces,
      (w) => w.info.hash,
      (w) => join(w.wsDir, "state.vscdb"),
    );
    const indexes = yield* readSessionIndexes(databases);
    const sessions: LocalSession[] = [];

    for (const { info, wsDir } of workspaces) {
      const index = indexes.get(info.hash);
      if (!index) continue;

      for (const entry of Object.values(index.entries)) {
        if (!entry?.sessionId) continue;
        // External (cloud/background) sessions have no local file and can't be deep-linked.
        if (entry.isExternal) continue;

        const sessionFilePath = join(wsDir, "chatSessions", `${entry.sessionId}.jsonl`);
        // The index can't tell "awaiting input" from "running"; the op log can.
        const awaitingInput =
          deriveLocalBaseStatus(entry) === "in-progress" && (yield* isWaitingForInput(sessionFilePath));

        sessions.push({
          source: "local",
          metadata: entry,
          workspace: info,
          sessionFilePath,
          awaitingInput,
        });
      }
    }

    // A session copied into several workspaces must appear once (newest wins).
    const newestFirst = sort(sessions, (session) => session.metadata.lastMessageDate, true);
    return unique(newestFirst, (session) => session.metadata.sessionId);
  }).pipe(
    Effect.mapError(
      (cause) =>
        new SessionReadError({
          cause,
          message: `Failed to load sessions: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    ),
  );
}

// ── Quick chat launching via the VS Code CLI (`code chat`) ──

export interface QuickChatParams {
  prompt: string;
  mode: "agent" | "ask" | "edit";
  workspace?: string;
  workspaceType?: "folder" | "workspace" | "file";
  addFiles?: string[];
}

function isWorkspaceFile(params: QuickChatParams): boolean {
  return (
    params.workspaceType === "workspace" || Boolean(params.workspace && params.workspace.endsWith(".code-workspace"))
  );
}

function runCli(cliCommand: string, args: string[], options?: Record<string, unknown>): void {
  // Pass args as an argv array (no shell) so spaces, quotes or `$` in paths and prompts can never break the command.
  execFileSync(cliCommand, args, { timeout: 5000, stdio: "ignore", ...options });
}

/**
 * Build the `code chat` arguments.
 *
 * NOTE: The VS Code `chat` subcommand overwrites positional args with `cwd()`, so workspace file paths must NEVER be
 * passed as positional arguments here. Workspace targeting is handled separately in `launchQuickChat`.
 */
function buildChatArgs({ prompt, mode, addFiles = [] }: QuickChatParams): string[] {
  const args: string[] = ["chat", prompt, "-m", mode, "-r", ...addFiles.flatMap((file) => ["-a", file])];

  return args;
}

/**
 * Launch a quick chat session with GitHub Copilot via VS Code.
 *
 * Returns an `Effect` that resolves to `void` on success or fails with `EmptyPromptError` | `VSCodeLaunchError`.
 */
export const launchQuickChat = (params: QuickChatParams): Effect.Effect<void, EmptyPromptError | VSCodeLaunchError> =>
  Effect.gen(function* () {
    if (!params.prompt.trim()) {
      yield* new EmptyPromptError({ message: "Prompt cannot be empty" });
    }

    const cliCommand = getCliCommand();
    const chatArgs = buildChatArgs(params);

    const launchError = (cause: unknown) =>
      new VSCodeLaunchError({
        message: `Could not launch VS Code chat. Is ${cliCommand} in your PATH?`,
        cause,
      });

    if (isWorkspaceFile(params)) {
      // ── Two-step: open workspace first, then send chat with -r ──
      // The `chat` subcommand overwrites positional args with cwd(),
      // so we cannot pass .code-workspace as an argument to `chat`.
      // Instead: open the workspace file → VS Code activates that window
      //          then send chat with -r → targets the now-active window.
      yield* Effect.try({ try: () => runCli(cliCommand, [params.workspace!]), catch: launchError });
      // Small delay for the workspace window to become active
      yield* Effect.sleep("500 millis");
      yield* Effect.try({ try: () => runCli(cliCommand, chatArgs), catch: launchError });
    } else if (params.workspace) {
      // ── Folder workspace: set as cwd ──
      yield* Effect.try({
        try: () => runCli(cliCommand, chatArgs, { cwd: params.workspace }),
        catch: launchError,
      });
    } else {
      // ── No workspace: -r reuses current window ──
      yield* Effect.try({ try: () => runCli(cliCommand, chatArgs), catch: launchError });
    }
  });
