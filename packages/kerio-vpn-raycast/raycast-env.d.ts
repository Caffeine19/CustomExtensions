/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {};

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences;

declare namespace Preferences {
  /** Preferences accessible in the `diagnose` command */
  export type Diagnose = ExtensionPreferences & {};
  /** Preferences accessible in the `status` command */
  export type Status = ExtensionPreferences & {};
  /** Preferences accessible in the `toggle-connection` command */
  export type ToggleConnection = ExtensionPreferences & {};
}

declare namespace Arguments {
  /** Arguments passed to the `diagnose` command */
  export type Diagnose = {};
  /** Arguments passed to the `status` command */
  export type Status = {};
  /** Arguments passed to the `toggle-connection` command */
  export type ToggleConnection = {};
}
