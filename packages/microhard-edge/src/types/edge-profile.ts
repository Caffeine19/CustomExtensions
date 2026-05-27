/**
 * Types for Microsoft Edge profiles
 */

export interface EdgeProfile {
  /**
   * The display name of the profile (e.g., "Default", "Profile 2", "Profile 3")
   */
  name: string;

  /**
   * The directory name of the profile (e.g., "Default", "Profile 2", "Profile 3")
   */
  path: string;

  /**
   * The full path to the profile directory
   */
  fullPath: string;

  /**
   * Whether this profile has workspaces available
   */
  hasWorkspaces: boolean;
}
