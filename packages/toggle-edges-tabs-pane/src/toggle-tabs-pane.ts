import { closeMainWindow } from "@raycast/api";
import { callHammerspoon } from "./utils/call-hammerspoon";

export default async function command() {
  closeMainWindow();
  const code = /* lua */ `
  handleCallToggleEdgeTabsFromShortcut() 
`;

  try {
    await callHammerspoon(code);
  } catch (error) {
    console.log("🚀 ~ toggle-tabs-pane.ts:111 ~ command ~ error:", error);
  }
}
