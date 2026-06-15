import { readFileSync } from "fs";
import JSON5 from "json5";
import * as XLSX from "xlsx";

import { SyncImport, SyncTab, SyncWorkspace } from "../types/sync-workspace";
import { WorkspaceColor } from "../types/workspace-color";

type RawRow = (string | number | boolean | null | undefined)[];

interface SyncEntity {
  edge_workspace?: {
    guid?: string;
    creation_time_windows_epoch_micros?: string;
    update_time_windows_epoch_micros?: string;
    workspace?: {
      title?: string;
      color?: string | number;
      emoji?: string;
      creation_source?: string;
      is_copilot_project_enabled?: boolean;
      visit_time_windows_epoch_micros?: string;
    };
    tab?: {
      title?: string;
      url?: string;
      favicon_url?: string;
      parent_guid?: string;
      position?: string;
    };
  };
}

const WORKSPACE_TYPE_LABEL = "Edge Workspace";

/**
 * Map a sync color value to `WorkspaceColor`. Newer `EDGE_CLIENT`-sourced
 * rows store the enum directly (0-13). Older `MIGRATION` rows store an ARGB
 * int string (e.g. "4278659911"). For ARGB we fall back to `Transparent`
 * because we cannot losslessly map arbitrary colors into the enum.
 */
const toWorkspaceColor = (value: string | number | undefined): WorkspaceColor => {
  if (value === undefined || value === null || value === "") return WorkspaceColor.Transparent;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return WorkspaceColor.Transparent;
  if (n >= 0 && n <= 13) return n as WorkspaceColor;
  return WorkspaceColor.Transparent;
};

/**
 * Join non-empty cells from column index >= `startCol` back into a single
 * string with commas — reversing the fact that Excel/Numbers split embedded
 * JSON on every comma when it wasn't properly quoted.
 */
const rejoinJsonCells = (row: RawRow, startCol: number): string => {
  const parts: string[] = [];
  for (let i = startCol; i < row.length; i++) {
    const cell = row[i];
    if (cell === null || cell === undefined || cell === "") continue;
    parts.push(String(cell));
  }
  return parts.join(",");
};

const parseEntity = (raw: string): SyncEntity | null => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "REDACTED") return null;
  // Excel/xlsx strips quotes around JSON property names when re-parsing the
  // unescaped CSV, producing things like `{guid:"...",tab:{favicon_url:"..."}}`.
  // JSON5 accepts unquoted keys so it recovers the original payload.
  try {
    return JSON5.parse(trimmed) as SyncEntity;
  } catch {
    try {
      return JSON.parse(trimmed) as SyncEntity;
    } catch {
      return null;
    }
  }
};

const findWorkspaceTypeColumn = (rows: RawRow[]): number => {
  // Find the column that holds the "Edge Workspace" label (usually column L = index 11).
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === WORKSPACE_TYPE_LABEL) return i;
    }
  }
  return -1;
};

export interface ParseResult extends Omit<SyncImport, "importedAt" | "source"> {
  warnings: string[];
}

export const parseSyncCsv = (filePath: string): ParseResult => {
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("No sheet found in file");
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { header: 1, raw: false, defval: "" });

  const typeCol = findWorkspaceTypeColumn(rows);
  if (typeCol < 0) {
    throw new Error(`Could not find a column containing "${WORKSPACE_TYPE_LABEL}". Is this an Edge sync export?`);
  }
  // Payload starts 2 columns after the type column (type, data-type-id, payload...).
  const payloadStartCol = typeCol + 2;

  const workspaces: SyncWorkspace[] = [];
  const tabs: SyncTab[] = [];
  const warnings: string[] = [];
  let totalRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    if (row[typeCol] !== WORKSPACE_TYPE_LABEL) continue;
    totalRows += 1;

    const joined = rejoinJsonCells(row, payloadStartCol);
    const entity = parseEntity(joined);
    if (!entity || !entity.edge_workspace) {
      skippedRows += 1;
      continue;
    }

    const ew = entity.edge_workspace;
    const guid = ew.guid ?? "";
    if (!guid) {
      skippedRows += 1;
      continue;
    }

    if (ew.workspace) {
      workspaces.push({
        guid,
        title: ew.workspace.title ?? "(untitled)",
        color: toWorkspaceColor(ew.workspace.color),
        emoji: ew.workspace.emoji,
        creationSource: ew.workspace.creation_source,
        isCopilotProjectEnabled: ew.workspace.is_copilot_project_enabled,
        creationTime: ew.creation_time_windows_epoch_micros,
        updateTime: ew.update_time_windows_epoch_micros,
        visitTime: ew.workspace.visit_time_windows_epoch_micros,
      });
    } else if (ew.tab) {
      const parentGuid = ew.tab.parent_guid ?? "";
      if (!parentGuid) {
        skippedRows += 1;
        continue;
      }
      tabs.push({
        guid,
        parentGuid,
        title: ew.tab.title ?? ew.tab.url ?? "(untitled)",
        url: ew.tab.url ?? "",
        faviconUrl: ew.tab.favicon_url,
        position: ew.tab.position,
        creationTime: ew.creation_time_windows_epoch_micros,
        updateTime: ew.update_time_windows_epoch_micros,
      });
    } else {
      skippedRows += 1;
    }
  }

  if (totalRows > 0 && workspaces.length === 0 && tabs.length === 0) {
    warnings.push(
      `Found ${totalRows} Edge Workspace rows but no readable payload. ` +
        `This file is likely a REDACTED export — re-export from edge://sync-internals with "Include personally identifiable data" enabled, and prefer the .xlsx variant.`,
    );
  } else if (skippedRows > 0) {
    warnings.push(`${skippedRows} row(s) skipped due to unparseable payload.`);
  }

  return { workspaces, tabs, totalRows, skippedRows, warnings };
};
