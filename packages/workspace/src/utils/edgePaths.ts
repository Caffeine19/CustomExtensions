/**
 * Utility functions for Microsoft Edge paths and configuration
 */

/**
 * Get the path to the Microsoft Edge executable
 * @returns The full path to Microsoft Edge on macOS
 */
export const getEdgePath = (): string => {
  return "/Applications/Microsoft\\ Edge.app/Contents/MacOS/Microsoft\\ Edge";
};

/**
 * Get the base path to Microsoft Edge data directory
 * @returns The full path to Microsoft Edge data directory
 */
export const getEdgeDataPath = (): string => {
  return `${process.env.HOME}/Library/Application Support/Microsoft Edge`;
};

/**
 * Get the path to the Edge Workspaces cache file for a specific profile
 * @param profilePath The profile directory name (e.g., "Default", "Profile 2")
 * @returns The full path to the WorkspacesCache file
 */
export const getWorkspaceCacheFilePath = (profilePath: string = "Default"): string => {
  return `${getEdgeDataPath()}/${profilePath}/Workspaces/WorkspacesCache`;
};
