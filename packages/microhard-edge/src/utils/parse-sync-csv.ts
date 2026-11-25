import { readFileSync } from "fs";

import { SyncImport, SyncTab, SyncWorkspace } from "../types/sync-workspace";
import { WorkspaceColor } from "../types/workspace-color";

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

/** Entity payloads sit 2 columns after the type column (type, data-type-id, payload...). */
const PAYLOAD_OFFSET = 2;

/** How many leading fields to inspect when locating the type column. */
const MAX_META_FIELDS = 32;

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

const parseEntity = (raw: string): SyncEntity | null => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "REDACTED") return null;
  try {
    return JSON.parse(trimmed) as SyncEntity;
  } catch {
    return null;
  }
};

/**
 * Split only the first `fieldCount` comma-separated fields off a raw line and
 * report where the remaining payload starts. The metadata fields (ids, the
 * type label) never contain commas, so the payload — unquoted JSON full of
 * commas — is left untouched.
 */
const splitRowPrefix = (line: string, fieldCount: number): { fields: string[]; payloadStart: number } => {
  const fields: string[] = [];
  let start = 0;
  while (fields.length < fieldCount) {
    const comma = line.indexOf(",", start);
    if (comma === -1) {
      fields.push(line.slice(start));
      return { fields, payloadStart: line.length };
    }
    fields.push(line.slice(start, comma));
    start = comma + 1;
  }
  return { fields, payloadStart: start };
};

/** Undo RFC4180 quoting for exports that wrote the payload as one quoted cell. */
const unquoteCell = (raw: string): string => {
  const value = raw.trim();
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/""/g, '"');
  }
  return value;
};

/**
 * Extract entity payloads from a raw sync-data-dump .csv. The dump interleaves
 * a JSON status report and writes each entity payload as unquoted JSON, so a
 * real CSV parser splits the payload on every comma and strips its quote
 * characters (`"guid":"..."` comes back as `guid":"...`). Slice payloads out
 * of the raw line text instead; entities are serialized compactly, one per
 * line.
 */
const parseTextDump = (buffer: Buffer): string[] => {
  const lines = buffer
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/);

  let typeCol = -1;
  for (const line of lines) {
    if (!line) continue;
    const { fields } = splitRowPrefix(line, MAX_META_FIELDS);
    const index = fields.findIndex((field) => field === WORKSPACE_TYPE_LABEL);
    if (index >= 0 && fields[index + PAYLOAD_OFFSET]) {
      typeCol = index;
      break;
    }
  }
  if (typeCol < 0) return [];

  const payloads: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const { fields, payloadStart } = splitRowPrefix(line, typeCol + PAYLOAD_OFFSET);
    if (fields[typeCol] !== WORKSPACE_TYPE_LABEL) continue;
    const payload = unquoteCell(line.slice(payloadStart));
    if (payload) payloads.push(payload);
  }
  return payloads;
};

interface CollectedEntries {
  workspaces: SyncWorkspace[];
  tabs: SyncTab[];
  totalRows: number;
  skippedRows: number;
}

const collectEntries = (payloads: string[]): CollectedEntries => {
  const workspaces: SyncWorkspace[] = [];
  const tabs: SyncTab[] = [];
  let skippedRows = 0;

  for (const raw of payloads) {
    const entity = parseEntity(raw);
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

  return { workspaces, tabs, totalRows: payloads.length, skippedRows };
};

export interface ParseResult extends Omit<SyncImport, "importedAt" | "source"> {
  warnings: string[];
}

export const parseSyncCsv = (filePath: string): ParseResult => {
  const buffer = readFileSync(filePath);
  const payloads = parseTextDump(buffer);
  if (payloads.length === 0) {
    throw new Error(`Could not find a column containing "${WORKSPACE_TYPE_LABEL}". Is this an Edge sync export?`);
  }

  const result = collectEntries(payloads);
  const warnings: string[] = [];
  if (result.workspaces.length === 0 && result.tabs.length === 0) {
    warnings.push(
      `Found ${result.totalRows} Edge Workspace rows but no readable payload. ` +
        `This file is likely a REDACTED export — re-export from edge://sync-internals with "Include personally identifiable data" enabled.`,
    );
  } else if (result.skippedRows > 0) {
    warnings.push(`${result.skippedRows} row(s) skipped due to unparseable payload.`);
  }

  return {
    workspaces: result.workspaces,
    tabs: result.tabs,
    totalRows: result.totalRows,
    skippedRows: result.skippedRows,
    warnings,
  };
};
