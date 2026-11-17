import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";

import { Effect, Result } from "effect";

import type { WorkspaceInfo, WorkspaceJson } from "../../../types/sessions/localSession";
import { parseJson } from "../../../utils/parseJson";
import { uriToFsPath, workspaceDisplayName } from "../../../utils/vscode";

/**
 * Yields null when workspace.json is missing (that disqualifies the workspace). A malformed payload is a schema/data
 * bug — it fails the load instead of silently dropping the workspace.
 */
export function readWorkspaceInfo(wsDir: string): Effect.Effect<WorkspaceInfo | null, unknown> {
  return Effect.gen(function* () {
    const wsJsonPath = join(wsDir, "workspace.json");
    if (!existsSync(wsJsonPath)) return null;

    const raw = yield* Effect.try(() => readFileSync(wsJsonPath, "utf-8"));
    const wsJson = parseJson<WorkspaceJson>(raw);
    if (Result.isFailure(wsJson)) return yield* Effect.fail(wsJson.failure);
    const folderUri = wsJson.success.folder || wsJson.success.workspace;
    if (!folderUri) return null;

    const decodedPath = uriToFsPath(folderUri);
    // Code-workspace files display without their extension (multi-root workspaces).
    const folderName = workspaceDisplayName(decodedPath);

    return {
      hash: basename(wsDir),
      folderPath: decodedPath,
      folderName,
    };
  });
}
