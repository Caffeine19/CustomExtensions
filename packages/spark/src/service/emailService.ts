import { Effect } from "effect";

import { SparkEmail } from "@/types/email";
import { SparkCommandError, SparkNotSetupError } from "@/types/errors";
import { execSpark } from "@/utils/sparkCli";

type SparkCliError = SparkNotSetupError | SparkCommandError;

/** Column positions extracted from a table header line */
interface ColumnPositions {
  id: { start: number; end: number };
  account: { start: number; end: number };
  from: { start: number; end: number };
  date: { start: number; end: number };
  subject: { start: number; end: number };
  flags: { start: number; end: number };
}

/** Detect column start positions from the header line */
const parseTableHeader = (headerLine: string): ColumnPositions | null => {
  const headers = ["ID", "Account", "From", "Date", "Subject", "Flags"];
  const positions: Record<string, number> = {};

  for (const header of headers) {
    const idx = headerLine.indexOf(header);
    if (idx === -1 && header !== "Flags") return null; // Flags is optional
    if (idx !== -1) positions[header.toLowerCase()] = idx;
  }

  const sortedKeys = Object.entries(positions).sort((a, b) => a[1] - b[1]);
  const result: Record<string, { start: number; end: number }> = {};
  for (let i = 0; i < sortedKeys.length; i++) {
    const [key, start] = sortedKeys[i];
    const end = i + 1 < sortedKeys.length ? sortedKeys[i + 1][1] : Infinity;
    result[key] = { start, end };
  }

  return result as unknown as ColumnPositions;
};

/** Extract a substring at column position, trimming whitespace */
const cellAt = (line: string, pos: { start: number; end: number }): string => {
  const slice = line.slice(pos.start, Math.min(pos.end, line.length));
  return slice.trim();
};

/** Parse table-format output from `spark emails` */
const parseEmailsTable = (output: string): SparkEmail[] => {
  const lines = output.split("\n");
  const emails: SparkEmail[] = [];

  // Find the header line containing "ID"
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("ID") && lines[i].includes("Account") && lines[i].includes("From")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const cols = parseTableHeader(lines[headerIdx]);
  if (!cols) return [];

  // Parse data rows (everything after header until empty line or "Page" line)
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("Page")) break;

    const id = cellAt(line, cols.id);
    if (!id || !/^\d+$/.test(id)) continue;

    const account = cellAt(line, cols.account);
    const fromRaw = cellAt(line, cols.from);
    const date = cellAt(line, cols.date);
    const subject = cellAt(line, cols.subject);
    const flags = cols.flags ? cellAt(line, cols.flags) : "";

    // Parse "Name <email>" or truncated "Name <email…" format
    const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>?…?$/);
    const from = fromMatch ? fromMatch[1].trim() : fromRaw;
    const fromEmail = fromMatch ? fromMatch[2].replace(/…$/, "") : fromRaw;

    emails.push({
      id,
      subject,
      from,
      fromEmail,
      to: [],
      date,
      snippet: "",

      isRead: !flags.includes("unread"),
      isPinned: flags.includes("starred"),
      isReplied: flags.includes("replied"),
      hasAttachment: flags.includes("attachment"),

      inInbox: true,
      inSent: false,
      inDrafts: false,
      inArchive: false,
      inTrash: false,
      inSpam: false,
      inStarred: false,
      inLater: false,
      inBlocked: false,

      account,
    });
  }

  return emails;
};

/** List emails via `spark emails`. Pass a folder (e.g. an account email) to scope the query. */
export const listEmails = (folder?: string): Effect.Effect<SparkEmail[], SparkCliError> =>
  Effect.gen(function* () {
    const args = folder ? ["emails", folder] : ["emails"];
    const output = yield* execSpark(args);
    return parseEmailsTable(output);
  });
