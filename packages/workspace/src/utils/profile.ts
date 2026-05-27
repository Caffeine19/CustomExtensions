import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

import { EdgeProfile } from "../types/edge-profile";
import {
  getEdgeDataPath,
  getLocalStatePath,
  getWorkspaceCacheFilePath,
} from "./edgePaths";

/**
 * Load profile names from Edge's Local State file
 * @returns A map of profile directory names to display names
 */
const loadProfileNames = (): Map<string, string> => {
  const profileNames = new Map<string, string>();

  try {
    const localStatePath = getLocalStatePath();
    if (!existsSync(localStatePath)) {
      return profileNames;
    }

    const edgeState = readFileSync(localStatePath, "utf-8");
    const profiles = JSON.parse(edgeState).profile?.info_cache;

    if (profiles) {
      Object.entries<{ name: string; user_name: string }>(profiles).forEach(
        ([key, val]) => {
          // For Default profile, always use "Default" since users can't rename it
          if (key === "Default") {
            profileNames.set(key, "Default");
            return;
          }
          // Prefer 'name' field (user-set profile label), fallback to 'user_name' (signed-in account)
          const displayName = val.name || val.user_name;
          if (displayName) {
            profileNames.set(key, displayName);
          }
        },
      );
    }
  } catch (error) {
    console.error("Error loading profile names from Local State:", error);
  }

  return profileNames;
};

/**
 * Discover all available Microsoft Edge profiles
 * @returns Array of EdgeProfile objects representing available profiles
 */
export const discoverEdgeProfiles = (): EdgeProfile[] => {
  const edgeDataPath = getEdgeDataPath();

  if (!existsSync(edgeDataPath)) {
    return [];
  }

  const profileNames = loadProfileNames();
  const profiles: EdgeProfile[] = [];

  try {
    const items = readdirSync(edgeDataPath);

    for (const item of items) {
      const itemPath = join(edgeDataPath, item);

      try {
        // Skip if the item doesn't exist or can't be accessed
        if (!existsSync(itemPath)) {
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

        // Get the display name from Local State, fallback to directory name
        const displayName =
          profileNames.get(item) || (isDefaultProfile ? "Default" : item);

        profiles.push({
          name: displayName,
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
