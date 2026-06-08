import { Effect } from "effect";

import { SparkEmail } from "@/types/email";
import { SparkCommandError, SparkNotSetupError } from "@/types/errors";
import { execSpark } from "@/utils/sparkCli";

type SparkCliError = SparkNotSetupError | SparkCommandError;

/** Parse key-value block output from `spark search` */
const parseSearchOutput = (output: string): SparkEmail[] => {
  const emails: SparkEmail[] = [];
  const lines = output.split("\n");
  let current: Partial<SparkEmail> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("─")) continue;

    const idMatch = trimmed.match(/^ID:\s*(.+)$/);
    const subjectMatch = trimmed.match(/^Subject:\s*(.+)$/);
    const fromMatch = trimmed.match(/^From:\s*(.+)$/);
    const toMatch = trimmed.match(/^To:\s*(.+)$/);
    const dateMatch = trimmed.match(/^Date:\s*(.+)$/);

    if (idMatch) {
      if (current.id) {
        emails.push(current as SparkEmail);
      }
      current = {
        id: idMatch[1],
        subject: "",
        from: "",
        fromEmail: "",
        to: [],
        date: "",
        snippet: "",
        isRead: true,
        isPinned: false,
        hasAttachment: false,
        isReplied: false,

        inInbox: true,
        inSent: false,
        inDrafts: false,
        inArchive: false,
        inTrash: false,
        inSpam: false,
        inStarred: false,
        inLater: false,
        inBlocked: false,

        account: "",
      };
    } else if (subjectMatch) {
      current.subject = subjectMatch[1];
    } else if (fromMatch) {
      const raw = fromMatch[1];
      const m = raw.match(/^(.*?)\s*<(.+?)>?…?$/);
      current.from = m ? m[1].trim() : raw;
      current.fromEmail = m ? m[2].replace(/…$/, "") : raw;
    } else if (toMatch) {
      current.to = [toMatch[1]];
    } else if (dateMatch) {
      current.date = dateMatch[1];
    }
  }
  if (current.id) {
    emails.push(current as SparkEmail);
  }

  return emails;
};

/** Search emails via `spark search`. Pass a folder to scope the search to a specific account. */
export const searchEmails = (query: string, folder?: string): Effect.Effect<SparkEmail[], SparkCliError> =>
  Effect.gen(function* () {
    const args = folder ? ["search", query, folder] : ["search", query];
    const output = yield* execSpark(args);
    return parseSearchOutput(output);
  });
