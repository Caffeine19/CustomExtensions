/**
 * A command declared in the `commands` field of an extension manifest.
 */
export interface ExtensionCommand {
  /** Command name as defined in the manifest; used when launching the command */
  name: string;
  /** Command title displayed in the Raycast root search */
  title: string;
  /** Launch mode of the command */
  mode?: "view" | "no-view" | "menu-bar";
}

/**
 * A custom Raycast extension package discovered in the monorepo.
 */
export interface CustomExtension {
  /** Extension name as defined in the manifest */
  name: string;
  /** Extension title displayed in the Raycast root search */
  title: string;
  /** Extension description from the manifest */
  description: string;
  /** Author as defined in the manifest; used as the owner when launching commands */
  author: string;
  /** Absolute path of the extension package */
  path: string;
  /** Absolute path of the extension icon; undefined when the package has none */
  iconPath?: string;
  /** Commands declared in the manifest */
  commands: ExtensionCommand[];
  /** Most recent modification time of any file inside the package */
  updatedAt: Date;
}
