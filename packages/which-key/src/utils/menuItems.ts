import { execFile } from "child_process";
import { environment } from "@raycast/api";

// ─── Types ───

export interface FlatMenuItem {
  key: string;
  breadcrumb: string;
  name: string;
  shortcut: string;
  hasSubmenu: boolean;
  /** Raw check-state character from AXMenuItemMarkChar ("" = unchecked) */
  mark: string;
  /** Whether the item is checked (mark non-empty) */
  checked: boolean;
}

export interface MenuFetchResult {
  /** Localized name of the menu-bar-owning app */
  appName: string;
  /** Bundle id of the menu-bar-owning app ("" when unknown) */
  bundleId: string;
  /** PID of the menu-bar-owning app (snapshot caches are keyed per process) */
  pid?: number;
  items: FlatMenuItem[];
}

// ─── Core ───

/**
 * Click a menu item by its breadcrumb path using the AXUIElement API via a Swift helper.
 * This uses PID-based targeting (like Hammerspoon's hs.application:selectMenuItem),
 * which is far more reliable than AppleScript/System Events process name matching.
 * A single-segment breadcrumb opens that top-level menu itself (Raycast's Show Menu).
 */
export async function clickMenuItem(appName: string, breadcrumb: string, bundleId?: string): Promise<void> {
  const segments = breadcrumb.split(" → ").filter((s) => s.trim().length > 0);
  if (segments.length < 1) throw new Error("Invalid menu path");

  const scriptPath = `${environment.assetsPath}/click-menu-item.swift`;

  await new Promise<void>((resolve, reject) => {
    execFile(
      "swift",
      [scriptPath, appName, bundleId || "-", ...segments],
      { timeout: 10000 },
      (err, _stdout, stderr) => {
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
      },
    );
  });
}
export async function fetchAllMenus(): Promise<MenuFetchResult> {
  const scriptPath = `${environment.assetsPath}/menubar.swift`;

  const { appName, bundleId, pid, raw } = await new Promise<{
    appName: string;
    bundleId: string;
    pid?: number;
    raw: string;
  }>((resolve, reject) => {
    execFile("swift", [scriptPath], { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      // stderr contains "APP:AppName", "PID:123" and optionally "BUNDLE:com.example.app"
      const appMatch = stderr.match(/APP:(.+)/);
      const pidMatch = stderr.match(/PID:(\d+)/);
      const bundleMatch = stderr.match(/BUNDLE:(.+)/);
      resolve({
        appName: appMatch?.[1]?.trim() ?? "Unknown",
        bundleId: bundleMatch?.[1]?.trim() ?? "",
        pid: pidMatch ? Number(pidMatch[1]) : undefined,
        raw: stdout,
      });
    });
  });

  const lines = raw.split("\n").filter((s) => s.trim().length > 0);
  const result: FlatMenuItem[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parts = line.split("|");
    const breadcrumb = parts[0] || "";
    const shortcut = parts[1] || "";
    const hasSub = parts[2] || "N";
    const mark = parts[3] || "";
    if (!breadcrumb) continue;

    const normalized = breadcrumb.replace(/ -> /g, " → ");
    // Dedupe by breadcrumb across groups (Raycast dedupes by item id)
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const name = breadcrumb.split(" -> ").pop() || breadcrumb;

    result.push({
      key: normalized,
      breadcrumb: normalized,
      name,
      shortcut,
      hasSubmenu: hasSub === "Y",
      mark,
      checked: mark.length > 0,
    });
  }

  return { appName, bundleId, pid, items: result };
}
