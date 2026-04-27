import {
  Icon,
  launchCommand,
  LaunchType,
  MenuBarExtra,
  open,
  openExtensionPreferences,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { fetchMiMoUsage } from "./utils/mimo-api";
import { MiMoUsageData, TokenUsageItem } from "./types/mimo-usage";

const MIMO_CONSOLE_URL = "https://platform.xiaomimimo.com/console/plan-manage";

function formatTokens(count: number): string {
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(1)}B`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(0)}K`;
  }
  return String(count);
}

function formatUsageLine(item: TokenUsageItem): string {
  const pct = Math.round(item.percent * 100);
  return `${formatTokens(item.used)} / ${formatTokens(item.limit)}  (${pct}%)`;
}

function itemNameToLabel(name: string): string {
  switch (name) {
    case "month_total_token":
      return "Monthly Tokens";
    case "plan_total_token":
      return "Plan Tokens";
    case "compensation_total_token":
      return "Compensation Tokens";
    default:
      return name;
  }
}

function itemNameToIcon(name: string): Icon {
  switch (name) {
    case "month_total_token":
      return Icon.Calendar;
    case "plan_total_token":
      return Icon.Coins;
    case "compensation_total_token":
      return Icon.Gift;
    default:
      return Icon.BarChart;
  }
}

function getTopUsageItem(data: MiMoUsageData): TokenUsageItem | undefined {
  const allItems = [...data.usage.items, ...data.monthUsage.items];
  if (allItems.length === 0) return undefined;
  return allItems.reduce((max, item) =>
    item.percent > max.percent ? item : max,
  );
}

function formatTitle(data: MiMoUsageData | undefined): string {
  if (!data) return "MiMo";
  const top = getTopUsageItem(data);
  if (!top) return "MiMo";
  const pct = Math.round(top.percent * 100);
  return `${formatTokens(top.used)}/${formatTokens(top.limit)} (${pct}%)`;
}

export default function Command() {
  const { data, isLoading, revalidate } = useCachedPromise(
    async () => {
      return fetchMiMoUsage();
    },
    [],
    { keepPreviousData: true },
  );

  const title = formatTitle(data);

  return (
    <MenuBarExtra
      icon={Icon.Coins}
      title={title}
      tooltip="Xiaomi MiMo Token Usage"
      isLoading={isLoading}
    >
      {data ? (
        <>
          <MenuBarExtra.Section title="Plan Usage">
            {data.usage.items.map((item) => (
              <MenuBarExtra.Item
                key={`plan-${item.name}`}
                icon={itemNameToIcon(item.name)}
                title={`${itemNameToLabel(item.name)}: ${formatUsageLine(item)}`}
                onAction={() => open(MIMO_CONSOLE_URL)}
              />
            ))}
          </MenuBarExtra.Section>
          <MenuBarExtra.Section title="Monthly Usage">
            {data.monthUsage.items.map((item) => (
              <MenuBarExtra.Item
                key={`month-${item.name}`}
                icon={itemNameToIcon(item.name)}
                title={`${itemNameToLabel(item.name)}: ${formatUsageLine(item)}`}
                onAction={() => open(MIMO_CONSOLE_URL)}
              />
            ))}
          </MenuBarExtra.Section>
          <MenuBarExtra.Section>
            <MenuBarExtra.Item
              icon={Icon.ArrowsExpand}
              title="Open Full View"
              onAction={() =>
                launchCommand({
                  name: "view-mimo-usage",
                  type: LaunchType.UserInitiated,
                })
              }
            />
            <MenuBarExtra.Item
              icon={Icon.RotateClockwise}
              title="Refresh"
              onAction={revalidate}
            />
            <MenuBarExtra.Item
              icon={Icon.Gear}
              title="Preferences"
              onAction={openExtensionPreferences}
            />
          </MenuBarExtra.Section>
        </>
      ) : (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item
            icon={Icon.Warning}
            title={isLoading ? "Loading..." : "Failed to load"}
          />
          <MenuBarExtra.Item
            icon={Icon.Gear}
            title="Preferences"
            onAction={openExtensionPreferences}
          />
        </MenuBarExtra.Section>
      )}
    </MenuBarExtra>
  );
}
