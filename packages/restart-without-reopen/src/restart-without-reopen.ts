import { showToast, Toast, closeMainWindow, confirmAlert, Alert } from "@raycast/api";
import { promisifyExec } from "./utils/promisifyExec";

export default async function Command() {
  const res = await confirmAlert({
    title: "Restart Without Reopen",
    message: "Are you sure you want to restart your Mac without reopening windows?",
    primaryAction: {
      title: "Restart",
      style: Alert.ActionStyle.Destructive,
    },
    dismissAction: {
      title: "Cancel",
      style: Alert.ActionStyle.Cancel,
    },
  });
  if (!res) return;

  const scripts = [
    "open raycast://extensions/raycast/system/quit-all-apps",
    "sleep 30",
    // "open raycast://extensions/raycast/system/restart",
    `osascript -e 'tell application "System Events" to restart'`,
  ];

  await closeMainWindow();

  await showToast({
    style: Toast.Style.Success,
    title: "Executing restart sequence...",
    message: "Quitting apps and restarting without reopen",
  });

  try {
    await promisifyExec(scripts.join(" && "));
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Error",
      message: error instanceof Error ? error.message : "Failed to execute restart sequence",
    });
  }
}
