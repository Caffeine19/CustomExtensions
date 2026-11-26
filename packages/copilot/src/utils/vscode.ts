import { existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";

import { getPreferenceValues } from "@raycast/api";

/** VS Code variant preference (auto-generated type from raycast-env.d.ts). */
export type VSCodeVariant = Preferences["vscodeVariant"];

/** Both supported variants; used where the extension reads data across all installs. */
export const VSCODE_VARIANTS: readonly VSCodeVariant[] = ["insiders", "stable"];

export function getVariant(): VSCodeVariant {
  const prefs = getPreferenceValues();
  return prefs.vscodeVariant;
}

export function getCliCommand(): string {
  return getVariant() === "insiders" ? "code-insiders" : "code";
}

export function getScheme(): "vscode-insiders" | "vscode" {
  return getVariant() === "insiders" ? "vscode-insiders" : "vscode";
}

/** The Raycast session bridge companion (packages/raycast-session-bridge): reveals already-open chat editors. */
export function isSessionBridgeInstalled(): boolean {
  const extensionsDir = join(homedir(), getVariant() === "insiders" ? ".vscode-insiders" : ".vscode", "extensions");
  return (
    existsSync(extensionsDir) &&
    readdirSync(extensionsDir).some((entry) => entry.startsWith("caffeinecat.raycast-session-bridge"))
  );
}

/** `~/Library/Application Support/Code - Insiders` (or `Code`) for the given variant. */
export function getAppSupportDir(variant: VSCodeVariant): string {
  const home = homedir();
  switch (variant) {
    case "insiders":
      return join(home, "Library/Application Support/Code - Insiders");
    case "stable":
      return join(home, "Library/Application Support/Code");
  }
}

export function getWorkspaceStorageDir(variant: VSCodeVariant): string {
  return join(getAppSupportDir(variant), "User/workspaceStorage");
}

/** Decode a `file://` URI (including the `localhost` authority form) to a local fs path. */
export function uriToFsPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, "").replace(/^localhost/, ""));
}

/** Display name of a workspace path: the folder name, or the code-workspace file name without its extension. */
export function workspaceDisplayName(fsPath: string): string {
  return basename(fsPath).replace(/\.code-workspace$/, "");
}
