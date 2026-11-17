import { execFile } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { Effect, pipe, Result } from "effect";

import { RecentProjectsError } from "../../types/errors";
import {
  EntryLike,
  FileEntry,
  FolderEntry,
  RecentEntries,
  RecentProject,
  WorkspaceEntry,
} from "../../types/recentProjects";
import { parseJson } from "../../utils/parseJson";
import { type VSCodeVariant, getAppSupportDir, getVariant } from "../../utils/vscode";

const isFolderEntry = (entry: EntryLike): entry is FolderEntry => "folderUri" in entry;

const isWorkspaceEntry = (entry: EntryLike): entry is WorkspaceEntry =>
  "workspace" in entry && !("remoteAuthority" in entry);

const isFileEntry = (entry: EntryLike): entry is FileEntry => "fileUri" in entry;

/**
 * VS Code 1.118+ moved `history.recentlyOpenedPathsList` from `globalStorage/state.vscdb` (APPLICATION scope) to
 * `~/.<sharedDataFolderName>/sharedStorage/state.vscdb` (APPLICATION_SHARED scope).
 */
const sharedDataFolderNames: Record<VSCodeVariant, string> = {
  insiders: ".vscode-insiders-shared",
  stable: ".vscode-shared",
};

/**
 * Resolve the path to the VS Code SQLite database that stores recent entries. Checks the new shared storage location
 * first, then falls back to legacy.
 */
const getDbPath = (): string => {
  const variant = getVariant();

  const sharedPath = join(homedir(), sharedDataFolderNames[variant], "sharedStorage/state.vscdb");
  if (existsSync(sharedPath)) {
    return sharedPath;
  }

  return join(getAppSupportDir(variant), "User/globalStorage/state.vscdb");
};

const SQL_QUERY =
  "SELECT json_extract(value, '$.entries') as entries FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'";

/** Query VS Code's SQLite database for recent entries via `sqlite3` CLI. */
const queryRecentEntries = (dbPath: string): Effect.Effect<EntryLike[], RecentProjectsError> =>
  Effect.callback<string, RecentProjectsError>((resume) => {
    execFile("/usr/bin/sqlite3", ["-json", dbPath, SQL_QUERY], { encoding: "utf-8" }, (error, stdout) => {
      if (error) {
        resume(Effect.fail(new RecentProjectsError({ message: "Failed to query VS Code database", cause: error })));
        return;
      }
      resume(Effect.succeed(stdout));
    });
  }).pipe(
    Effect.flatMap((stdout) => {
      const rows = parseJson<RecentEntries[]>(stdout.trim() || "[]");
      if (Result.isFailure(rows)) {
        return Effect.fail(new RecentProjectsError({ message: "Failed to parse recent entries", cause: rows.failure }));
      }
      const entries = rows.success[0]?.entries;
      if (!entries) return Effect.succeed([]);
      const parsed = parseJson<EntryLike[]>(entries);
      if (Result.isFailure(parsed)) {
        return Effect.fail(
          new RecentProjectsError({ message: "Failed to parse recent entries", cause: parsed.failure }),
        );
      }
      return Effect.succeed(parsed.success);
    }),
  );

/** Extract the file URI from an entry, if applicable. */
const entryToUri = (entry: EntryLike): string | undefined => {
  if (isFolderEntry(entry)) return entry.folderUri;
  if (isWorkspaceEntry(entry)) return entry.workspace.configPath;
  if (isFileEntry(entry)) return entry.fileUri;
  return undefined;
};

/** Map a raw VS Code entry to a `RecentProject`, or `null` if unsupported. */
const entryToProject = (entry: EntryLike): RecentProject | null => {
  const uri = entryToUri(entry);
  if (!uri) return null;

  const entryType = isFolderEntry(entry) ? "folder" : isWorkspaceEntry(entry) ? "workspace" : "file";

  try {
    const url = new URL(uri);
    const decodedPath = decodeURIComponent(url.pathname);
    const name = decodedPath.split("/").filter(Boolean).pop() || decodedPath;
    return { name, path: decodedPath, entryType };
  } catch {
    return null;
  }
};

const isValidProject = (project: RecentProject | null): project is RecentProject => {
  return project !== null && existsSync(project.path);
};

/**
 * Fetch recent projects from VS Code's SQLite database.
 *
 * Returns an `Effect` that resolves to an array of `RecentProject`.
 */
export const fetchRecentProjects = (): Effect.Effect<RecentProject[], RecentProjectsError> =>
  pipe(getDbPath(), (dbPath) => {
    return existsSync(dbPath)
      ? pipe(
          dbPath,
          queryRecentEntries,
          Effect.map((entries) => entries.map(entryToProject).filter(isValidProject)),
        )
      : Effect.succeed([] as RecentProject[]);
  });
