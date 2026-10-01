/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Client ID - Your DingTalk app Client ID (AppKey). Get it from DingTalk Open Platform (https://open.dingtalk.com). */
  "clientId": string,
  /** Client Secret - Your DingTalk app Client Secret (AppSecret). */
  "clientSecret": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-contacts` command */
  export type SearchContacts = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-contacts` command */
  export type SearchContacts = {}
}

