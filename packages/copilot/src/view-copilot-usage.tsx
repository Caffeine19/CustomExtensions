import { ActionPanel, Action, Icon, List, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useCallback, useState } from "react";
import { fetchCopilotUsage, fetchGithubEmail, fetchGitHubUser } from "./utils/copilot-api";
import { addAccount, getStoredAccounts, removeAccount, StoredAccount } from "./utils/token-storage";
import { startDeviceFlow } from "./utils/github-oauth";
import { AccountData } from "./types/accountData";
import AccountListItem from "./components/account-list-item";
import { sort } from "radash";

async function loadAccountData(account: StoredAccount): Promise<AccountData> {
  try {
    const [user, email, usage] = await Promise.all([
      fetchGitHubUser(account.token),
      fetchGithubEmail(account.token),
      fetchCopilotUsage(account.token),
    ]);

    return {
      account,
      user,
      usage,
      email,
      error: null,
    };
  } catch (e) {
    return { account, user: null, usage: null, email: null, error: e instanceof Error ? e.message : String(e) };
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

  const accounts = data ? sort(data, (account) => account.usage?.premium?.remaining || 0, true) : [];

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
