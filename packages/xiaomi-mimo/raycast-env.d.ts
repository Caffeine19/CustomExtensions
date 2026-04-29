/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Cookie - Your Xiaomi MiMo platform cookie. Copy it from the browser DevTools (Network tab → any API request → Cookie header). */
  "cookie": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `view-mimo-usage` command */
  export type ViewMimoUsage = ExtensionPreferences & {}
  /** Preferences accessible in the `mimo-usage-menubar` command */
  export type MimoUsageMenubar = ExtensionPreferences & {}
  /** Preferences accessible in the `update-cookie` command */
  export type UpdateCookie = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `view-mimo-usage` command */
  export type ViewMimoUsage = {}
  /** Arguments passed to the `mimo-usage-menubar` command */
  export type MimoUsageMenubar = {}
  /** Arguments passed to the `update-cookie` command */
  export type UpdateCookie = {}
}

