import * as vscode from "vscode";
import { readFileSync, unlinkSync, existsSync, watch } from "fs";
import { join } from "path";
import { homedir } from "os";

function toBase64Url(sessionId: string): string {
  const buf = Buffer.from(sessionId, "utf-8");
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildSessionUri(sessionId: string): vscode.Uri {
  const encoded = toBase64Url(sessionId);
  return vscode.Uri.parse(`vscode-chat-session://local/${encoded}`);
}

async function openSessionById(sessionId: string): Promise<void> {
  const sessionUri = buildSessionUri(sessionId);
  try {
    await vscode.commands.executeCommand("vscode.open", sessionUri);
  } catch {
    vscode.window.showWarningMessage(
      `Could not open chat session ${sessionId}.`,
    );
  }
}

const PENDING_FILE = join(homedir(), ".vscode-chat-session-pending");

function checkAndOpenPending(): void {
  if (!existsSync(PENDING_FILE)) {
    return;
  }
  try {
    const sessionId = readFileSync(PENDING_FILE, "utf-8").trim();
    unlinkSync(PENDING_FILE);
    setTimeout(() => openSessionById(sessionId), 1500);
  } catch {
    // ignore
  }
}

export function activate(context: vscode.ExtensionContext) {
  checkAndOpenPending();

  // Watch for the pending file — works even if VS Code is already running
  try {
    const watcher = watch(homedir(), (_eventType, filename) => {
      if (filename === ".vscode-chat-session-pending") {
        checkAndOpenPending();
      }
    });
    context.subscriptions.push({ dispose: () => watcher.close() });
  } catch {
    // ignore watcher errors
  }

  // Poll as a backup (covers race between watcher and file write)
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (attempts > 120) {
      clearInterval(interval);
      return;
    }
    checkAndOpenPending();
  }, 500);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate() {}
