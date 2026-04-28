import {
    ActionPanel,
    Action,
    Form,
    Icon,
    List,
    LocalStorage,
    showToast,
    Toast,
    Color,
    Clipboard,
    closeMainWindow,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState, useMemo, useEffect } from "react";
import {
    loadAllSessions,
    openSessionViaUriHandler,
    openWorkspaceInVSCode,
    openSessionFile,
    renameSession,
} from "./utils/session-reader";
import { ChatStatus, ResolvedChatSession } from "./types/session";

dayjs.extend(relativeTime);

/**
 * Categorize a session into a time-based group based on its last update time.
 * Used when "All Workspaces" is selected to group sessions chronologically.
 */
function getTimeGroup(date: Date): string {
  const now = dayjs();
  const d = dayjs(date);
  const diffMinutes = now.diff(d, "minute");

  if (diffMinutes < 60) return "In the Last Hour";
  if (d.isSame(now, "day")) return "Today";
  if (d.isSame(now.subtract(1, "day"), "day")) return "Yesterday";
  if (now.diff(d, "day") < 7) return "Last 7 Days";
  return "Older";
}

const TIME_GROUP_ORDER = ["In the Last Hour", "Today", "Yesterday", "Last 7 Days", "Older"];

const STATUS_CONFIG: Record<ChatStatus, { label: string; icon: Icon; color: Color }> = {
  empty: {
    label: "Empty",
    icon: Icon.Circle,
    color: Color.SecondaryText,
  },
  "in-progress": {
    label: "Active",
    icon: Icon.CircleProgress,
    color: Color.Orange,
  },
  completed: {
    label: "Done",
    icon: Icon.CheckCircle,
    color: Color.Green,
  },
  failed: {
    label: "Fail",
    icon: Icon.ExclamationMark,
    color: Color.Red,
  },
  "needs-input": {
    label: "Input",
    icon: Icon.QuestionMark,
    color: Color.Yellow,
  },
};

const STORAGE_KEY = "selected-workspace";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("__all__");

  // Restore persisted workspace selection on mount
  useEffect(() => {
    LocalStorage.getItem<string>(STORAGE_KEY).then((value) => {
      if (value) setSelectedWorkspace(value);
    });
  }, []);

  const handleWorkspaceChange = (value: string) => {
    setSelectedWorkspace(value);
    LocalStorage.setItem(STORAGE_KEY, value);
  };

  const { data: sessions, isLoading, error, revalidate } = usePromise(async () => loadAllSessions(), []);

  if (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to load sessions",
      message: String(error),
    });
  }

  // Extract unique workspace names for the dropdown (only from non-empty sessions)
  const workspaces = useMemo(() => {
    if (!sessions) return [];
    const names = new Set(sessions.filter((s) => s.chatStatus !== "empty").map((s) => s.workspaceName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];

    // Exclude empty sessions (no messages)
    let filtered = sessions.filter((s) => s.chatStatus !== "empty");

    // Filter by workspace
    if (selectedWorkspace !== "__all__") {
      filtered = filtered.filter((s) => s.workspaceName === selectedWorkspace);
    }

    // Apply search
    if (searchText) {
      const query = searchText.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.workspaceName.toLowerCase().includes(query) ||
          s.workspacePath.toLowerCase().includes(query) ||
          s.sessionId.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [sessions, searchText, selectedWorkspace]);

  // Group sessions by time period when showing all workspaces,
  // or by workspace when a specific workspace is selected
  const grouped = useMemo(() => {
    const groups = new Map<string, ResolvedChatSession[]>();
    for (const session of filteredSessions) {
      const key = selectedWorkspace === "__all__" ? getTimeGroup(session.lastMessageDate) : session.workspaceName;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }
    return groups;
  }, [filteredSessions, selectedWorkspace]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search sessions by title, workspace, or ID..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by workspace" value={selectedWorkspace} onChange={handleWorkspaceChange}>
          <List.Dropdown.Item
            title={`All Workspaces (${sessions?.filter((s) => s.chatStatus !== "empty").length ?? 0})`}
            value="__all__"
          />
          <List.Dropdown.Section title="Workspaces">
            {workspaces.map((ws) => {
              const count = sessions?.filter((s) => s.workspaceName === ws && s.chatStatus !== "empty").length ?? 0;
              return <List.Dropdown.Item key={ws} title={`${ws} (${count})`} value={ws} />;
            })}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
      throttle
    >
      {filteredSessions.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Message}
          title="No Chat Sessions Found"
          description="No local VS Code Copilot chat sessions were found on this machine."
        />
      ) : selectedWorkspace !== "__all__" ? (
        // Flat list when a specific workspace is selected
        filteredSessions.map((session) => (
          <SessionListItem key={session.sessionId} session={session} onRename={revalidate} showWorkspace={false} />
        ))
      ) : (
        // Grouped by time period when showing all workspaces
        TIME_GROUP_ORDER.filter((g) => grouped.has(g)).map((groupName) => (
          <List.Section key={groupName} title={groupName} subtitle={`${grouped.get(groupName)!.length} session(s)`}>
            {grouped.get(groupName)!.map((session) => (
              <SessionListItem key={session.sessionId} session={session} onRename={revalidate} showWorkspace={true} />
            ))}
          </List.Section>
        ))
      )}
    </List>
  );
}

function SessionListItem({
  session,
  onRename,
  showWorkspace = false,
}: {
  session: ResolvedChatSession;
  onRename: () => void;
  showWorkspace?: boolean;
}) {
  const relativeDate = dayjs(session.lastMessageDate).fromNow();
  const createdDate = dayjs(session.created).format("YYYY-MM-DD HH:mm");
  const statusCfg = STATUS_CONFIG[session.chatStatus];

  const accessories: List.Item.Accessory[] = [];

  if (session.hasPendingEdits) {
    accessories.push({
      icon: { source: Icon.Pencil, tintColor: Color.Orange },
      tag: { value: "Pending", color: Color.Orange },
    });
  }

  accessories.push({
    icon: { source: statusCfg.icon, tintColor: statusCfg.color },
    tag: { value: statusCfg.label, color: statusCfg.color },
  });

  // Show relative time as accessory when workspace is in subtitle
  if (showWorkspace) {
    accessories.unshift({
      tag: { value: relativeDate, color: Color.SecondaryText },
    });
  }

  return (
    <List.Item
      title={session.title}
      subtitle={showWorkspace ? session.workspaceName : relativeDate}
      accessories={accessories}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Open">
            <Action
              title="Open Chat Session"
              icon={Icon.Message}
              onAction={async () => {
                await closeMainWindow();
                try {
                  await openSessionViaUriHandler(session);
                } catch (e) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Failed to open session",
                    message: String(e),
                  });
                }
              }}
            />
            <Action
              title="Open Workspace"
              icon={Icon.Folder}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
              onAction={async () => {
                await closeMainWindow();
                try {
                  await openWorkspaceInVSCode(session);
                } catch (e) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Failed to open workspace",
                    message: String(e),
                  });
                }
              }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Edit">
            <RenameSessionAction session={session} onRename={onRename} />
          </ActionPanel.Section>
          <ActionPanel.Section title="Info">
            <Action.CopyToClipboard title="Copy Session ID" icon={Icon.Clipboard} content={session.sessionId} />
            <Action.CopyToClipboard title="Copy Workspace Path" icon={Icon.Folder} content={session.workspacePath} />
            <Action.CopyToClipboard title="Copy Session Title" icon={Icon.Text} content={session.title} />
          </ActionPanel.Section>
          <ActionPanel.Section title="Debug">
            <Action
              title="Open Session File"
              icon={Icon.Document}
              shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
              onAction={() => {
                try {
                  openSessionFile(session);
                } catch (e) {
                  showToast({
                    style: Toast.Style.Failure,
                    title: "Failed",
                    message: String(e),
                  });
                }
              }}
            />
            <Action
              title="Show Session Details"
              icon={Icon.Eye}
              shortcut={{ modifiers: ["cmd"], key: "i" }}
              onAction={async () => {
                const details = [
                  `**Title:** ${session.title}`,
                  `**Session ID:** \`${session.sessionId}\``,
                  `**Workspace:** ${session.workspacePath}`,
                  `**Created:** ${createdDate}`,
                  `**Last Activity:** ${dayjs(session.lastMessageDate).format("YYYY-MM-DD HH:mm:ss")}`,
                  `**Status:** ${statusCfg.label}`,
                  `**Has Pending Edits:** ${session.hasPendingEdits ? "Yes" : "No"}`,
                  `**Initial Location:** ${session.initialLocation ?? "N/A"}`,
                  `**Session File:** \`${session.sessionFilePath}\``,
                ].join("\n");
                await Clipboard.copy(details);
                await showToast({
                  style: Toast.Style.Success,
                  title: "Details copied to clipboard",
                });
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function RenameSessionAction({ session, onRename }: { session: ResolvedChatSession; onRename: () => void }) {
  return (
    <Action.Push
      title="Rename Session"
      icon={Icon.Pencil}
      shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
      target={<RenameSessionForm session={session} onRename={onRename} />}
    />
  );
}

function RenameSessionForm({ session, onRename }: { session: ResolvedChatSession; onRename: () => void }) {
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Rename"
            icon={Icon.Checkmark}
            onSubmit={async (values: { newTitle: string }) => {
              const newTitle = values.newTitle.trim();
              if (!newTitle) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Title cannot be empty",
                });
                return;
              }
              try {
                await renameSession(session, newTitle);
                await showToast({
                  style: Toast.Style.Success,
                  title: "Session renamed",
                  message: newTitle,
                });
                onRename();
              } catch (e) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Failed to rename session",
                  message: String(e),
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="newTitle"
        title="New Title"
        defaultValue={session.title}
        placeholder="Enter new session title"
      />
    </Form>
  );
}
