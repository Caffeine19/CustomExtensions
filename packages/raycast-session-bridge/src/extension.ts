import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri): void {
        const link = new URLSearchParams(uri.query).get("link");
        if (!link) return;
        // Delegate to the workbench opener service: `vscode.open` without options lands there, and the
        // agent-session opener reveals an already-open chat editor (cold tabs included), otherwise
        // opens the chat in the sidebar.
        void vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(link),
        );
      },
    }),
  );
}

export function deactivate(): void {}
