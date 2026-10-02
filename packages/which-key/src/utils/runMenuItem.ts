import { closeMainWindow, popToRoot } from "@raycast/api";
import { sleep } from "radash";
import { clickMenuItem } from "./menuItems";

/** Close Raycast, trigger the menu item in the target app, then return to the root view. */
export async function runMenuItem(appName: string, breadcrumb: string): Promise<void> {
  await closeMainWindow({ clearRootSearch: true });
  await sleep(150);
  await clickMenuItem(appName, breadcrumb);
  await popToRoot();
}
