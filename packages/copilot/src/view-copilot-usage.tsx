import { ActionPanel, Action, Icon, List, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useCallback, useState } from "react";
import { gen, all, catchAll, succeed, runPromise, either } from "effect/Effect";
import { isLeft } from "effect/Either";
import { fetchCopilotUsage, fetchGithubEmail, fetchGitHubUser } from "./utils/copilot-api";
import { addAccount, getStoredAccounts, removeAccount, StoredAccount } from "./utils/token-storage";
import { startDeviceFlow } from "./utils/github-oauth";
import { AccountData } from "./types/accountData";
import AccountListItem from "./components/account-list-item";
import { sort } from "radash";

const loadAccountData = (account: StoredAccount) =>
  gen(function* () {
    const [user, email, usage] = yield* all(
      [fetchGitHubUser(account.token), fetchGithubEmail(account.token), fetchCopilotUsage(account.token)] as const,
      { concurrency: "unbounded" },
    );
    return { account, user, email, usage, error: null } satisfies AccountData;
  }).pipe(
    catchAll((error) =>
      succeed({
        account,
        user: null,
        email: null,
        usage: null,
        error: error.message,
      } satisfies AccountData),
    ),
  );

export default function Command() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading } = usePromise(
    async (key: number) => {
      void key;
      const accounts = await runPromise(getStoredAccounts);
      if (accounts.length === 0) return [];
      const effects = accounts.map(loadAccountData);
      return runPromise(all(effects, { concurrency: "unbounded" }));
    },
    [refreshKey],
  );

  const handleAddAccount = useCallback(async () => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Signing in...",
      message: "Check your browser",
    });

    const program = gen(function* () {
      const { userCode, token } = yield* startDeviceFlow;
      toast.message = `Code: ${userCode} (copied to clipboard)`;

      const accessToken = yield* token;
      const user = yield* fetchGitHubUser(accessToken);

      yield* addAccount({ token: accessToken, login: user.login, addedAt: new Date().toISOString() });
      return user.login;
    });

    const result = await runPromise(either(program));

    if (isLeft(result)) {
      toast.style = Toast.Style.Failure;
      toast.title = "Sign in failed";
      toast.message = String(result.left);
    } else {
      toast.style = Toast.Style.Success;
      toast.title = "Signed in";
      toast.message = result.right;
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const handleRemoveAccount = useCallback(async (login: string) => {
    await runPromise(removeAccount(login));
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
            onAdd={handleAddAccount}
          />
        ))
      )}
    </List>
  );
}
