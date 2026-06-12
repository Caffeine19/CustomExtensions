import { Action, Alert, Icon, showToast, Toast, confirmAlert } from "@raycast/api";
import { execSync } from "child_process";
import { Effect } from "effect";

import { OrganizeAction, TRIAGE_ACTIONS } from "@/constants/actions";
import {
  archiveEmail,
  markAsDone,
  markAsSeen,
  markAsUnseen,
  moveToTrash,
  pinEmail,
  snoozeEmail,
  unpinEmail,
} from "@/service/actionService";
import { fetchDeepLink } from "@/service/threadService";
import { SparkEmail } from "@/types/email";
import { SparkError } from "@/types/errors";
import { ThreadView } from "@/components/ThreadView";

const handleOrganizeError = (error: SparkError, action: string) => {
  if (error._tag === "TriageNotAvailableError") {
    showToast({
      style: Toast.Style.Failure,
      title: "Triage Not Available",
      message: "This action requires a Spark Pro plan. Upgrade to enable email management.",
    });
    return;
  }

  if (error._tag === "SparkNotSetupError") {
    showToast({
      style: Toast.Style.Failure,
      title: "Spark CLI Not Set Up",
      message: error.message,
    });
    return;
  }

  showToast({
    style: Toast.Style.Failure,
    title: `Failed to ${action}`,
    message: error.message,
  });
};

/** Execute a Spark CLI action */
const executeSparkAction = async (
  action: OrganizeAction,
  emailId: string,
  handler: (id: string) => Effect.Effect<void, SparkError>,
  label: string,
) => {
  if (TRIAGE_ACTIONS.has(action)) {
    const confirmed = await confirmAlert({
      title: `${label}?`,
      message: `Are you sure you want to ${label.toLowerCase()} this email?`,
      primaryAction: { title: label, style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
  }

  const program = handler(emailId).pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        showToast({ style: Toast.Style.Success, title: label, message: "Done" });
      }),
    ),
    Effect.catchAll((error: SparkError) => Effect.sync(() => handleOrganizeError(error, label))),
  );

  await Effect.runPromise(program);
};

/** Push to the thread detail view */
export function ViewThreadAction({ email }: { email: SparkEmail }) {
  return <Action.Push title="View Thread" icon={Icon.Envelope} target={<ThreadView email={email} />} />;
}

/** Open email in Spark Desktop via deep link */
export function OpenInSparkAction({ email }: { email: SparkEmail }) {
  return (
    <Action
      title="Open in Spark"
      icon={Icon.Globe}
      onAction={async () => {
        const program = fetchDeepLink(email.id).pipe(
          Effect.tap((deepLink) =>
            Effect.sync(() => {
              execSync(`open "${deepLink}"`);
            }),
          ),
          Effect.catchAll((error: SparkError) =>
            Effect.sync(() => {
              showToast({
                style: Toast.Style.Failure,
                title: "Failed to open in Spark",
                message: error.message,
              });
            }),
          ),
        );
        await Effect.runPromise(program);
      }}
    />
  );
}

/** Toggle between Mark as Read / Unread */
export function ToggleReadAction({ email }: { email: SparkEmail }) {
  if (email.isRead) {
    return (
      <Action
        title="Mark as Unread"
        icon={Icon.Circle}
        shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
        onAction={() => executeSparkAction(OrganizeAction.MarkAsUnseen, email.id, markAsUnseen, "Mark as Unread")}
      />
    );
  }
  return (
    <Action
      title="Mark as Read"
      icon={Icon.Checkmark}
      shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
      onAction={() => executeSparkAction(OrganizeAction.MarkAsSeen, email.id, markAsSeen, "Mark as Read")}
    />
  );
}

/** Toggle between Pin / Unpin */
export function TogglePinAction({ email }: { email: SparkEmail }) {
  if (email.isPinned) {
    return (
      <Action
        title="Unpin"
        icon={Icon.Pin}
        shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
        onAction={() => executeSparkAction(OrganizeAction.Unpin, email.id, unpinEmail, "Unpin")}
      />
    );
  }
  return (
    <Action
      title="Pin"
      icon={Icon.Pin}
      shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
      onAction={() => executeSparkAction(OrganizeAction.Pin, email.id, pinEmail, "Pin")}
    />
  );
}

/** Archive the email */
export function ArchiveAction({ email }: { email: SparkEmail }) {
  return (
    <Action
      title="Archive"
      icon={Icon.Tray}
      shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
      onAction={() => executeSparkAction(OrganizeAction.Archive, email.id, archiveEmail, "Archive")}
    />
  );
}

/** Mark as Done */
export function MarkAsDoneAction({ email }: { email: SparkEmail }) {
  return (
    <Action
      title="Mark as Done"
      icon={Icon.CheckCircle}
      shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
      onAction={() => executeSparkAction(OrganizeAction.MarkAsDone, email.id, markAsDone, "Mark as Done")}
    />
  );
}

/** Move email to trash */
export function DeleteAction({ email }: { email: SparkEmail }) {
  return (
    <Action
      title="Delete"
      icon={Icon.Trash}
      style={Action.Style.Destructive}
      shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
      onAction={() => executeSparkAction(OrganizeAction.MoveToTrash, email.id, moveToTrash, "Move to Trash")}
    />
  );
}

/** Snooze the email */
export function SnoozeAction({ email }: { email: SparkEmail }) {
  return (
    <Action
      title="Snooze"
      icon={Icon.Clock}
      shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
      onAction={() => executeSparkAction(OrganizeAction.Snooze, email.id, snoozeEmail, "Snooze")}
    />
  );
}

/** Copy the email ID to clipboard */
export function CopyEmailIdAction({ email }: { email: SparkEmail }) {
  return (
    <Action.CopyToClipboard title="Copy Email ID" content={email.id} shortcut={{ modifiers: ["cmd"], key: "c" }} />
  );
}
