import { execSync } from "child_process";

import { Effect } from "effect";

import { EmptyPromptError, VSCodeLaunchError } from "../types/errors";
import { getCliCommand } from "./vscode";

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuickChatParams {
  prompt: string;
  mode: "agent" | "ask" | "edit";
  workspace?: string;
  workspaceType?: "folder" | "workspace" | "file";
  addFiles?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isWorkspaceFile(params: QuickChatParams): boolean {
  return (
    params.workspaceType === "workspace" || Boolean(params.workspace && params.workspace.endsWith(".code-workspace"))
  );
}

function runCli(cliCommand: string, args: string[], options?: Record<string, unknown>): void {
  const cmd = `${cliCommand} ${args.map((a) => `"${a}"`).join(" ")}`;
  execSync(cmd, { timeout: 5000, stdio: "ignore", ...options });
}

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * Build the `code chat` arguments.
 *
 * NOTE: The VS Code `chat` subcommand overwrites positional args with `cwd()`,
 * so workspace file paths must NEVER be passed as positional arguments here.
 * Workspace targeting is handled separately in `launchQuickChat`.
 */
function buildChatArgs(params: QuickChatParams): string[] {
  const { prompt, mode, addFiles } = params;
  const args: string[] = ["chat", prompt, "-m", mode, "-r"];

  if (addFiles && addFiles.length > 0) {
    for (const file of addFiles) {
      args.push("-a", file);
    }
  }

  return args;
}

// ── Main launcher ────────────────────────────────────────────────────────────

/**
 * Launch a quick chat session with GitHub Copilot via VS Code.
 *
 * Returns an `Effect` that resolves to `void` on success or fails with
 * `EmptyPromptError` | `VSCodeLaunchError`.
 */
export const launchQuickChat = (params: QuickChatParams): Effect.Effect<void, EmptyPromptError | VSCodeLaunchError> =>
  Effect.gen(function* () {
    if (!params.prompt.trim()) {
      yield* new EmptyPromptError({ message: "Prompt cannot be empty" });
    }

    const cliCommand = getCliCommand();
    const chatArgs = buildChatArgs(params);

    yield* Effect.try({
      try: () => {
        if (isWorkspaceFile(params)) {
          // ── Two-step: open workspace first, then send chat with -r ──
          // The `chat` subcommand overwrites positional args with cwd(),
          // so we cannot pass .code-workspace as an argument to `chat`.
          // Instead: open the workspace file → VS Code activates that window
          //          then send chat with -r → targets the now-active window.
          runCli(cliCommand, [params.workspace!]);
          // Small delay for the workspace window to become active
          execSync("sleep 0.5");
          runCli(cliCommand, chatArgs);
        } else if (params.workspace) {
          // ── Folder workspace: set as cwd ──
          runCli(cliCommand, chatArgs, { cwd: params.workspace });
        } else {
          // ── No workspace: -r reuses current window ──
          runCli(cliCommand, chatArgs);
        }
      },
      catch: (cause) =>
        new VSCodeLaunchError({
          message: `Could not launch VS Code chat. Is ${cliCommand} in your PATH?`,
          cause,
        }),
    });
  });
