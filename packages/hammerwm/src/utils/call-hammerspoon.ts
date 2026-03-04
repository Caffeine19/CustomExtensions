import { runAppleScript } from "@raycast/utils";

export async function callHammerspoon(code: string) {
  const escapedCode = code
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/"/g, '\\"') // Escape quotes
    .replace(/\n/g, "\\n") // Replace newlines with \n
    .replace(/\r/g, "\\r") // Replace carriage returns
    .replace(/\t/g, "\\t"); // Replace tabs

  const script = /* applescript */ `
        try
            tell application "Hammerspoon"
                execute lua code "${escapedCode}"
            end tell
        on error errMsg
            return "HAMMERSPOON_ERROR: " & errMsg
        end try
  `;

  const res = await runAppleScript(script);
  console.log("🚀 ~ call-hammerspoon.ts:22 ~ callHammerspoon ~ res:", res);

  if (typeof res === "string" && res.startsWith("HAMMERSPOON_ERROR:")) {
    throw new Error(res.replace("HAMMERSPOON_ERROR: ", ""));
  }

  return res;
}
