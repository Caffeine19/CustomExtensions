import { Alert, confirmAlert, Icon, showHUD } from "@raycast/api";

import { execSync } from "child_process";

const DEBUG_ARGS = ["--remote-debugging-port=9333", "--remote-allow-origins=*"];

function isArcRunning(): boolean {
  try {
    execSync("pgrep -x Arc", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export default async function main() {
  if (isArcRunning()) {
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
    execSync(`open -a Arc --args ${DEBUG_ARGS.join(" ")}`);
    await showHUD("Arc launched with remote debugging");
  } catch (error) {
    await showHUD(`Failed to launch Arc: ${error}`);
  }
}
