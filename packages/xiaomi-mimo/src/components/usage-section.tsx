import { Color, Icon, List } from "@raycast/api";
import { TokenUsageItem } from "../types/mimo-usage";

function formatTokens(count: number): string {
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(2)}B`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return String(count);
}

function usageColor(percent: number): Color {
  if (percent >= 90) return Color.Red;
  if (percent >= 70) return Color.Orange;
  return Color.Green;
}

function formatUsage(item: TokenUsageItem): string {
  const pct = Math.round(item.percent * 10000) / 100;
  return `${formatTokens(item.used)} / ${formatTokens(item.limit)}  ( ${pct}% )`;
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

export default function UsageSection({
  title,
  items,
}: {
  title: string;
  items: TokenUsageItem[];
}) {
  return (
    <List.Section title={title}>
      {items.map((item) => (
        <List.Item
          key={item.name}
          icon={itemNameToIcon(item.name)}
          title={itemNameToLabel(item.name)}
          accessories={[
            {
              tag: {
                value: formatUsage(item),
                color: usageColor(item.percent * 100),
              },
              tooltip: `Used: ${formatTokens(item.used)} / Limit: ${formatTokens(item.limit)}`,
            },
          ]}
        />
      ))}
    </List.Section>
  );
}
