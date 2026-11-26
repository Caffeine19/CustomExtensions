import { showHUD } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

/**
 * Microsoft Edge adds a blank New Tab whenever a workspace is launched
 * (by design, per https://learn.microsoft.com/en-us/answers/questions/2405832).
 * Best-effort: closes the active tab of each Edge window when it is a New Tab
 * Page after the workspace opens — including extension-customized New Tab
 * pages (chrome-extension://…). Never closes the last tab of a window, and
 * never fails the launch — closing errors are reported via HUD and logged.
 */

const CLOSE_NEW_TABS_SCRIPT = /* applescript */ `
tell application "Microsoft Edge"
  set totalClosed to 0
  repeat with win in windows
    if (count of tabs of win) > 1 then
      set t to tab (active tab index of win) of win
      set u to URL of t
      set isNewTabPage to (u starts with "about:blank") or (u starts with "edge://newtab") or (u starts with "chrome://newtab") or (u starts with "chrome-extension://") or ((u is "") and ((loading of t) is false))
      if isNewTabPage then
        close t
        set totalClosed to totalClosed + 1
      end if
    end if
  end repeat
  return totalClosed as string
end tell
`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll briefly to give Edge time to open the workspace window, then close the
 * extra New Tab(s). Returns once tabs are closed or the attempts run out.
 */
export const closeExtraNewTab = async (attempts = 4, delayMs = 500): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const closed = Number(await runAppleScript(CLOSE_NEW_TABS_SCRIPT));
      console.log("🚀 ~ close-new-tab.ts:44 ~ closeExtraNewTab ~ closed:", closed);
      if (closed > 0) return;
    } catch (error) {
      console.error("Failed to close extra New Tab:", error);
      await showHUD("Failed to close extra New Tab");
      return;
    }
    await sleep(delayMs);
  }
};
