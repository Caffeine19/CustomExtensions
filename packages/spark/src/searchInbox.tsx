import { ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import dayjs from "dayjs";
import { Effect } from "effect";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatEmailDate } from "@/utils/date";
import { listAccounts } from "@/service/accountService";
import { listEmails } from "@/service/emailService";
import { searchEmails } from "@/service/searchService";
import { SparkAccount } from "@/types/account";
import { SparkEmail } from "@/types/email";
import {
  ArchiveAction,
  CopyEmailIdAction,
  DeleteAction,
  MarkAsDoneAction,
  OpenInSparkAction,
  TogglePinAction,
  ToggleReadAction,
  ViewThreadAction,
} from "@/components/actions";

const CACHE_KEY = "spark-emails";

export default function Command() {
  const [emails, setEmails] = useCachedState<SparkEmail[]>(CACHE_KEY, []);
  const [accounts, setAccounts] = useState<SparkAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const fetchEmails = useCallback(
    async (query?: string, account?: string | null) => {
      setIsLoading(true);
      try {
        const program = (query ? searchEmails(query, account ?? undefined) : listEmails(account ?? undefined)).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              setEmails(result);
              if (result.length > 0) {
                showToast({
                  style: Toast.Style.Success,
                  title: "Found emails",
                  message: `${result.length} email${result.length === 1 ? "" : "s"}`,
                });
              }
            }),
          ),
          Effect.catchAll((error) =>
            Effect.sync(() => {
              showToast({
                style: Toast.Style.Failure,
                title: "Failed to fetch emails",
                message: error.message,
              });
            }),
          ),
        );
        await Effect.runPromise(program);
      } finally {
        setIsLoading(false);
      }
    },
    [setEmails],
  );

  const fetchAccounts = useCallback(async () => {
    try {
      const program = listAccounts().pipe(
        Effect.tap((result) => Effect.sync(() => setAccounts(result))),
        Effect.catchAll((error) =>
          Effect.sync(() => {
            setAccounts([]);
            showToast({
              style: Toast.Style.Failure,
              title: "Failed to load accounts",
              message: error.message,
            });
          }),
        ),
      );
      await Effect.runPromise(program);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load accounts",
        message: String(error),
      });
    }
  }, []);

  useEffect(() => {
    fetchEmails(undefined, selectedAccount);
    fetchAccounts();
  }, [fetchEmails, fetchAccounts, selectedAccount]);

  const handleSearch = useCallback(
    (text: string) => {
      setSearchText(text);
      if (text.trim()) {
        fetchEmails(text.trim(), selectedAccount);
      } else {
        fetchEmails(undefined, selectedAccount);
      }
    },
    [fetchEmails, selectedAccount],
  );

  /** Group emails: Pinned → Today → Yesterday → Month sections */
  const groupedEmails = useMemo(() => {
    const now = dayjs();
    const today = now.startOf("day");
    const yesterday = today.subtract(1, "day");

    const pinned: SparkEmail[] = [];
    const todayEmails: SparkEmail[] = [];
    const yesterdayEmails: SparkEmail[] = [];
    const monthBuckets = new Map<string, SparkEmail[]>();

    for (const email of emails) {
      if (email.isPinned) {
        pinned.push(email);
        continue;
      }

      const d = dayjs(email.date);
      if (d.isAfter(today)) {
        todayEmails.push(email);
      } else if (d.isAfter(yesterday)) {
        yesterdayEmails.push(email);
      } else {
        // Same year → "June", different year → "August 2025"
        const key = d.isSame(now, "year") ? d.format("MMMM") : d.format("MMMM YYYY");
        const bucket = monthBuckets.get(key);
        if (bucket) {
          bucket.push(email);
        } else {
          monthBuckets.set(key, [email]);
        }
      }
    }

    const sections: { title: string; emails: SparkEmail[] }[] = [];
    if (pinned.length > 0) sections.push({ title: "Pinned", emails: pinned });
    if (todayEmails.length > 0) sections.push({ title: "Today", emails: todayEmails });
    if (yesterdayEmails.length > 0) sections.push({ title: "Yesterday", emails: yesterdayEmails });
    for (const [title, monthEmails] of monthBuckets) {
      sections.push({ title, emails: monthEmails });
    }
    return sections;
  }, [emails]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search emails..."
      searchText={searchText}
      onSearchTextChange={handleSearch}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by Account"
          value={selectedAccount ?? "all"}
          onChange={(value) => setSelectedAccount(value === "all" ? null : value)}
        >
          <List.Dropdown.Item title="All Accounts" value="all" />
          {accounts.map((account) => (
            <List.Dropdown.Item key={account.id} title={account.name} value={account.email} />
          ))}
        </List.Dropdown>
      }
    >
      {groupedEmails.map(({ title, emails: sectionEmails }) => (
        <List.Section key={title} title={title}>
          {sectionEmails.map((email) => (
            <List.Item
              key={email.id}
              icon={email.isRead ? Icon.Envelope : { source: Icon.Envelope, tintColor: "#4A90D9" }}
              title={email.subject || "(no subject)"}
              subtitle={`${email.from || email.fromEmail} → ${accounts.find((a) => a.email === email.account)?.name ?? email.account}`}
              accessories={
                [
                  email.isPinned ? { icon: Icon.Pin, tooltip: "Pinned" } : null,
                  email.hasAttachment ? { icon: Icon.Paperclip, tooltip: "Attachment" } : null,
                  email.isReplied ? { icon: Icon.Reply, tooltip: "Replied" } : null,
                  { text: email.date ? formatEmailDate(email.date) : "", tooltip: email.date },
                ].filter(Boolean) as List.Item.Accessory[]
              }
              actions={
                <ActionPanel>
                  <ActionPanel.Section title="View">
                    <ViewThreadAction email={email} />
                    <OpenInSparkAction email={email} />
                    <CopyEmailIdAction email={email} />
                  </ActionPanel.Section>
                  <ActionPanel.Section title="Organize">
                    {email.inInbox && <MarkAsDoneAction email={email} />}
                    <ToggleReadAction email={email} />
                    <TogglePinAction email={email} />
                    <ArchiveAction email={email} />
                    <DeleteAction email={email} />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}

      {!isLoading && emails.length === 0 && (
        <List.EmptyView
          icon={Icon.Envelope}
          title="No Emails Found"
          description={searchText ? "Try a different search term" : "No emails available"}
        />
      )}
    </List>
  );
}
