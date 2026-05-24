import { Form, ActionPanel, Action, Icon, showToast, Toast, closeMainWindow } from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";
import { Effect } from "effect";
import { isLeft } from "effect/Either";
import { launchQuickChat, QuickChatParams } from "./utils/quick-chat-launcher";

type FormValues = Omit<QuickChatParams, "workspace" | "addFiles"> & {
  workspace: string[];
  files: string[];
};

export default function Command() {
  const { handleSubmit, itemProps } = useForm<FormValues>({
    async onSubmit(values) {
      const { prompt, mode, workspace, files } = values;

      await closeMainWindow();

      const either = await Effect.runPromise(
        Effect.either(
          launchQuickChat({
            prompt: prompt.trim(),
            mode,
            workspace: workspace.length > 0 ? workspace[0] : undefined,
            addFiles: files.length > 0 ? files : undefined,
          }),
        ),
      );

      if (isLeft(either)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to launch chat",
          message: either.left.message,
        });
        return;
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Chat launched",
        message: "Opened in VS Code",
      });
    },
    validation: {
      prompt: FormValidation.Required,
    },
  });

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Start Chat" icon={Icon.Message} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        title="Prompt"
        placeholder="Ask GitHub Copilot anything..."
        autoFocus
        enableMarkdown
        {...itemProps.prompt}
      />
      <Form.Dropdown id="mode" title="Chat Mode" defaultValue="agent">
        <Form.Dropdown.Item value="agent" title="Agent" icon={Icon.Wand} />
        <Form.Dropdown.Item value="ask" title="Ask" icon={Icon.QuestionMark} />
        <Form.Dropdown.Item value="edit" title="Edit" icon={Icon.Pencil} />
      </Form.Dropdown>
      <Form.Separator />
      <Form.FilePicker
        id="workspace"
        title="Workspace Folder"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
      />
      <Form.FilePicker id="files" title="File Context" />
    </Form>
  );
}
