import { Color, Icon, List } from "@raycast/api";

import { TaskItemActions } from "@/components/actions/TaskItemActions";
import { TAILWIND_COLORS } from "@/constants/colors";
import { getPriorityColor, getPriorityIcon, getPriorityLabel } from "@/constants/taskPriority";
import { getStatusIconConfig } from "@/constants/taskStatus";
import { SortOrder } from "@/types/sortOrder";
import { Task } from "@/types/task";

interface TaskListItemProps {
  task: Task;
  isOverdue: boolean | string;
  isPinned: boolean;
  onTogglePin: (taskId: string) => void;
  onSortOrderChange: (order: SortOrder) => void;
  onRefreshSession: () => Promise<void>;
}

export function TaskListItem({
  task,
  isOverdue,
  isPinned,
  onTogglePin,
  onSortOrderChange,
  onRefreshSession,
}: TaskListItemProps) {
  return (
    <List.Item
      icon={getStatusIconConfig(task.status)}
      title={task.title}
      subtitle={task.project}
      accessories={[
        ...(isPinned ? [{ icon: { source: Icon.Pin, tintColor: Color.Red } }] : []),
        ...(task.deadline
          ? [
              {
                tag: {
                  value: task.deadline,
                  color: isOverdue ? TAILWIND_COLORS.red[400] : TAILWIND_COLORS.gray[300],
                },
              },
            ]
          : []),
        {
          icon: {
            source: getPriorityIcon(task.priority),
            tintColor: getPriorityColor(task.priority),
          },
          tooltip: getPriorityLabel(task.priority),
        },
      ]}
      actions={
        <TaskItemActions
          task={task}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
          onSortOrderChange={onSortOrderChange}
          onRefreshSession={onRefreshSession}
        />
      }
    />
  );
}
