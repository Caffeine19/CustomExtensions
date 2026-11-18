import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tryit } from "radash";
import type { ToggleConcern, ToggleContext } from "./types";

const exec = promisify(execFile);

// URL fragment identifying the Kerio TOTP verification tab Kerio opens in Edge.
const totpTabFragment = "totpVerify";

// Close every Edge tab matching the Kerio TOTP page. Tabs are walked backwards
// and each close is wrapped in `try`, so dropping a tab (or its whole window)
// can't break the loop. `if not it is running` avoids launching Edge to look.
const closeScript = `
tell application "Microsoft Edge"
  if not it is running then return 0
  set closedCount to 0
  repeat with w in windows
    set tabList to tabs of w
    set tabCount to count of tabList
    repeat with i from tabCount to 1 by -1
      try
        set t to item i of tabList
        if (URL of t) contains "${totpTabFragment}" then
          close t
          set closedCount to closedCount + 1
        end if
      end try
    end repeat
  end repeat
  return closedCount
end tell
`;

/**
 * Close the Kerio TOTP verification tab(s) in Microsoft Edge.
 * Returns how many tabs were closed (0 if Edge is closed or nothing matched).
 */
export async function closeTotpTab(): Promise<number> {
  const [, out] = await tryit(async () => {
    const { stdout } = await exec("/usr/bin/osascript", ["-e", closeScript], {
      timeout: 8000,
    });
    return stdout.trim();
  })();
  const closed = Number(out);
  return Number.isFinite(closed) ? closed : 0;
}

/**
 * ToggleConcern that closes the Kerio TOTP verification tab in Edge once the
 * tunnel is up. Kerio opens this tab for second-factor sign-in and leaves it
 * behind after connecting.
 */
export function createTotpCleanupConcern(): ToggleConcern {
  return {
    name: "TotpCleanup",
    async after(ctx: ToggleContext) {
      if (ctx.phase !== "connect") return;
      // The TOTP page is only obsolete once Kerio is connected; close it then.
      if (await ctx.ensureStable()) await closeTotpTab();
    },
  };
}
