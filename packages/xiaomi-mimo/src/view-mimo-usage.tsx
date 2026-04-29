import {
  Action,
  ActionPanel,
  Icon,
  launchCommand,
  LaunchType,
  List,
  open,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { fetchMiMoUsage } from "./utils/mimo-api";
import { MiMoUsageData } from "./types/mimo-usage";
import { AuthenticationError } from "./types/errors";
import UsageSection from "./components/usage-section";

const MIMO_CONSOLE_URL = "https://platform.xiaomimimo.com/console/plan-manage";

export default function Command() {
  const { data, isLoading, error, revalidate } = usePromise(async () => {
    return fetchMiMoUsage();
  });

  const isAuthError = error instanceof AuthenticationError;

  if (error) {
    showToast({
      style: Toast.Style.Failure,
      title: isAuthError ? "Cookie expired" : "Failed to fetch usage",
      message: error.message,
    });
  }

  return (
    <List isLoading={isLoading}>
      {!data && !isLoading ? (
        <List.EmptyView
          icon={isAuthError ? Icon.Key : Icon.Warning}
          title={isAuthError ? "Cookie Expired" : "No Data"}
          description={
            isAuthError
              ? "Your cookie has expired. Update it to continue."
              : error
                ? error.message
                : "Unable to fetch MiMo usage data"
          }
          actions={
            <ActionPanel>
              {isAuthError && (
                <Action
                  title="Update Cookie"
                  icon={Icon.Key}
                  onAction={() =>
                    launchCommand({
                      name: "update-cookie",
                      type: LaunchType.UserInitiated,
                    })
                  }
                />
              )}
              {isAuthError && (
                <Action
                  title="Open MiMo Console"
                  icon={Icon.Globe}
                  onAction={() => open(MIMO_CONSOLE_URL)}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                />
              )}
              <Action
                title="Retry"
                icon={Icon.RotateClockwise}
                onAction={revalidate}
              />
              <Action
                title="Open Extension Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
                shortcut={{ modifiers: ["cmd"], key: "," }}
              />
            </ActionPanel>
          }
        />
      ) : (
        <>{data && <UsageContent data={data} onRefresh={revalidate} />}</>
      )}
    </List>
  );
}

function UsageContent({
  data,
  onRefresh,
}: {
  data: MiMoUsageData;
  onRefresh: () => void;
}) {
  return (
    <>
      <UsageSection title="Plan Usage" items={data.usage.items} />
      <UsageSection title="Monthly Usage" items={data.monthUsage.items} />
      <List.Section title="Actions">
        <List.Item
          icon={Icon.RotateClockwise}
          title="Refresh"
          subtitle="Reload usage data"
          actions={
            <ActionPanel>
              <Action
                title="Refresh"
                icon={Icon.RotateClockwise}
                onAction={onRefresh}
              />
              <Action
                title="Open Extension Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
                shortcut={{ modifiers: ["cmd"], key: "," }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </>
  );
}
