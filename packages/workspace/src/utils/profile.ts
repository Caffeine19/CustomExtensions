import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

import { EdgeProfile } from "../types/edge-profile";
import { getEdgeDataPath, getWorkspaceCacheFilePath } from "./edgePaths";

/**
 * Discover all available Microsoft Edge profiles
 * @returns Array of EdgeProfile objects representing available profiles
 */
export const discoverEdgeProfiles = (): EdgeProfile[] => {
  const edgeDataPath = getEdgeDataPath();

  if (!existsSync(edgeDataPath)) {
    return [];
  }

  const profiles: EdgeProfile[] = [];

  try {
    const items = readdirSync(edgeDataPath);
    console.log("🚀 ~ edgePaths.ts:49 ~ items:", items);

    for (const item of items) {
      const itemPath = join(edgeDataPath, item);
      console.log("🚀 ~ edgePaths.ts:53 ~ itemPath:", itemPath);

      try {
        // Skip if the item doesn't exist or can't be accessed
        if (!existsSync(itemPath)) {
          console.log(`Skipping non-existent item: ${item}`);
          continue;
        }

        // Check if it's a directory and follows profile naming pattern
        const stats = statSync(itemPath);
        if (!stats.isDirectory()) {
          continue;
        }

        const isDefaultProfile = item === "Default";
        const isNumberedProfile = item.startsWith("Profile ");

        if (!isDefaultProfile && !isNumberedProfile) {
          continue;
        }

        const workspaceCachePath = getWorkspaceCacheFilePath(item);
        const hasWorkspaces = existsSync(workspaceCachePath);

        profiles.push({
          name: item === "Default" ? "Default" : item,
          path: item,
          fullPath: itemPath,
          hasWorkspaces,
        });
      } catch (itemError) {
        // Skip problematic items (symlinks, permission issues, etc.)
        console.log(`Skipping problematic item: ${item}`, itemError);
        continue;
      }
    }
  } catch (error) {
    console.error("Error discovering Edge profiles:", error);
  }

  // Sort profiles: Default first, then Profile 2, Profile 3, etc.
  return profiles.sort((a, b) => {
    if (a.path === "Default") return -1;
    if (b.path === "Default") return 1;
    return a.path.localeCompare(b.path);
  });
};
