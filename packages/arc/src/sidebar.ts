import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Space, SpaceIcon } from "./types";

/**
 * Arc's sidebar data file (private format that may change between versions).
 * Spaces live under `sidebar.containers[*].spaces`; the array interleaves ID strings with space objects.
 */
const SIDEBAR_PATH = join(homedir(), "Library", "Application Support", "Arc", "StorableSidebar.json");

type SidebarIconType = {
  emoji?: number;
  emoji_v2?: string;
  icon?: string;
};

type SidebarSpace = {
  id?: string;
  title?: string;
  customInfo?: { iconType?: SidebarIconType };
};

type SidebarFile = {
  sidebar?: {
    containers?: Array<{ spaces?: Array<string | SidebarSpace> }>;
  };
};

function parseIcon(iconType: SidebarIconType | undefined): SpaceIcon | undefined {
  if (!iconType) {
    return undefined;
  }

  if (iconType.emoji_v2) {
    return { emoji: iconType.emoji_v2 };
  }

  if (typeof iconType.emoji === "number") {
    try {
      return { emoji: String.fromCodePoint(iconType.emoji) };
    } catch {
      return undefined;
    }
  }

  return iconType.icon ? { ionicon: iconType.icon } : undefined;
}

/**
 * Reads every space (with its icon) from Arc's StorableSidebar.json.
 * Returns undefined instead of throwing when reading or parsing fails.
 */
export async function readSidebarSpaces(): Promise<Space[] | undefined> {
  let raw: string;
  try {
    raw = await readFile(SIDEBAR_PATH, "utf-8");
  } catch {
    return undefined;
  }

  let data: SidebarFile;
  try {
    data = JSON.parse(raw) as SidebarFile;
  } catch {
    return undefined;
  }

  const spaces: Space[] = [];
  for (const container of data.sidebar?.containers ?? []) {
    for (const entry of container.spaces ?? []) {
      if (typeof entry !== "object" || entry === null || !entry.id) {
        continue;
      }

      spaces.push({
        id: entry.id,
        title: entry.title,
        isActive: false,
        icon: parseIcon(entry.customInfo?.iconType),
      });
    }
  }

  return spaces;
}
