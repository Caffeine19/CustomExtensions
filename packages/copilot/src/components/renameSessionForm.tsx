import { useState } from "react";

import { Action, ActionPanel, Form, Icon, Toast, showToast, useNavigation } from "@raycast/api";
import { useForm } from "@raycast/utils";

import { Effect, Result } from "effect";

import { renameCopilotSession } from "../services/sessions/copilot/copilotSessionService";
import type { CopilotSession } from "../types/sessions/copilotSession";
import { copilotSessionUri, sessionTitle } from "../utils/sessionDisplay";

interface RenameFormValues {
  title: string;
}

/** Rename form for Copilot Harness sessions (`session/titleChanged` via AHP). */
export function RenameSessionForm({ session, onMutated }: { session: CopilotSession; onMutated: () => void }) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const currentTitle = sessionTitle(session);

  const { handleSubmit, itemProps } = useForm<RenameFormValues>({
    initialValues: { title: currentTitle },
    validation: {
      title: (value) => {
        const newTitle = value?.trim();
        if (!newTitle) return "The title cannot be empty";
        if (newTitle === currentTitle) return "Enter a different title";
      },
    },
    onSubmit: async ({ title }) => {
      setIsLoading(true);
      const result = await Effect.runPromise(
        Effect.result(renameCopilotSession(copilotSessionUri(session), title.trim())),
      );
      setIsLoading(false);
      if (Result.isFailure(result)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to rename session",
          message: result.failure.message,
        });
        return;
      }
      await showToast({ style: Toast.Style.Success, title: "Session renamed" });
      // The host applies the rename to its catalog asynchronously — wait a beat
      // before refreshing so the list shows the new title instead of a stale one.
      await Effect.runPromise(Effect.sleep("300 millis"));
      onMutated();
      pop();
    },
  });

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Rename Session" icon={Icon.Pencil} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Session Title" placeholder="Enter a new session title" autoFocus {...itemProps.title} />
      <Form.Description text="Rename applies to the whole session and is immediately visible in VS Code." />
    </Form>
  );
}
