// ── VS Code Recent Project Entry Types ──────────────────────────────────────
// Mirrors the structure stored in VS Code's state.vscdb under
// 'history.recentlyOpenedPathsList'

export type FileEntry = {
  fileUri: string;
};

export type FolderEntry = {
  folderUri: string;
};

export type WorkspaceEntry = {
  workspace: {
    configPath: string;
  };
};

export type RemoteEntry = {
  folderUri: string;
  remoteAuthority: string;
  label: string;
};

export type RemoteWorkspaceEntry = {
  workspace: {
    configPath: string;
  };
  remoteAuthority: string;
  label?: string;
};

export type EntryLike = FolderEntry | FileEntry | WorkspaceEntry | RemoteEntry | RemoteWorkspaceEntry;

export type RecentEntries = {
  entries: string;
};

// ── Resolved project for UI ─────────────────────────────────────────────────

export interface RecentProject {
  name: string;
  path: string;
  entryType: "folder" | "workspace" | "file";
}
