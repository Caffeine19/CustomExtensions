import {
  Color,
  Icon,
  LaunchType,
  MenuBarExtra,
  Toast,
  closeMainWindow,
  getPreferenceValues,
  launchCommand,
  showToast,
} from "@raycast/api";
import { useCachedState } from "@raycast/utils";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Effect } from "effect";
import { isLeft } from "effect/Either";

import { ChatStatus, ResolvedChatSession } from "./types/session";
import { openSessionViaUriHandler } from "./utils/session-reader";
import { useAllSessions } from "./utils/use-all-sessions";

dayjs.extend(relativeTime);

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ChatStatus, { label: string; icon: Icon; color: Color }> = {
  empty: { label: "Empty", icon: Icon.Circle, color: Color.SecondaryText },
  "in-progress": { label: "Active", icon: Icon.CircleProgress, color: Color.Blue },
  completed: { label: "Done", icon: Icon.CheckCircle, color: Color.Green },
  failed: { label: "Fail", icon: Icon.ExclamationMark, color: Color.Red },
  "needs-input": { label: "Waiting", icon: Icon.QuestionMark, color: Color.Yellow },
  archived: { label: "Archived", icon: Icon.Tray, color: Color.Blue },
};

const ACTIVE_STATUSES: ChatStatus[] = ["in-progress", "needs-input", "failed"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isActive(session: ResolvedChatSession): boolean {
  return ACTIVE_STATUSES.includes(session.chatStatus);
}

function groupByWorkspace(sessions: ResolvedChatSession[]): Map<string, ResolvedChatSession[]> {
  const groups = new Map<string, ResolvedChatSession[]>();
  for (const session of sessions) {
    if (!groups.has(session.workspaceName)) groups.set(session.workspaceName, []);
    groups.get(session.workspaceName)!.push(session);
  }
  return groups;
}

/** Menu bar title display mode (`menubarDisplayMode` preference) */
type MenubarDisplayMode = "detailed" | "compact";

function menubarTitle(
  activeSessions: ResolvedChatSession[],
  waitingCount: number,
  pendingCount: number,
  errorCount: number,
  mode: MenubarDisplayMode,
): string {
  const activeCount = activeSessions.filter((s) => s.chatStatus === "in-progress").length;

  // Compact mode: a single total number (e.g. "5" instead of "1 Waiting / 3 Active / 1 Pending")
  if (mode === "compact") return String(waitingCount + activeCount + pendingCount + errorCount);

  if (waitingCount === 0 && activeCount === 0 && pendingCount === 0 && errorCount === 0) return "None";

  const counts = {
    waiting: waitingCount,
    active: activeCount,
    pending: pendingCount,
    error: errorCount,
  };

  const parts: string[] = [];
  if (counts.waiting > 0) parts.push(`${counts.waiting} Waiting`);
  if (counts.active > 0) parts.push(`${counts.active} Active`);
  if (counts.pending > 0) parts.push(`${counts.pending} Pending`);
  if (counts.error > 0) parts.push(`${counts.error} Error`);

  return parts.join(" / ");
}

function SessionItem({ session, showWorkspace = false }: { session: ResolvedChatSession; showWorkspace?: boolean }) {
  const statusCfg = STATUS_CONFIG[session.chatStatus];
  const showPending = session.hasPendingEdits && !isActive(session);
  return (
    <MenuBarExtra.Item
      icon={{
        source: showPending ? Icon.Pencil : statusCfg.icon,
        tintColor: showPending ? Color.Orange : statusCfg.color,
      }}
      title={truncate(session.title, 40)}
      subtitle={showWorkspace ? session.workspaceName : session.lastMessageDate.fromNow()}
      tooltip={`${showPending ? "Pending Edits · " : ""}${statusCfg.label} · ${session.lastMessageDate.fromNow()}`}
      onAction={async () => {
        await closeMainWindow();
        const result = await Effect.runPromise(Effect.either(openSessionViaUriHandler(session)));
        if (isLeft(result)) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Failed to open session",
            message: String(result.left),
          });
        }
      }}
    />
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Command() {
  const { sessions, isLoading, revalidate } = useAllSessions();
  const { menubarDisplayMode } = getPreferenceValues();
  // Runtime override toggled from the menu bar footer; falls back to the preference value
  const [modeOverride, setModeOverride] = useCachedState<MenubarDisplayMode | null>("menubarModeOverride", null);
  const displayMode: MenubarDisplayMode = modeOverride ?? menubarDisplayMode;

  const nonEmpty = sessions?.filter((s) => s.chatStatus !== "empty") ?? [];
  const recentSessions = nonEmpty
    .sort((a, b) => b.lastMessageDate.valueOf() - a.lastMessageDate.valueOf())
    .slice(0, 20);

  const grouped = groupByWorkspace(recentSessions);

  // Use recentSessions as the base for Active section to keep time dimension consistent
  const activeRecentSessions = recentSessions.filter(isActive);
  const waitingSessions = activeRecentSessions.filter((s) => s.chatStatus === "needs-input");
  const pendingCount = recentSessions.filter((s) => s.hasPendingEdits && !isActive(s)).length;
  const errorSessions = activeRecentSessions.filter((s) => s.chatStatus === "failed");

  return (
    <MenuBarExtra
      icon="github-copilot-dark.svg"
      title={menubarTitle(
        activeRecentSessions,
        waitingSessions.length,
        pendingCount,
        errorSessions.length,
        displayMode,
      )}
      tooltip="VS Code Copilot Sessions"
      isLoading={isLoading}
    >
      {/* Sessions waiting for the user's reply (question / confirmation) */}
      {waitingSessions.length > 0 && (
        <MenuBarExtra.Section title={`Needs Your Input (${waitingSessions.length})`}>
          {waitingSessions.map((session) => (
            <SessionItem key={session.sessionId} session={session} showWorkspace />
          ))}
        </MenuBarExtra.Section>
      )}

      {/* Active sessions */}
      {activeRecentSessions.filter((s) => s.chatStatus === "in-progress").length > 0 && (
        <MenuBarExtra.Section
          title={`Active (${activeRecentSessions.filter((s) => s.chatStatus === "in-progress").length})`}
        >
          {activeRecentSessions
            .filter((s) => s.chatStatus === "in-progress")
            .map((session) => (
              <SessionItem key={session.sessionId} session={session} showWorkspace />
            ))}
        </MenuBarExtra.Section>
      )}

      {/* Error sessions */}
      {errorSessions.length > 0 && (
        <MenuBarExtra.Section title={`Error (${errorSessions.length})`}>
          {errorSessions.map((session) => (
            <SessionItem key={session.sessionId} session={session} showWorkspace />
          ))}
        </MenuBarExtra.Section>
      )}

      {/* Recent sessions grouped by workspace */}
      {Array.from(grouped.entries()).map(([workspace, wsSessions]) => (
        <MenuBarExtra.Section key={workspace} title={workspace}>
          {wsSessions.slice(0, 5).map((session) => (
            <SessionItem key={session.sessionId} session={session} />
          ))}
        </MenuBarExtra.Section>
      ))}

      {/* Footer actions */}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item icon={Icon.RotateClockwise} title="Refresh" onAction={revalidate} />
        <MenuBarExtra.Item
          icon={Icon.Switch}
          title={displayMode === "compact" ? "Switch to Detailed Mode" : "Switch to Compact Mode"}
          onAction={() => setModeOverride(displayMode === "compact" ? "detailed" : "compact")}
        />
        <MenuBarExtra.Item
          icon={Icon.ArrowsExpand}
          title="Open Full List"
          onAction={() =>
            launchCommand({
              name: "list-chat-sessions",
              type: LaunchType.UserInitiated,
            })
          }
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
