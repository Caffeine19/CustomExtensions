import {
  environment,
  launchCommand,
  LaunchType,
  open,
  showToast,
  Toast,
} from "@raycast/api";
import { showFailureToast } from "@raycast/utils";

import { CustomExtension, ExtensionCommand } from "../types/extension";

/** Editor applications used to open a package, tried in order of preference */
const EDITOR_APPLICATIONS = [
  "Visual Studio Code - Insiders",
  "Visual Studio Code",
  "Cursor",
];

/**
 * Creates the Raycast deeplink that launches a command of a custom extension.
 *
 * @param extension - The extension that owns the command
 * @param command - The command to launch
 * @returns The deeplink URL
 */
export function createDeepLink(
  extension: CustomExtension,
  command: ExtensionCommand,
): string {
  const protocol = environment.raycastVersion.includes("alpha")
    ? "raycastinternal://"
    : "raycast://";
  return `${protocol}extensions/${extension.author}/${extension.name}/${command.name}`;
}

/**
 * Launches a command of a custom extension. Failures are reported as a toast,
 * e.g. when the extension is not installed or not enabled in Raycast.
 *
 * @param extension - The extension that owns the command
 * @param command - The command to launch
 */
export async function launchExtensionCommand(
  extension: CustomExtension,
  command: ExtensionCommand,
): Promise<void> {
  try {
    await launchCommand({
      ownerOrAuthorName: extension.author,
      extensionName: extension.name,
      name: command.name,
      type: LaunchType.UserInitiated,
    });
  } catch (error) {
    await showFailureToast(error, {
      title: `Failed to Launch "${command.title}"`,
      message:
        "Make sure the extension is installed and enabled in Raycast, or running via `ray develop`.",
    });
  }
}

/**
 * Opens the package directory in Finder.
 *
 * @param extension - The extension package to reveal
 */
export async function openPackageInFinder(
  extension: CustomExtension,
): Promise<void> {
  try {
    await open(extension.path);
  } catch (error) {
    await showFailureToast(error, {
      title: "Failed to Open Package in Finder",
    });
  }
}

/**
 * Opens the package directory in the first available code editor.
 *
 * @param extension - The extension package to edit
 */
export async function openPackageInEditor(
  extension: CustomExtension,
): Promise<void> {
  for (const application of EDITOR_APPLICATIONS) {
    try {
      await open(extension.path, application);
      return;
    } catch {
      // try the next editor application
    }
  }
  await showToast({
    style: Toast.Style.Failure,
    title: "Failed to Open Package in Editor",
  });
}
