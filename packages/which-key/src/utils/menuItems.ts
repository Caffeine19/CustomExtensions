import { execFile } from "child_process";
import { environment } from "@raycast/api";

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
 * Click a menu item by its breadcrumb path using the AXUIElement API via a Swift helper.
 * This uses PID-based targeting (like Hammerspoon's hs.application:selectMenuItem),
 * which is far more reliable than AppleScript/System Events process name matching.
 */
export async function clickMenuItem(appName: string, breadcrumb: string): Promise<void> {
  const segments = breadcrumb.split(" → ");
  if (segments.length < 2) throw new Error("Invalid menu path");

  const scriptPath = `${environment.assetsPath}/click-menu-item.swift`;

  await new Promise<void>((resolve, reject) => {
    execFile("swift", [scriptPath, appName, ...segments], { timeout: 10000 }, (err, _stdout, stderr) => {
      if (stderr?.trim()) {
        console.error("[click-menu-item]", stderr.trim());
      }
      if (err) {
        // Extract the meaningful error from stderr
        const msg = stderr?.trim() || err.message;
        reject(new Error(msg));
      } else {
        resolve();
      }
    });
  });
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
