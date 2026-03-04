import { Clipboard, showHUD } from "@raycast/api";

import { callHammerspoon } from "./utils/call-hammerspoon";

/**
 * Executes JavaScript code from the clipboard and shows the result in a HUD.
 */

export default async function Command() {
  const code = await Clipboard.readText();
  console.log("🚀 ~ debug.ts:11 ~ Command ~ code:", code);
  if (!code) {
    await showHUD("Clipboard is empty or not text.");
    return;
  }

  try {
    const res = callHammerspoon(code);
    console.log("🚀 ~ debug.ts:19 ~ Command ~ res:", res);
    await showHUD("Code executed successfully");
  } catch (error) {
    console.error("🚀 ~ debug.ts:22 ~ Command ~ error:", error);
    await showHUD(`Error: ${error}`);
  }
}
