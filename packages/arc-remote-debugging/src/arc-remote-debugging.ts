import { showToast, Toast } from "@raycast/api";

import { execSync } from "child_process";
export default async function main() {
  const toast = await showToast(Toast.Style.Animated, "Launching Arc…");
  try {
    execSync("/Applications/Arc.app/Contents/MacOS/Arc --remote-debugging-port=9333 '--remote-allow-origins=*'");
    toast.style = Toast.Style.Success;
    toast.title = "Arc launched with remote debugging";
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to launch Arc";
    toast.message = String(error);
  }
}
