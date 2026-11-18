import {
  environment,
  LaunchType,
  showHUD,
  updateCommandMetadata,
} from "@raycast/api";
import { tryit } from "radash";
import { listServices, statusSubtitle } from "./kerio";

export default async function Command() {
  const [, subtitle] = await tryit(async () =>
    statusSubtitle(await listServices()),
  )();
  const text = subtitle ?? "Status unavailable";
  await updateCommandMetadata({ subtitle: text });
  if (environment.launchType === LaunchType.UserInitiated) {
    await showHUD(text);
  }
}
