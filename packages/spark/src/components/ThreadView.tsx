import { Action, ActionPanel, Detail, showToast, Toast } from "@raycast/api";
import { Effect } from "effect";
import { useEffect, useMemo, useState } from "react";

import { fetchThread, fetchThreadRaw } from "@/service/threadService";
import { ThreadMessage } from "@/types/thread";
import { extractName } from "@/utils/format";

/** Render a single thread message as markdown */
const renderMessage = (msg: ThreadMessage): string => {
  const from = extractName(msg.from);
  const parts = [`## ${from}`, `**${msg.subject}** · ${msg.date}`];
  parts.push(msg.body);
  return parts.join("\n");
};

export function ThreadView({ emailId }: { emailId: string }) {
  const [raw, setRaw] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadThread = async () => {
      const program = Effect.all([fetchThreadRaw(emailId), fetchThread(emailId)]).pipe(
        Effect.tap(([rawOutput, parsed]) =>
          Effect.sync(() => {
            setRaw(rawOutput);
            setMessages(parsed);
          }),
        ),
        Effect.catchAll((error) =>
          Effect.sync(() => {
            showToast({
              style: Toast.Style.Failure,
              title: "Failed to load thread",
              message: error.message,
            });
          }),
        ),
      );
      await Effect.runPromise(program);
      setIsLoading(false);
    };
    loadThread();
  }, [emailId]);

  const markdown = useMemo(() => {
    if (!raw) return "";
    if (messages.length === 0) return raw;
    return messages.map(renderMessage).join("\n\n---\n\n");
  }, [raw, messages]);

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={messages[0]?.subject || "Thread"}
      actions={
        raw ? (
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Thread" content={raw} />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}
