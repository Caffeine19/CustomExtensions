import { existsSync, readFileSync } from "fs";
import { alphabetical } from "radash";

import { Workspace, WorkspaceCache } from "../types/workspace-cache";
import { getWorkspaceCacheFilePath } from "./edgePaths";
import { discoverEdgeProfiles } from "./profile";

export const readWorkspaceCacheFile = (profilePath: string): Workspace[] => {
  const workspaceCacheFilePath = getWorkspaceCacheFilePath(profilePath);

  if (!existsSync(workspaceCacheFilePath)) {
    return [];
  }

  try {
    const res = readFileSync(workspaceCacheFilePath, "utf-8").toString();
    const json = JSON.parse(res) as WorkspaceCache;

    // Add profile information to each workspace
    return json.workspaces.map((workspace) => ({
      ...workspace,
      profilePath,
      profileName: profilePath === "Default" ? "Default" : profilePath,
    }));
  } catch (error) {
    console.error(`Error reading workspace cache for profile ${profilePath}:`, error);
    return [];
  }
};

export const readAllWorkspaceCacheFiles = (): Workspace[] => {
  const profiles = discoverEdgeProfiles();
  const allWorkspaces: Workspace[] = [];

  for (const profile of profiles) {
    if (profile.hasWorkspaces) {
      const workspaces = readWorkspaceCacheFile(profile.path);
      allWorkspaces.push(...workspaces);
    }
  }

  return alphabetical(allWorkspaces, (w) => w.name);
};
