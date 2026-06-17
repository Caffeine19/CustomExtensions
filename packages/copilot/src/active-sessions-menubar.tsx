import { Color, Icon, Toast, launchCommand, LaunchType, MenuBarExtra, closeMainWindow, showToast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { Effect } from "effect";
import { isLeft } from "effect/Either";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { loadAllSessions, openSessionViaUriHandler } from "./utils/session-reader";
import { ChatStatus, ResolvedChatSession } from "./types/session";

dayjs.extend(relativeTime);

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ChatStatus, { label: string; icon: Icon; color: Color }> = {
  empty: { label: "Empty", icon: Icon.Circle, color: Color.SecondaryText },
  "in-progress": { label: "Active", icon: Icon.CircleProgress, color: Color.Blue },
  completed: { label: "Done", icon: Icon.CheckCircle, color: Color.Green },
  failed: { label: "Fail", icon: Icon.ExclamationMark, color: Color.Red },
  "needs-input": { label: "Input", icon: Icon.QuestionMark, color: Color.Yellow },
  archived: { label: "Archived", icon: Icon.Tray, color: Color.Blue },
};

const ACTIVE_STATUSES: ChatStatus[] = ["in-progress", "needs-input"];

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

function menubarTitle(activeSessions: ResolvedChatSession[]): string {
  if (activeSessions.length === 0) return "No Active";
  if (activeSessions.length === 1) return `1 Active`;
  return `${activeSessions.length} Active`;
}

function SessionItem({ session }: { session: ResolvedChatSession }) {
  const statusCfg = STATUS_CONFIG[session.chatStatus];
  return (
    <MenuBarExtra.Item
      icon={{ source: statusCfg.icon, tintColor: statusCfg.color }}
      title={truncate(session.title, 40)}
      subtitle={dayjs(session.lastMessageDate).fromNow()}
      tooltip={`${statusCfg.label} · ${dayjs(session.lastMessageDate).fromNow()}`}
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
  const { data: sessions, isLoading, revalidate } = useCachedPromise(loadAllSessions, []);

  const nonEmpty = sessions?.filter((s) => s.chatStatus !== "empty") ?? [];
  const activeSessions = nonEmpty.filter(isActive);
  const recentSessions = nonEmpty
    .sort((a, b) => b.lastMessageDate.getTime() - a.lastMessageDate.getTime())
    .slice(0, 20);

  const grouped = groupByWorkspace(recentSessions);

  return (
    <MenuBarExtra
      icon="github-copilot-dark.svg"
      title={menubarTitle(activeSessions)}
      tooltip="VS Code Copilot Sessions"
      isLoading={isLoading}
    >
      {/* Active sessions at the top */}
      {activeSessions.length > 0 && (
        <MenuBarExtra.Section title={`Active (${activeSessions.length})`}>
          {activeSessions.map((session) => (
            <SessionItem key={session.sessionId} session={session} />
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
