import { closeMainWindow, popToRoot, showToast, Toast } from "@raycast/api";

import { getEdgePath } from "./edgePaths";
import { promisifyExec } from "./promisifyExec";

/**
 * Launch an Edge workspace by its GUID. `profilePath` is optional — when
 * missing (as is the case for data imported from a sync dump) Edge will
 * launch the workspace in whatever profile currently owns it.
 */
export const launchWorkspaceByGuid = async (guid: string, profilePath?: string): Promise<void> => {
  const edgePath = getEdgePath();
  const profileArg = profilePath && profilePath !== "Default" ? `--profile-directory="${profilePath}"` : "";
  const command = `${edgePath} ${profileArg} --launch-workspace="${guid}"`.trim();

  try {
    const { stderr } = await promisifyExec(command);
    if (stderr) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to launch workspace", message: stderr });
      return;
    }
    await closeMainWindow();
    await popToRoot();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to launch workspace",
      message: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
};
