import { getEdgePath } from "./edgePaths";
import { promisifyExec } from "./promisifyExec";

export interface NewWindowOptions {
  url?: string;
  incognito?: boolean;
  windowPosition?: { x: number; y: number };
  windowSize?: { width: number; height: number };
  additionalSwitches?: string[];
  profilePath?: string; // New option for profile support
}

/**
 * https://peter.sh/experiments/chromium-command-line-switches/#window-workspace
 */

/**
 * Opens a new Microsoft Edge window
 * @param options Configuration options for the new window
 * @returns Promise that resolves when the window is launched
 */
export const openNewEdgeWindow = async (options: NewWindowOptions = {}) => {
  const edgePath = getEdgePath();

  const switches: string[] = [];

  // Add profile path if specified (and not Default)
  if (options.profilePath && options.profilePath !== "Default") {
    switches.push(`--profile-directory="${options.profilePath}"`);
  }

  // Add URL if provided (not a switch, just the URL argument)
  const urlArg = options.url ? `"${options.url}"` : null;

  // Add incognito mode if requested
  if (options.incognito) {
    switches.push("--incognito");
  }

  // Force new window
  switches.push("--new-window");

  // Add any additional switches
  if (options.additionalSwitches) {
    switches.push(...options.additionalSwitches);
  }

  // Build command arguments (URL first if provided, then switches)
  const args: string[] = [];
  if (urlArg) {
    args.push(urlArg);
  }
  args.push(...switches);

  const command = `${edgePath} ${args.join(" ")}`;

  console.log("🚀 ~ new-window.ts:57 ~ openNewEdgeWindow ~ command:", command);

  try {
    const { stdout, stderr } = await promisifyExec(command);

    if (stderr) {
      console.error("Error opening new Edge window:", stderr);
      throw new Error(`Failed to open Edge window: ${stderr}`);
    }

    if (stdout) {
      console.log("New Edge window opened successfully:", stdout);
    }

    return { success: true, stdout, stderr };
  } catch (error) {
    console.error("Failed to execute Edge command:", error);
    throw error;
  }
};
