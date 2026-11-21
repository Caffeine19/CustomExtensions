import { useEffect, useMemo, useState } from "react";

import { Color, Icon, List, LocalStorage } from "@raycast/api";

import dayjs, { type Dayjs } from "dayjs";
import { fork, group } from "radash";

import { SessionActions } from "./components/actions";
import { AUTOMATION_BADGE, FORK_BADGE, PENDING_BADGE, STATUS_CONFIG } from "./constants/sessionStatus";
import { useAllSessions } from "./hooks/useAllSessions";
import { WorkspacelessCopilotSession } from "./types/sessions/copilotSession";
import { AnySession } from "./types/sessions/session";
import "./utils/dayjsSetup";
import {
  sessionChatStatus,
  sessionHasPendingEdits,
  sessionId,
  sessionIsAutomation,
  sessionIsForked,
  sessionIsWorkspaceless,
  sessionLastActivity,
  sessionRowKey,
  sessionTitle,
  sessionWorkspaceName,
  sessionWorkspacePath,
} from "./utils/sessionDisplay";

/**
 * Categorize a session into a time-based group based on its last update time. Used when "All Workspaces" is selected to
 * group sessions chronologically.
 */
function getTimeGroup(date: Dayjs): string {
  const now = dayjs();
  const diffMinutes = now.diff(date, "minute");

  if (diffMinutes < 60) return "In the Last Hour";
  if (date.isSame(now, "day")) return "Today";
  if (date.isSame(now.subtract(1, "day"), "day")) return "Yesterday";
  if (now.diff(date, "day") < 7) return "Last 7 Days";
  return "Older";
}

const TIME_GROUP_ORDER = ["In the Last Hour", "Today", "Yesterday", "Last 7 Days", "Older"];

const STORAGE_KEY = "selected-workspace";

/** Dropdown filter values that are not real workspace names. */
const ALL_WORKSPACES = "__all__";
const NO_WORKSPACE = "__no_workspace__";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>(ALL_WORKSPACES);

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

  const { sessions, isLoading, ahpReachable, revalidate } = useAllSessions();

  // Extract unique workspace names for the dropdown (only from non-empty sessions).
  // Workspace-less sessions get their own "Chats" section instead of polluting the list.
  const nonEmpty = useMemo(() => sessions?.filter((s) => sessionChatStatus(s) !== "empty") ?? [], [sessions]);
  const workspaces = useMemo(() => {
    const names = new Set(nonEmpty.filter((s) => !sessionIsWorkspaceless(s)).map(sessionWorkspaceName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [nonEmpty]);
  const workspacelessCount = useMemo(() => nonEmpty.filter(sessionIsWorkspaceless).length, [nonEmpty]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];

    // Exclude empty sessions (no messages)
    let filtered = sessions.filter((s) => sessionChatStatus(s) !== "empty");

    // Filter by workspace
    if (selectedWorkspace === NO_WORKSPACE) {
      filtered = filtered.filter((s): s is WorkspacelessCopilotSession => sessionIsWorkspaceless(s));
    } else if (selectedWorkspace !== ALL_WORKSPACES) {
      filtered = filtered.filter((s) => sessionWorkspaceName(s) === selectedWorkspace);
    }

    // Apply search
    if (searchText) {
      const query = searchText.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          sessionTitle(s).toLowerCase().includes(query) ||
          sessionWorkspaceName(s).toLowerCase().includes(query) ||
          sessionWorkspacePath(s).toLowerCase().includes(query) ||
          sessionId(s).toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [sessions, searchText, selectedWorkspace]);

  // Sessions waiting for the user's reply are the most actionable — pin them above the time/workspace groups.
  const [waitingSessions, otherSessions] = useMemo(
    () => fork(filteredSessions, (s) => sessionChatStatus(s) === "needs-input"),
    [filteredSessions],
  );

  // Group by time period for the "All Workspaces" view; a specific workspace renders flat.
  const grouped = useMemo(() => group(otherSessions, (s) => getTimeGroup(sessionLastActivity(s))), [otherSessions]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search sessions by title, workspace, or ID..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by workspace" value={selectedWorkspace} onChange={handleWorkspaceChange}>
          <List.Dropdown.Item title={`All Workspaces (${nonEmpty.length})`} value={ALL_WORKSPACES} />
          {workspacelessCount > 0 && (
            <List.Dropdown.Section>
              <List.Dropdown.Item title={`Chats (${workspacelessCount})`} value={NO_WORKSPACE} />
            </List.Dropdown.Section>
          )}
          <List.Dropdown.Section title="Workspaces">
            {workspaces.map((ws) => {
              const count = nonEmpty.filter((s) => sessionWorkspaceName(s) === ws).length;
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
          description={
            ahpReachable
              ? "No chat sessions were found on this machine."
              : "No live VS Code Agent Host is reachable — start VS Code to see Copilot Harness sessions."
          }
        />
      ) : (
        <>
          {/* Sessions waiting for the user's reply — pinned above everything else */}
          {waitingSessions.length > 0 && (
            <List.Section title="Needs Your Input" subtitle={`${waitingSessions.length} session(s)`}>
              {waitingSessions.map((session) => (
                <SessionListItem
                  key={sessionRowKey(session)}
                  session={session}
                  showWorkspace={selectedWorkspace === ALL_WORKSPACES}
                  onMutated={revalidate}
                />
              ))}
            </List.Section>
          )}
          {selectedWorkspace !== ALL_WORKSPACES
            ? // Flat list when a specific workspace is selected
              otherSessions.map((session) => (
                <SessionListItem
                  key={sessionRowKey(session)}
                  session={session}
                  showWorkspace={false}
                  onMutated={revalidate}
                />
              ))
            : // Grouped by time period when showing all workspaces
              TIME_GROUP_ORDER.filter((g) => grouped[g]).map((groupName) => (
                <List.Section key={groupName} title={groupName} subtitle={`${grouped[groupName]!.length} session(s)`}>
                  {grouped[groupName]!.map((session) => (
                    <SessionListItem
                      key={sessionRowKey(session)}
                      session={session}
                      showWorkspace={true}
                      onMutated={revalidate}
                    />
                  ))}
                </List.Section>
              ))}
        </>
      )}
    </List>
  );
}

function SessionListItem({
  session,
  showWorkspace = false,
  onMutated,
}: {
  session: AnySession;
  showWorkspace?: boolean;
  onMutated: () => void;
}) {
  const relativeDate = sessionLastActivity(session).fromNow();
  const statusCfg = STATUS_CONFIG[sessionChatStatus(session)];

  const accessories: List.Item.Accessory[] = [];

  if (sessionHasPendingEdits(session)) {
    accessories.push({
      icon: { source: PENDING_BADGE.icon, tintColor: PENDING_BADGE.color },
      tag: { value: PENDING_BADGE.label, color: PENDING_BADGE.color },
    });
  }

  if (sessionIsForked(session)) {
    accessories.push({
      icon: { source: FORK_BADGE.icon, tintColor: FORK_BADGE.color },
      tag: { value: FORK_BADGE.label, color: FORK_BADGE.color },
    });
  }

  if (sessionIsAutomation(session)) {
    accessories.push({
      icon: { source: AUTOMATION_BADGE.icon, tintColor: AUTOMATION_BADGE.color },
      tag: { value: AUTOMATION_BADGE.label, color: AUTOMATION_BADGE.color },
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
      icon={{
        source: session.source === "copilot" ? "codicon-copilot.svg" : "codicon-device-desktop.svg",
        tintColor: Color.PrimaryText,
      }}
      title={sessionTitle(session)}
      subtitle={showWorkspace ? sessionWorkspaceName(session) : relativeDate}
      accessories={accessories}
      actions={<SessionActions session={session} onMutated={onMutated} />}
    />
  );
}
