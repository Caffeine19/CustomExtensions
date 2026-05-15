import * as vscode from "vscode";
import { spawn } from "child_process";

function buildSessionUri(sessionId: string): vscode.Uri {
  const encoded = Buffer.from(sessionId, "utf-8").toString("base64url");
  return vscode.Uri.parse(`vscode-chat-session://local/${encoded}`);
}

function getTabInputUri(input: unknown): vscode.Uri | undefined {
  const maybeInput = input as
    | {
        uri?: vscode.Uri;
        resource?: vscode.Uri;
        sessionResource?: vscode.Uri;
      }
    | undefined;
  return maybeInput?.sessionResource ?? maybeInput?.uri ?? maybeInput?.resource;
}

function isSessionInEditorTab(sessionUri: vscode.Uri, title?: string): boolean {
  const target = sessionUri.toString();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (getTabInputUri(tab.input)?.toString() === target) {
        return true;
      }
      if (title && tab.label === title) {
        return true;
      }
    }
  }
  return false;
}

function openExternalUrl(url: string): void {
  const child = spawn("open", [url], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function getCurrentWorkspaceTargetPath(): string {
  return (
    vscode.workspace.workspaceFile?.fsPath ??
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
    ""
  );
}

function isCurrentWorkspace(workspacePath: string): boolean {
  if (vscode.workspace.workspaceFile?.fsPath === workspacePath) {
    return true;
  }

  return (
    vscode.workspace.workspaceFolders?.some(
      (folder) => folder.uri.fsPath === workspacePath,
    ) ?? false
  );
}

function buildOpenSessionUrl(
  sessionUri: vscode.Uri,
  workspacePath: string,
): string {
  const isInsiders = vscode.env.appName.toLowerCase().includes("insiders");
  const scheme = isInsiders ? "vscode-insiders" : "vscode";
  // session param = full vscode-chat-session:// URI string (what the IPC handler expects)
  const encodedSession = encodeURIComponent(sessionUri.toString());
  return `${scheme}://file${encodeURI(workspacePath)}?session=${encodedSession}`;
}

function openSessionInSidebar(sessionUri: vscode.Uri): void {
  try {
    openExternalUrl(
      buildOpenSessionUrl(sessionUri, getCurrentWorkspaceTargetPath()),
    );
  } catch {
    vscode.window.showWarningMessage("Could not open chat session.");
  }
}

async function openSessionById(
  sessionId: string,
  title?: string,
): Promise<void> {
  const sessionUri = buildSessionUri(sessionId);

  // If already open as an editor tab, activate it rather than opening in sidebar
  if (isSessionInEditorTab(sessionUri, title)) {
    try {
      await vscode.commands.executeCommand("vscode.open", sessionUri);
    } catch {
      vscode.window.showWarningMessage(
        `Could not open chat session ${sessionId}.`,
      );
    }
    return;
  }

  // Not in editor — open in sidebar via the VS Code protocol URL
  // (triggers vscode:openChatSession IPC → chatWidgetService.openSession(uri, ChatViewPaneTarget))
  openSessionInSidebar(sessionUri);
}

// ── URI handler (primary path) ────────────────────────────────────────────────
//
// Triggered by:
//   vscode[-insiders]://CaffeineCat.open-chat-session/open?session=<base64url-id>&workspace=<encoded-path>&title=<encoded-title>
//
// If the workspace doesn't match the current window, we forward the request to
// VS Code's file protocol opener. Do not use vscode.openFolder here: with
// forceNewWindow:false it replaces multi-root workspaces with a single folder.

function registerUriHandler(context: vscode.ExtensionContext) {
  const handler = vscode.window.registerUriHandler({
    async handleUri(uri: vscode.Uri) {
      if (uri.path !== "/open") {
        return;
      }

      const params = new URLSearchParams(uri.query);
      const encodedSessionId = params.get("session");
      const workspacePath = params.get("workspace");
      const title = params.get("title") ?? undefined;

      if (!encodedSessionId) {
        return;
      }

      // Raycast encodes the UUID as base64url before putting it in the URL.
      // Decode it here so openSessionById always receives a raw UUID.
      const sessionId = Buffer.from(encodedSessionId, "base64url").toString(
        "utf-8",
      );

      // If a workspace path is provided, verify we're in the right window.
      if (workspacePath && !isCurrentWorkspace(workspacePath)) {
        openExternalUrl(
          buildOpenSessionUrl(buildSessionUri(sessionId), workspacePath),
        );
        return;
      }

      await openSessionById(sessionId, title);
    },
  });

  context.subscriptions.push(handler);
}

export function activate(context: vscode.ExtensionContext) {
  registerUriHandler(context);
}

export function deactivate() {}
