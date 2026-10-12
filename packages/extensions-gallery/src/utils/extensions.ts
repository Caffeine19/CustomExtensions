import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

import { getPreferenceValues } from "@raycast/api";

import { CustomExtension, ExtensionCommand } from "../types/extension";

/** Fallback packages root used when auto-detection fails */
const FALLBACK_PACKAGES_ROOT =
  "/Volumes/Dev/Code/raycast/CustomExtensions/packages";

/** Directory names that never contain meaningful source changes */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  ".git",
  ".swiftpm",
  "compiled_raycast_swift",
  "compiled_raycast_rust",
]);

/** Maximum recursion depth when scanning a package for the last modification time */
const MAX_SCAN_DEPTH = 8;

/** The subset of the extension manifest that is read from `package.json` */
interface ExtensionManifest {
  name?: string;
  title?: string;
  description?: string;
  author?: string | { name?: string };
  icon?: string;
  commands?: Array<{ name?: string; title?: string; mode?: string }>;
}

/**
 * Finds the monorepo `packages` directory by walking up from `startDir`.
 *
 * @param startDir - Directory to start the search from
 * @returns Absolute path of the packages directory, or undefined when not found
 */
function findPackagesRoot(startDir: string): string | undefined {
  let dir = startDir;
  for (let depth = 0; depth < 8; depth++) {
    const packagesRoot = path.join(dir, "packages");
    if (
      existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
      existsSync(packagesRoot)
    ) {
      return packagesRoot;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

/**
 * Resolves the packages root: the preference value first, then auto-detection from
 * the bundle location and the working directory, then the hardcoded fallback.
 *
 * @returns Absolute path of the packages directory
 */
function resolvePackagesRoot(): string {
  const preferences = getPreferenceValues();
  const configured = String(preferences.packagesPath ?? "").trim();
  if (configured) {
    return configured;
  }
  return (
    findPackagesRoot(__dirname) ??
    findPackagesRoot(process.cwd()) ??
    FALLBACK_PACKAGES_ROOT
  );
}

/**
 * Returns the most recent modification time (in milliseconds) of any file inside `dir`.
 *
 * @param dir - Directory to scan
 * @param depth - Current recursion depth
 * @returns Modification time in milliseconds since the Unix epoch
 */
async function getLastModified(dir: string, depth = 0): Promise<number> {
  if (depth > MAX_SCAN_DEPTH) {
    return 0;
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let latest = 0;
  for (const entry of entries) {
    // skip symlinks, hidden entries and dependency directories
    if (entry.isSymbolicLink() || entry.name.startsWith(".")) {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      latest = Math.max(latest, await getLastModified(entryPath, depth + 1));
    } else if (entry.isFile()) {
      try {
        latest = Math.max(latest, (await fs.stat(entryPath)).mtimeMs);
      } catch {
        // ignore files that cannot be read
      }
    }
  }
  return latest;
}

/**
 * Resolves the icon of an extension package, preferring the icon from the manifest.
 *
 * @param dir - Absolute path of the extension package
 * @param icon - Icon file name from the manifest
 * @returns Absolute path of the icon file, or undefined when the package has none
 */
function resolveIconPath(dir: string, icon?: string): string | undefined {
  const assetsDir = path.join(dir, "assets");
  for (const candidate of [icon, "icon.png", "extension-icon.png"]) {
    if (!candidate) {
      continue;
    }
    const iconPath = path.join(assetsDir, candidate);
    if (existsSync(iconPath)) {
      return iconPath;
    }
  }
  return undefined;
}

/**
 * Reads a single extension package from disk.
 *
 * @param dir - Absolute path of the extension package
 * @returns The parsed extension, or null when the directory is not a Raycast extension package
 */
async function readExtension(dir: string): Promise<CustomExtension | null> {
  let manifest: ExtensionManifest;
  try {
    manifest = JSON.parse(
      await fs.readFile(path.join(dir, "package.json"), "utf8"),
    ) as ExtensionManifest;
  } catch {
    return null;
  }

  const commands: ExtensionCommand[] = [];
  for (const command of manifest.commands ?? []) {
    if (command.name && command.title) {
      commands.push({
        name: command.name,
        title: command.title,
        mode: command.mode as ExtensionCommand["mode"],
      });
    }
  }

  if (!manifest.name || !manifest.title || commands.length === 0) {
    return null;
  }

  return {
    name: manifest.name,
    title: manifest.title,
    description: manifest.description ?? "",
    author:
      typeof manifest.author === "string"
        ? manifest.author
        : (manifest.author?.name ?? ""),
    path: dir,
    iconPath: resolveIconPath(dir, manifest.icon),
    commands,
    updatedAt: new Date(await getLastModified(dir)),
  };
}

/**
 * Discovers all custom Raycast extension packages inside the monorepo.
 *
 * @returns The extension packages sorted by title
 * @throws Error when the packages directory cannot be found or holds no extensions
 */
export async function getCustomExtensions(): Promise<CustomExtension[]> {
  const packagesRoot = resolvePackagesRoot();

  let entries;
  try {
    entries = await fs.readdir(packagesRoot, { withFileTypes: true });
  } catch {
    throw new Error(
      `Packages directory not found: ${packagesRoot}. Set a custom path in the command preferences.`,
    );
  }

  const packages = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules",
      )
      .map((entry) => readExtension(path.join(packagesRoot, entry.name))),
  );

  const extensions = packages.filter(
    (extension): extension is CustomExtension => extension !== null,
  );
  if (extensions.length === 0) {
    throw new Error(`No Raycast extension packages found in ${packagesRoot}.`);
  }

  return extensions.sort((a, b) => a.title.localeCompare(b.title));
}
