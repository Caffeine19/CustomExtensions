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

import { Effect, Result } from "effect";
import { group, sort } from "radash";

import { STATUS_CONFIG } from "./constants/sessionStatus";
import { useAllSessions } from "./hooks/useAllSessions";
import { openSessionViaUriHandler } from "./services/sessions/sessionService";
import { AnySession, ChatStatus } from "./types/sessions/session";
import "./utils/dayjsSetup";
import {
  sessionChatStatus,
  sessionHasPendingEdits,
  sessionLastActivity,
  sessionRowKey,
  sessionTitle,
  sessionWorkspaceName,
} from "./utils/sessionDisplay";

const ACTIVE_STATUSES: ChatStatus[] = ["in-progress", "needs-input", "failed"];

function isActive(session: AnySession): boolean {
  return ACTIVE_STATUSES.includes(sessionChatStatus(session));
}

/** Menu bar title display mode (`menubarDisplayMode` preference) */
type MenubarDisplayMode = "detailed" | "compact";

function menubarTitle(
  runningCount: number,
  waitingCount: number,
  pendingCount: number,
  errorCount: number,
  mode: MenubarDisplayMode,
): string {
  if (mode === "compact") return String(waitingCount + runningCount + pendingCount + errorCount);

  if (waitingCount === 0 && runningCount === 0 && pendingCount === 0 && errorCount === 0) return "None";

  const counts = {
    waiting: waitingCount,
    active: runningCount,
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

function SessionItem({ session, showWorkspace = false }: { session: AnySession; showWorkspace?: boolean }) {
  const statusCfg = STATUS_CONFIG[sessionChatStatus(session)];
  const showPending = sessionHasPendingEdits(session) && !isActive(session);
  return (
    <MenuBarExtra.Item
      icon={{
        source: showPending ? Icon.Pencil : statusCfg.icon,
        tintColor: showPending ? Color.Orange : statusCfg.color,
      }}
      title={sessionTitle(session)}
      subtitle={showWorkspace ? sessionWorkspaceName(session) : sessionLastActivity(session).fromNow()}
      tooltip={`${showPending ? "Pending Edits · " : ""}${statusCfg.label} · ${sessionLastActivity(session).fromNow()}`}
      onAction={async () => {
        await closeMainWindow();
        const result = await Effect.runPromise(Effect.result(openSessionViaUriHandler(session)));
        if (Result.isFailure(result)) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Failed to open session",
            message: String(result.failure),
          });
        }
      }}
    />
  );
}

export default function Command() {
  const { sessions, isLoading, revalidate } = useAllSessions();
  const { menubarDisplayMode } = getPreferenceValues();
  // Runtime override toggled from the menu bar footer; falls back to the preference value
  const [modeOverride, setModeOverride] = useCachedState<MenubarDisplayMode | null>("menubarModeOverride", null);
  const displayMode: MenubarDisplayMode = modeOverride ?? menubarDisplayMode;

  const nonEmpty = sessions?.filter((s) => sessionChatStatus(s) !== "empty") ?? [];
  const recentSessions = sort(nonEmpty, (s) => sessionLastActivity(s).valueOf(), true).slice(0, 20);

  const grouped = group(recentSessions, (session) => sessionWorkspaceName(session));

  // Use recentSessions as the base for Active section to keep time dimension consistent
  const activeRecentSessions = recentSessions.filter(isActive);

  const waitingSessions = activeRecentSessions.filter((s) => sessionChatStatus(s) === "needs-input");

  const runningSessions = activeRecentSessions.filter((s) => sessionChatStatus(s) === "in-progress");

  const pendingCount = recentSessions.filter((s) => sessionHasPendingEdits(s) && !isActive(s)).length;

  const errorSessions = activeRecentSessions.filter((s) => sessionChatStatus(s) === "failed");

  return (
    <MenuBarExtra
      icon={{ source: "github-copilot-dark.svg", tintColor: Color.PrimaryText }}
      title={menubarTitle(
        runningSessions.length,
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
            <SessionItem key={sessionRowKey(session)} session={session} showWorkspace />
          ))}
        </MenuBarExtra.Section>
      )}

      {/* Active sessions */}
      {runningSessions.length > 0 && (
        <MenuBarExtra.Section title={`Active (${runningSessions.length})`}>
          {runningSessions.map((session) => (
            <SessionItem key={sessionRowKey(session)} session={session} showWorkspace />
          ))}
        </MenuBarExtra.Section>
      )}

      {/* Error sessions */}
      {errorSessions.length > 0 && (
        <MenuBarExtra.Section title={`Error (${errorSessions.length})`}>
          {errorSessions.map((session) => (
            <SessionItem key={sessionRowKey(session)} session={session} showWorkspace />
          ))}
        </MenuBarExtra.Section>
      )}

      {/* Recent sessions grouped by workspace */}
      {Object.entries(grouped).map(([workspace, wsSessions]) => (
        <MenuBarExtra.Section key={workspace} title={workspace}>
          {wsSessions!.slice(0, 5).map((session) => (
            <SessionItem key={sessionRowKey(session)} session={session} />
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
              name: "listChatSessions",
              type: LaunchType.UserInitiated,
            })
          }
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
