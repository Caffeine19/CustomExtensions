import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Icon,
  Toast,
  closeMainWindow,
  confirmAlert,
  showToast,
} from "@raycast/api";

import { Effect, Match, Result } from "effect";

import { STATUS_CONFIG } from "../constants/sessionStatus";
import {
  deleteCopilotChat,
  forkCopilotChat,
  setCopilotChatArchived,
} from "../services/sessions/copilot/copilotSessionService";
import {
  buildSessionDeepLink,
  openSessionViaUriHandler,
  openWorkspaceInVSCode,
  revealSessionFileInFinder,
} from "../services/sessions/sessionService";
import { type AhpError } from "../types/errors";
import { CopilotSession } from "../types/sessions/copilotSession";
import { AnySession } from "../types/sessions/session";
import {
  copilotChatUri,
  copilotIsDefaultChat,
  copilotSessionUri,
  sessionChatStatus,
  sessionCreated,
  sessionHasPendingEdits,
  sessionId,
  sessionInitialLocation,
  sessionIsArchived,
  sessionLastActivity,
  sessionTitle,
  sessionWorkspacePath,
} from "../utils/sessionDisplay";
import { RenameSessionForm } from "./renameSessionForm";

/** Run an AHP mutation with toast feedback, then refresh the list. */
async function runAhpMutation(
  action: () => Effect.Effect<unknown, AhpError>,
  successTitle: string,
  onMutated: () => void,
): Promise<void> {
  const result = await Effect.runPromise(Effect.result(action()));
  if (Result.isFailure(result)) {
    await showToast({
      style: Toast.Style.Failure,
      title: `${successTitle} failed`,
      message: result.failure.message,
    });
    return;
  }
  await showToast({ style: Toast.Style.Success, title: successTitle });
  // dispatchAction is fire-and-forget and the host's catalog applies it
  // asynchronously — give it a beat before refetching so the list shows the
  // new state instead of a stale snapshot.
  await Effect.runPromise(Effect.sleep("300 millis"));
  onMutated();
}

/** Copilot Harness mutations (rename / fork / archive / delete) — only defined for AHP-backed rows. */
function CopilotHarnessSection({ session, onMutated }: { session: CopilotSession; onMutated: () => void }) {
  const chatUri = copilotChatUri(session);
  const isDefaultChat = copilotIsDefaultChat(session);
  const isArchived = sessionIsArchived(session);

  return (
    <ActionPanel.Section title="Copilot Harness">
      <Action.Push
        title="Rename Session"
        icon={Icon.Pencil}
        target={<RenameSessionForm session={session} onMutated={onMutated} />}
      />
      {chatUri && (
        <Action
          title="Fork from Latest Turn"
          icon={Icon.Duplicate}
          shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
          onAction={() =>
            runAhpMutation(
              () => forkCopilotChat(copilotSessionUri(session), chatUri),
              "Forked from latest turn",
              onMutated,
            )
          }
        />
      )}
      <Action
        title={
          isArchived
            ? isDefaultChat
              ? "Unarchive Session"
              : "Unarchive Chat"
            : isDefaultChat
              ? "Archive Session"
              : "Archive Chat"
        }
        icon={Icon.Tray}
        shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
        onAction={() => {
          // `isArchived` is orthogonal to the activity badge: an archived chat with a
          // running turn still shows "Active", so the toggle must not read from chatStatus.
          const isArchiving = !isArchived;
          // A session's main chat cannot be archived on its own — the host
          // archives the whole session instead, so label it accordingly.
          const label = isDefaultChat ? "Session" : "Chat";
          return runAhpMutation(
            () => setCopilotChatArchived(copilotSessionUri(session), chatUri, isDefaultChat, isArchiving),
            `${label} ${isArchiving ? "archived" : "unarchived"}`,
            onMutated,
          );
        }}
      />
      {!isDefaultChat && chatUri && (
        <Action
          title="Delete Chat"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "x" }}
          onAction={async () => {
            const confirmed = await confirmAlert({
              title: "Delete Chat",
              message: `Delete "${sessionTitle(session)}"? This removes the chat from its session and cannot be undone.`,
              primaryAction: {
                title: "Delete",
                style: Alert.ActionStyle.Destructive,
              },
            });
            if (confirmed) {
              await runAhpMutation(() => deleteCopilotChat(chatUri, isDefaultChat), "Chat deleted", onMutated);
            }
          }}
        />
      )}
    </ActionPanel.Section>
  );
}

/** The full action panel for a session row: open, Copilot Harness mutations, info and debug actions. */
export function SessionActions({ session, onMutated }: { session: AnySession; onMutated: () => void }) {
  const statusCfg = STATUS_CONFIG[sessionChatStatus(session)];

  return (
    <ActionPanel>
      <ActionPanel.Section title="Open">
        <Action
          title="Open Chat Session"
          icon={Icon.Message}
          onAction={async () => {
            await closeMainWindow();
            const result = await Effect.runPromise(Effect.result(openSessionViaUriHandler(session)));
            if (Result.isFailure(result)) {
              await showToast({
                style: Toast.Style.Failure,
                title: "Failed to open session",
                message: result.failure.message,
              });
            }
          }}
        />
        {sessionWorkspacePath(session) && (
          <Action
            title="Open Workspace"
            icon={Icon.Folder}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
            onAction={async () => {
              await closeMainWindow();
              const result = await Effect.runPromise(Effect.result(openWorkspaceInVSCode(session)));
              if (Result.isFailure(result)) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Failed to open workspace",
                  message: result.failure.message,
                });
              }
            }}
          />
        )}
      </ActionPanel.Section>
      {Match.value(session).pipe(
        Match.when({ source: "copilot" }, (s) => <CopilotHarnessSection session={s} onMutated={onMutated} />),
        Match.orElse(() => null),
      )}
      <ActionPanel.Section title="Info">
        <Action.CopyToClipboard
          title="Copy as Deep Link"
          icon={Icon.Link}
          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          content={buildSessionDeepLink(session)}
        />
        <Action.CopyToClipboard
          title="Copy as Markdown Link"
          icon={Icon.Link}
          shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
          content={`[${sessionTitle(session)}](${buildSessionDeepLink(session)})`}
        />
        <Action.CopyToClipboard title="Copy Session ID" icon={Icon.Clipboard} content={sessionId(session)} />
        {sessionWorkspacePath(session) && (
          <Action.CopyToClipboard
            title="Copy Workspace Path"
            icon={Icon.Folder}
            content={sessionWorkspacePath(session)}
          />
        )}
        <Action.CopyToClipboard title="Copy Session Title" icon={Icon.Text} content={sessionTitle(session)} />
      </ActionPanel.Section>
      <ActionPanel.Section title="Debug">
        <Action
          title="Reveal Session File in Finder"
          icon={Icon.Finder}
          shortcut={{ modifiers: ["cmd", "opt"], key: "r" }}
          onAction={async () => {
            await closeMainWindow();
            const result = await Effect.runPromise(Effect.result(revealSessionFileInFinder(session)));
            if (Result.isFailure(result)) {
              await showToast({
                style: Toast.Style.Failure,
                title: "Failed to reveal in Finder",
                message: result.failure.message,
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
              `**Title:** ${sessionTitle(session)}`,
              `**Session ID:** \`${sessionId(session)}\``,
              `**Workspace:** ${sessionWorkspacePath(session)}`,
              `**Created:** ${sessionCreated(session).format("YYYY-MM-DD HH:mm")}`,
              `**Last Activity:** ${sessionLastActivity(session).format("YYYY-MM-DD HH:mm:ss")}`,
              `**Status:** ${statusCfg.label}`,
              `**Has Pending Edits:** ${sessionHasPendingEdits(session) ? "Yes" : "No"}`,
              `**Initial Location:** ${sessionInitialLocation(session) ?? "N/A"}`,
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
  );
}
