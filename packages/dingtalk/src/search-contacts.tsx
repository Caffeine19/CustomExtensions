import {
  ActionPanel,
  Action,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useState, useCallback, useEffect } from "react";
import { searchUsers } from "./dingtalk-api";
import { authorize, client } from "./oauth";
import type { DingTalkUser } from "./types";

export default function SearchContacts() {
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useCachedState<DingTalkUser[]>(
    "dingtalk-users",
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    authorize()
      .then(() => setIsAuthorized(true))
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Authorization failed";
        setError(message);
        showToast({
          style: Toast.Style.Failure,
          title: "Authorization Failed",
          message,
        });
      });
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setSearchText(query);

    if (!query.trim()) {
      setUsers([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const tokenSet = await client.getTokens();
      if (!tokenSet?.accessToken) {
        throw new Error("Not authorized");
      }
      const result = await searchUsers(query, tokenSet.accessToken);
      setUsers(result.users);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      showToast({
        style: Toast.Style.Failure,
        title: "Search Failed",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (!isAuthorized && !error) {
    return (
      <List isLoading={true} searchBarPlaceholder="Connecting to DingTalk..." />
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search DingTalk contacts..."
      onSearchTextChange={handleSearch}
      throttle
    >
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Error" description={error} />
      ) : users.length === 0 && searchText ? (
        <List.EmptyView
          icon={Icon.Person}
          title="No Contacts Found"
          description="Try a different search term"
        />
      ) : (
        users.map((user) => (
          <List.Item
            key={user.userid}
            icon={user.avatar ? { source: user.avatar } : Icon.Person}
            title={user.name}
            subtitle={user.title || user.job_number}
            accessories={[{ text: user.mobile, tooltip: "Mobile" }]}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title="Open Chat in DingTalk"
                  url={`dingtalk://dingtalkclient/action/sendmsg?dingtalk_id=${encodeURIComponent(user.userid)}`}
                />
                <Action.CopyToClipboard
                  title="Copy User ID"
                  content={user.userid}
                />
                {user.mobile && (
                  <Action.CopyToClipboard
                    title="Copy Mobile"
                    content={user.mobile}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                )}
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
