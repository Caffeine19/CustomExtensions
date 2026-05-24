import { Action, ActionPanel, Color, Icon, List, Image } from "@raycast/api";
import { AccountData } from "../types/accountData";
import { QuotaInfo } from "../utils/copilot-api";
import { title } from "radash";
import dayjs from "dayjs";

function formatQuota(info: QuotaInfo): string {
  const used = info.entitlement - info.remaining;
  const pct = Math.round(100 - info.percentRemaining);
  return ` ${used} / ${info.entitlement}  ( ${pct}% )`;
}

function usageColor(info: QuotaInfo): Color {
  const pctUsed = 100 - info.percentRemaining;
  if (pctUsed >= 90) return Color.Red;
  if (pctUsed >= 70) return Color.Orange;
  return Color.Green;
}

export default function AccountListItem({
  item,
  onRemove,
  onAdd,
}: {
  item: AccountData;
  onRemove: (login: string) => void;
  onAdd: () => void;
}) {
  const { account, user, email, usage } = item;

  const accountTitle = user?.name || user?.login || account.login;

  const accountSubtitle = email?.email ?? "";

  const accessories: List.Item.Accessory[] = [];

  if (usage?.quotaResetDate) {
    accessories.push({
      text: dayjs(usage.quotaResetDate).format("MM/DD"),
      icon: Icon.Calendar,
      tooltip: "Quota Resets",
    });
  }

  if (usage?.copilotPlan) {
    const planName = title(usage.copilotPlan);

    const planIcon =
      usage.copilotPlan === "business"
        ? Icon.Building
        : usage.copilotPlan === "individual_pro"
          ? Icon.CheckRosette
          : Icon.Person;

    const tagColor =
      usage.copilotPlan === "business" ? Color.Blue : usage.copilotPlan === "individual_pro" ? Color.Orange : undefined;

    accessories.push({
      icon: planIcon,

      tag: {
        value: planName,
        color: tagColor,
      },
      tooltip: `Plan: ${planName}`,
    });
  }

  if (usage?.chat) {
    accessories.push({
      icon: Icon.Message,
      tag: {
        value: formatQuota(usage.chat),
        color: usageColor(usage.chat),
      },
      tooltip: "Chat Usage",
    });
  }

  if (usage?.premium) {
    accessories.push({
      icon: Icon.Coins,
      tag: {
        value: formatQuota(usage.premium),
        color: usageColor(usage.premium),
      },
      tooltip: "Premium Requests Usage",
    });
  }

  return (
    <List.Item
      icon={user?.avatar_url ? { source: user.avatar_url, mask: Image.Mask.Circle } : Icon.Person}
      title={accountTitle}
      subtitle={accountSubtitle}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action
            title="Add GitHub Account"
            icon={Icon.Plus}
            onAction={onAdd}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
          />
          <Action
            title={`Remove ${account.login}`}
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["cmd"], key: "x" }}
            onAction={() => onRemove(account.login)}
          />
        </ActionPanel>
      }
    />
  );
}
