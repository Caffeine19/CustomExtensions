import { WorkspaceColor } from "./workspace-color";

export interface WorkspaceCache {
  edgeWorkspaceCacheVersion: number;
  workspaces: Workspace[];
}

export interface Workspace {
  /**
   * the workspace window is opened
   */
  accent: boolean;
  /**
   * the opened workspace window is in visible space
   */
  active: boolean;
  collaboratorsCount: number;
  color: WorkspaceColor;
  connectionUrl: string;
  count: number;
  edgeWorkspaceVersion: number;
  id: string;
  isOwner: boolean;
  isolated: boolean;
  menuSubtitle: string;
  name: string;
  shared: boolean;
  showDisconnectedUI: boolean;
  workspaceFluidStatus: number;
  last_active_time?: number;
  sharingUrl?: string;
  /**
   * The profile this workspace belongs to
   */
  profilePath?: string;
  profileName?: string;
}
