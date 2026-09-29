import { Action, ActionPanel, Form, Icon, Toast, closeMainWindow, showToast } from "@raycast/api";
import { FormValidation, useForm, usePromise } from "@raycast/utils";

import { Effect } from "effect";
import { isLeft } from "effect/Either";

import { QuickChatParams, launchQuickChat } from "./utils/quick-chat-launcher";
import { fetchRecentProjects } from "./utils/recent-projects";

type FormValues = Omit<QuickChatParams, "workspace" | "workspaceType" | "addFiles"> & {
  workspace: string;
  files: string[];
};

export default function Command() {
  const { data: recentProjects, isLoading } = usePromise(() => Effect.runPromise(fetchRecentProjects()), []);

  const { handleSubmit, itemProps } = useForm<FormValues>({
    async onSubmit(values) {
      const { prompt, mode, workspace, files } = values;

      await closeMainWindow();

      // Determine workspace type from the selected project
      const selectedProject = projects.find((p) => p.path === workspace);
      const workspaceType = selectedProject?.entryType;

      const either = await Effect.runPromise(
        Effect.either(
          launchQuickChat({
            prompt: prompt.trim(),
            mode,
            workspace: workspace || undefined,
            workspaceType,
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

  const projects = recentProjects ?? [];

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Start Chat" icon={Icon.Message} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {/* Prompt Section */}
      <Form.TextArea
        title="Prompt"
        placeholder="Ask GitHub Copilot anything..."
        autoFocus
        enableMarkdown
        {...itemProps.prompt}
      />
      <Form.Separator />
      {projects.length > 0 ? (
        <Form.Dropdown id="workspace" title="Workspace" storeValue>
          <Form.Dropdown.Item value="" title="Reuse Current" icon={Icon.BlankDocument} />
          <Form.Dropdown.Section title="Recent Projects">
            {projects.map((project) => (
              <Form.Dropdown.Item
                key={project.path}
                value={project.path}
                title={project.name}
                icon={
                  project.entryType === "workspace"
                    ? Icon.Desktop
                    : project.entryType === "file"
                      ? Icon.Document
                      : Icon.Folder
                }
              />
            ))}
          </Form.Dropdown.Section>
        </Form.Dropdown>
      ) : (
        <Form.FilePicker
          id="workspace"
          title="Workspace Folder"
          allowMultipleSelection={false}
          canChooseDirectories
          canChooseFiles={false}
        />
      )}

      {/* Context Section */}
      <Form.Dropdown id="mode" title="Chat Mode" defaultValue="agent">
        <Form.Dropdown.Item value="agent" title="Agent" icon={Icon.Quicklink} />
        <Form.Dropdown.Item value="ask" title="Ask" icon={Icon.SpeechBubbleActive} />
        <Form.Dropdown.Item value="edit" title="Edit" icon={Icon.Pencil} />
      </Form.Dropdown>

      <Form.FilePicker id="files" title="File Context" />
    </Form>
  );
}
