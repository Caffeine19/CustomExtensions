import { execSync } from "child_process";
import { Effect } from "effect";
import { EmptyPromptError, VSCodeLaunchError } from "../types/errors";
import { getCliCommand } from "./vscode";

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuickChatParams {
  prompt: string;
  mode: "agent" | "ask" | "edit";
  workspace?: string;
  addFiles?: string[];
}

// ── Core logic ───────────────────────────────────────────────────────────────

function buildArgs(params: QuickChatParams): string[] {
  const { prompt, mode, workspace, addFiles } = params;
  const args: string[] = ["chat", prompt, "-m", mode];

  // When no workspace is specified, reuse the active window.
  // When a workspace IS specified, omit both flags so VS Code will
  // match the existing workspace window or open a new one if needed.
  if (!workspace) {
    args.push("-r");
  }

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
    const args = buildArgs(params);

    yield* Effect.try({
      try: () => {
        const options: Record<string, unknown> = {
          timeout: 5000,
          stdio: "ignore",
        };
        if (params.workspace) {
          options.cwd = params.workspace;
        }
        execSync(`${cliCommand} ${args.map((arg) => `"${arg}"`).join(" ")}`, options);
      },
      catch: (cause) =>
        new VSCodeLaunchError({
          message: `Could not launch VS Code chat. Is ${cliCommand} in your PATH?`,
          cause,
        }),
    });
  });
