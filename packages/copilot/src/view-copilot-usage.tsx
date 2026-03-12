import { ActionPanel, Action, Color, Icon, Image, List, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useCallback, useState } from "react";
import { CopilotUsage, fetchCopilotUsage, fetchGitHubUser, GitHubUser, QuotaInfo } from "./utils/copilot-api";
import { addAccount, getStoredAccounts, removeAccount, StoredAccount } from "./utils/token-storage";
import { startDeviceFlow } from "./utils/github-oauth";

interface AccountData {
  account: StoredAccount;
  user: GitHubUser | null;
  usage: CopilotUsage | null;
  error: string | null;
}

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

async function loadAccountData(account: StoredAccount): Promise<AccountData> {
  try {
    const [user, usage] = await Promise.all([fetchGitHubUser(account.token), fetchCopilotUsage(account.token)]);
    return { account, user, usage, error: null };
  } catch (e) {
    return { account, user: null, usage: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export default function Command() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, revalidate } = usePromise(
    async (key: number) => {
      void key;
      const accounts = await getStoredAccounts();
      if (accounts.length === 0) return [];
      return Promise.all(accounts.map(loadAccountData));
    },
    [refreshKey],
  );

  const handleAddAccount = useCallback(async () => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Signing in...",
      message: "Check your browser",
    });
    try {
      const { userCode, token } = await startDeviceFlow();
      toast.message = `Code: ${userCode} (copied to clipboard)`;

      const accessToken = await token;
      const user = await fetchGitHubUser(accessToken);

      await addAccount({ token: accessToken, login: user.login, addedAt: new Date().toISOString() });
      toast.style = Toast.Style.Success;
      toast.title = "Signed in";
      toast.message = user.login;
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Sign in failed";
      toast.message = e instanceof Error ? e.message : String(e);
    }
  }, []);

  const handleRemoveAccount = useCallback(async (login: string) => {
    await removeAccount(login);
    await showToast({ style: Toast.Style.Success, title: "Removed", message: login });
    setRefreshKey((k) => k + 1);
  }, []);

  const accounts = data ?? [];

  return (
    <List isLoading={isLoading}>
      {accounts.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Person}
          title="No GitHub Accounts"
          description="Add a GitHub account to view Copilot usage"
          actions={
            <ActionPanel>
              <Action title="Add GitHub Account" icon={Icon.Plus} onAction={handleAddAccount} />
            </ActionPanel>
          }
        />
      ) : (
        accounts.map((item) => (
          <AccountListItem
            key={item.account.login}
            item={item}
            onRemove={handleRemoveAccount}
            onRefresh={revalidate}
            onAdd={handleAddAccount}
          />
        ))
      )}
    </List>
  );
}

function AccountListItem({
  item,
  onRemove,
  onRefresh,
  onAdd,
}: {
  item: AccountData;
  onRemove: (login: string) => void;
  onRefresh: () => void;
  onAdd: () => void;
}) {
  const { account, user, usage, error } = item;
  const title = user ? user.name || user.login : account.login;

  let subtitle = "";
  if (error) {
    subtitle = `Error: ${error}`;
  } else if (user?.login) {
    subtitle = `@${user.login}`;
  }

  const accessories: List.Item.Accessory[] = [];

  if (usage?.copilotPlan) {
    const planName = usage.copilotPlan.charAt(0).toUpperCase() + usage.copilotPlan.slice(1);
    const planIcon = usage.copilotPlan.toLowerCase() === "business" ? Icon.Building : Icon.Person;
    accessories.push({ text: planName, icon: planIcon, tooltip: `Plan: ${planName}` });
  }

  if (usage?.quotaResetDate) {
    accessories.push({ date: new Date(usage.quotaResetDate), icon: Icon.Calendar, tooltip: "Quota Resets" });
  }

  if (usage?.chat) {
    accessories.push({
      icon: Icon.Message,
      tag: { value: formatQuota(usage.chat), color: usageColor(usage.chat) },
      tooltip: "Chat Usage",
    });
  }

  if (usage?.premium) {
    accessories.push({
      icon: Icon.Coins,
      tag: { value: formatQuota(usage.premium), color: usageColor(usage.premium) },
      tooltip: "Premium Requests Usage",
    });
  }

  return (
    <List.Item
      icon={user?.avatar_url ? { source: user.avatar_url, mask: Image.Mask.Circle } : Icon.Person}
      title={title}
      subtitle={subtitle}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={onRefresh} />
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
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
            onAction={() => onRemove(account.login)}
          />
        </ActionPanel>
      }
    />
  );
}
