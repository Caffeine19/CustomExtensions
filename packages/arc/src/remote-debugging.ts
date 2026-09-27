import { Alert, confirmAlert, Icon, showHUD } from "@raycast/api";

import { execSync } from "child_process";
import { isArcRunning, isRemoteDebuggingActive, launchArcWithRemoteDebugging } from "./launch-arc";

export default async function main() {
  if (isArcRunning()) {
    if (isRemoteDebuggingActive()) {
      await showHUD("Arc is already running with remote debugging");
      return;
    }

    const confirmed = await confirmAlert({
      title: "Arc is Already Running",
      message: "Arc needs to be restarted with remote debugging flags. Kill and relaunch?",
      icon: Icon.Warning,
      primaryAction: { title: "Kill & Relaunch", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    execSync("killall Arc");

    // Wait briefly for the process to fully exit
    execSync("sleep 1");
  }

  try {
    launchArcWithRemoteDebugging();
    await showHUD("Arc launched with remote debugging");
  } catch (error) {
    await showHUD(`Failed to launch Arc: ${error}`);
  }
}
