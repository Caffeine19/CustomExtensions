import { closeMainWindow, showHUD } from "@raycast/api";
import { removeCurrentSpace } from "./utils/space";

export default async function Command() {
  try {
    // close main window because we will enter mission control
    closeMainWindow();

    await removeCurrentSpace();
    await showHUD("Space removed successfully");
  } catch (error) {
    console.error("🚀 ~ remove-current-space.ts:12 ~ Command ~ error:", error);
    showHUD(`Failed to remove space: ${error}`);
  }
}
