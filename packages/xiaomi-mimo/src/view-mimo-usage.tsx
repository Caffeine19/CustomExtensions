import {
  Action,
  ActionPanel,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { fetchMiMoUsage } from "./utils/mimo-api";
import { MiMoUsageData } from "./types/mimo-usage";
import UsageSection from "./components/usage-section";

export default function Command() {
  const { data, isLoading, error, revalidate } = usePromise(async () => {
    return fetchMiMoUsage();
  });

  if (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to fetch usage",
      message: error.message,
    });
  }

  return (
    <List isLoading={isLoading}>
      {!data && !isLoading ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="No Data"
          description={
            error ? error.message : "Unable to fetch MiMo usage data"
          }
          actions={
            <ActionPanel>
              <Action
                title="Open Extension Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
              <Action
                title="Retry"
                icon={Icon.RotateClockwise}
                onAction={revalidate}
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
