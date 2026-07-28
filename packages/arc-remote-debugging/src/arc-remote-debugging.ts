import { showHUD } from "@raycast/api";

import { execSync } from "child_process";
export default async function main() {
  execSync("/Applications/Arc.app/Contents/MacOS/Arc --remote-debugging-port=9333 '--remote-allow-origins=*'");
  await showHUD("Arc launched with remote debugging");
}
