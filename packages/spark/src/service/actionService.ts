import { Effect } from "effect";

import { SparkCommandError, SparkNotSetupError, TriageNotAvailableError } from "@/types/errors";
import { execSpark } from "@/utils/sparkCli";

type SparkCliError = SparkNotSetupError | SparkCommandError;

type ActionEffect = Effect.Effect<void, SparkCliError | TriageNotAvailableError>;

/** Helper: run `spark action <action> <emailId>` */
const runAction = (action: string, emailId: string): ActionEffect =>
  Effect.gen(function* () {
    yield* execSpark(["action", action, emailId]);
  });

/** Mark email as read */
export const markAsSeen = (emailId: string): ActionEffect => runAction("markAsSeen", emailId);

/** Mark email as unread */
export const markAsUnseen = (emailId: string): ActionEffect => runAction("markAsUnseen", emailId);

/** Pin an email */
export const pinEmail = (emailId: string): ActionEffect => runAction("pin", emailId);

/** Unpin an email */
export const unpinEmail = (emailId: string): ActionEffect => runAction("unpin", emailId);

/** Move email to trash */
export const moveToTrash = (emailId: string): ActionEffect => runAction("moveToTrash", emailId);

/** Archive an email */
export const archiveEmail = (emailId: string): ActionEffect => runAction("archive", emailId);

/** Mark email as done */
export const markAsDone = (emailId: string): ActionEffect => runAction("markAsDone", emailId);

/** Mark email as not done */
export const markAsUndone = (emailId: string): ActionEffect => runAction("markAsUndone", emailId);

/** Snooze an email */
export const snoozeEmail = (emailId: string): ActionEffect => runAction("snooze", emailId);
