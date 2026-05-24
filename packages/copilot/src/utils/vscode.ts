import { getPreferenceValues } from "@raycast/api";

// ── Preferences ──────────────────────────────────────────────────────────────

export function getVariant(): "insiders" | "stable" {
  const prefs = getPreferenceValues();
  return prefs.vscodeVariant;
}

export function getCliCommand(): string {
  return getVariant() === "insiders" ? "code-insiders" : "code";
}

export function getScheme(): "vscode-insiders" | "vscode" {
  return getVariant() === "insiders" ? "vscode-insiders" : "vscode";
}
