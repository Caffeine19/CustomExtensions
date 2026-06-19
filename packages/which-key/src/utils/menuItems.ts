import { execFile } from "child_process";
import { environment } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

// ─── Types ───

export interface FlatMenuItem {
  key: string;
  breadcrumb: string;
  name: string;
  shortcut: string;
  hasSubmenu: boolean;
}

// ─── Core ───

/**
 * Click a menu item by its breadcrumb path using AppleScript.
 * E.g. "Code - Insiders → Preferences → Settings…" triggers that menu item.
 */
export async function clickMenuItem(appName: string, breadcrumb: string): Promise<void> {
  // Split breadcrumb: "File → Save" → ["File", "Save"]
  const segments = breadcrumb.split(" → ");
  if (segments.length < 2) throw new Error("Invalid menu path");

  // Build AppleScript reference from inside out:
  //   menu item "Save" of menu "File" of menu bar item "File" of menu bar 1
  //   menu item "More…" of menu "Open Recent" of menu item "Open Recent" of menu "File" of menu bar item "File" of menu bar 1
  let ref = `menu item "${segments[segments.length - 1]}"`;

  for (let i = segments.length - 2; i >= 1; i--) {
    ref += ` of menu "${segments[i]}" of menu item "${segments[i]}"`;
  }
  ref += ` of menu "${segments[0]}" of menu bar item "${segments[0]}" of menu bar 1`;

  const script = `
tell application "System Events"
  tell process "${appName}"
    click ${ref}
  end tell
end tell`;

  await runAppleScript(script);
}
export async function fetchAllMenus(): Promise<{ appName: string; items: FlatMenuItem[] }> {
  const scriptPath = `${environment.assetsPath}/menubar.swift`;

  const { appName, raw } = await new Promise<{ appName: string; raw: string }>((resolve, reject) => {
    execFile("swift", [scriptPath], { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      // stderr contains "APP:AppName"
      const appMatch = stderr.match(/APP:(.+)/);
      resolve({
        appName: appMatch?.[1]?.trim() ?? "Unknown",
        raw: stdout,
      });
    });
  });

  const lines = raw.split("\n").filter((s) => s.trim().length > 0);
  const result: FlatMenuItem[] = [];
  let keyIdx = 0;

  for (const line of lines) {
    const parts = line.split("|");
    const breadcrumb = parts[0] || "";
    const shortcut = parts[1] || "";
    const hasSub = parts[2] || "N";
    if (!breadcrumb) continue;

    const name = breadcrumb.split(" -> ").pop() || breadcrumb;

    result.push({
      key: `mi-${keyIdx++}`,
      breadcrumb: breadcrumb.replace(/ -> /g, " → "),
      name,
      shortcut,
      hasSubmenu: hasSub === "Y",
    });
  }

  return { appName, items: result };
}
