import {
  closeMainWindow,
  launchCommand,
  LaunchType,
  showHUD,
} from "@raycast/api";
import { tryit } from "radash";
import { listServices, toggleKerio } from "./kerio";

export default async function Command() {
  const [error, message] = await tryit(async () => {
    const services = await listServices();
    await closeMainWindow();
    return toggleKerio(services)
      .withSecoClient()
      .withTailscale()
      .withTotpCleanup()
      .run();
  })();

  // The status command can be disabled independently; ignore failures.
  await tryit(launchCommand)({ name: "status", type: LaunchType.Background });

  await showHUD(
    message ??
      (error instanceof Error ? error.message : "Could not toggle Kerio VPN"),
  );
}
