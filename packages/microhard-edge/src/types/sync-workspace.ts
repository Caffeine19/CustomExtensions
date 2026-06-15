import { WorkspaceColor } from "./workspace-color";

export interface SyncWorkspace {
  guid: string;
  title: string;
  color: WorkspaceColor;
  emoji?: string;
  creationSource?: string;
  isCopilotProjectEnabled?: boolean;
  creationTime?: string;
  updateTime?: string;
  visitTime?: string;
}

export interface SyncTab {
  guid: string;
  parentGuid: string;
  title: string;
  url: string;
  faviconUrl?: string;
  position?: string;
  creationTime?: string;
  updateTime?: string;
}

export interface SyncImport {
  importedAt: number;
  source: string;
  workspaces: SyncWorkspace[];
  tabs: SyncTab[];
  /**
   * Total rows recognized as `Edge Workspace` entries in the CSV (regardless of
   * whether they were parseable — useful to detect REDACTED exports).
   */
  totalRows: number;
  /**
   * Number of rows whose payload could not be JSON-parsed (usually REDACTED).
   */
  skippedRows: number;
}
