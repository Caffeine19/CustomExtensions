import { Effect } from "effect";

import { SparkCommandError, SparkNotSetupError } from "@/types/errors";
import { ThreadMessage } from "@/types/thread";
import { execSpark } from "@/utils/sparkCli";

type SparkCliError = SparkNotSetupError | SparkCommandError;

/** Parse `spark thread` output into structured messages */
const parseThreadOutput = (output: string): ThreadMessage[] => {
  const messages: ThreadMessage[] = [];
  const lines = output.split("\n");

  // Find separator lines (───)
  const separatorIndices = lines.map((line, i) => (line.trim().match(/^─{10,}$/) ? i : -1)).filter((i) => i !== -1);

  // Split content by separators into message blocks
  for (let s = 0; s < separatorIndices.length; s++) {
    const start = separatorIndices[s] + 1;
    const end = s + 1 < separatorIndices.length ? separatorIndices[s + 1] : lines.length;
    const block = lines.slice(start, end).join("\n").trim();
    if (!block) continue;

    const msg: ThreadMessage = { id: "", subject: "", from: "", to: "", date: "", body: "" };

    // Parse header lines (key: value)
    let bodyStart = 0;
    for (let i = 0; i < block.split("\n").length; i++) {
      const line = block.split("\n")[i];
      const kv = line.match(/^\s+(ID|Subject|From|To|Date|Type|Flags):\s*(.*)$/);
      if (kv) {
        const key = kv[1].toLowerCase();
        const val = kv[2].trim();
        if (key === "id") msg.id = val;
        else if (key === "subject") msg.subject = val;
        else if (key === "from") msg.from = val;
        else if (key === "to") msg.to = val;
        else if (key === "date") msg.date = val;
        bodyStart = i + 1;
      } else if (line.trim() === "" && bodyStart > 0) {
        bodyStart = i + 1;
        break;
      }
    }

    // Everything after headers is the body, strip attachments block
    const rawBody = block.split("\n").slice(bodyStart).join("\n");
    msg.body = rawBody.replace(/\n\s*Attachments:\s*\n[\s\S]*$/, "").trim();
    messages.push(msg);
  }

  return messages;
};

/** Fetch and parse a thread by email message ID */
export const fetchThread = (emailId: string): Effect.Effect<ThreadMessage[], SparkCliError> =>
  Effect.gen(function* () {
    const output = yield* execSpark(["thread", emailId]);
    return parseThreadOutput(output);
  });

/** Fetch raw thread output as a string */
export const fetchThreadRaw = (emailId: string): Effect.Effect<string, SparkCliError> => execSpark(["thread", emailId]);

/** Fetch the Spark deep link for an email by running `spark thread` and extracting the Link field */
export const fetchDeepLink = (emailId: string): Effect.Effect<string, SparkCliError> =>
  Effect.gen(function* () {
    const output = yield* execSpark(["thread", emailId]);
    const linkMatch = output.match(/Link:\s*(https:\/\/[^\s]+)/);
    if (!linkMatch) {
      return yield* new SparkCommandError({
        command: `spark thread ${emailId}`,
        message: "No deep link found in thread output",
      });
    }
    const url = new URL(linkMatch[1]);
    const token = url.searchParams.get("token") ?? "";
    // Decode URL-encoded CRLF in base64 token
    const cleanToken = token.replace(/%0D%0A/g, "").replace(/\r?\n/g, "");
    return `readdle-spark://bl=${cleanToken}`;
  });
