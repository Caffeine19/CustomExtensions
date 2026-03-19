import { Action, ActionPanel, getPreferenceValues, Icon } from "@raycast/api";

import { SortActions } from "@/components/actions/SortActions";
import { SessionRefreshAction } from "@/components/SessionRefreshAction";
import { TaskDetail } from "@/components/TaskDetail";
import { useT } from "@/hooks/useT";
import { SortOrder } from "@/types/sortOrder";
import { Task } from "@/types/task";

interface TaskItemActionsProps {
  task: Task;
  isPinned: boolean;
  onTogglePin: (taskId: string) => void;
  onSortOrderChange: (order: SortOrder) => void;
  onRefreshSession: () => Promise<void>;
}

export function TaskItemActions({
  task,
  isPinned,
  onTogglePin,
  onSortOrderChange,
  onRefreshSession,
}: TaskItemActionsProps) {
  const preferences = getPreferenceValues<Preferences>();
  const { t } = useT();

  return (
    <ActionPanel>
      <Action.Push title={t("taskActions.viewTaskDetails")} target={<TaskDetail task={task} />} icon={Icon.Eye} />

      <Action
        title={isPinned ? t("taskActions.unpinTask") : t("taskActions.pinTask")}
        onAction={() => onTogglePin(task.id)}
        icon={isPinned ? Icon.PinDisabled : Icon.Pin}
        shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
      />

      <Action.OpenInBrowser
        title={t("taskActions.openInZentao")}
        url={`${preferences.zentaoUrl}/task-view-${task.id}.html`}
        icon={Icon.Globe}
      />

      <Action.CopyToClipboard
        title={t("taskActions.copyTaskId")}
        content={task.id}
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
      />

      <Action.CopyToClipboard
        title={t("taskActions.copyTaskUrl")}
        content={`${preferences.zentaoUrl}/task-view-${task.id}.html`}
        icon={Icon.Link}
        shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
      />

      <SessionRefreshAction onRefreshSuccess={onRefreshSession} />

      <SortActions onSortOrderChange={onSortOrderChange} />
    </ActionPanel>
  );
}
