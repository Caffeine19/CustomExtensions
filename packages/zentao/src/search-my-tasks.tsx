import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import dayjs from "dayjs";
import { Effect } from "effect";
import { CircularBuffer } from "mnemonist";
import { alphabetical, sift, unique } from "radash";
import { useEffect, useMemo, useState } from "react";

import { SortActions } from "@/components/actions/SortActions";
import { SessionRefreshAction } from "@/components/SessionRefreshAction";
import { TaskListItem as TaskListItemComponent } from "@/components/TaskListItem";
import { CACHE_KEYS } from "@/constants/key";
import { TaskStatus } from "@/constants/taskStatus";
import { useT } from "@/hooks/useT";
import { fetchTasksFromZentao } from "@/service/taskService";
import { SortOrder } from "@/types/sortOrder";
import { Task } from "@/types/task";
import { withAutoRetry } from "@/utils/autoRetry";
import { searchTasks } from "@/utils/fuseSearch";

export default function Command() {
  const { t } = useT();

  const [tasks, setTasks] = useCachedState<Task[]>(CACHE_KEYS.TASKS, []);
  const [isLoading, setIsLoading] = useState(false);
  const [sortOrder, setSortOrder] = useCachedState<SortOrder>(CACHE_KEYS.TASK_SORT_ORDER, "date-desc");
  const [selectedProject, setSelectedProject] = useCachedState<string>(CACHE_KEYS.SELECTED_PROJECT, "all");
  const [pinnedTaskIds, setPinnedTaskIds] = useCachedState<string[]>(CACHE_KEYS.PINNED_TASKS, []);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const togglePinTask = (taskId: string) => {
    setPinnedTaskIds((prev) => {
      if (prev.includes(taskId)) {
        return prev.filter((id) => id !== taskId);
      }

      const buffer = CircularBuffer.from(prev, Array, 10);
      buffer.push(taskId);
      return Array.from(buffer);
    });
  };

  const fetchTasks = async () => {
    setIsLoading(true);

    const program = fetchTasksFromZentao().pipe(
      withAutoRetry(),
      Effect.tap((parsedTasks) =>
        Effect.sync(() => {
          setTasks(parsedTasks);
          showToast({
            style: Toast.Style.Success,
            title: t("taskList.connectedToZentao"),
            message: t("taskList.foundTasks", { count: parsedTasks.length }),
          });
        }),
      ),
      Effect.catchAll((e) =>
        Effect.sync(() => {
          showToast({
            style: Toast.Style.Failure,
            title: t("taskList.failedToFetchTasks"),
            message: e.message,
          });
        }),
      ),
    );

    try {
      await Effect.runPromise(program);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshSession = async () => {
    // 会话刷新成功后，重新获取任务
    await fetchTasks();
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  /** 项目列表及任务数量 */
  const projectList = useMemo(() => {
    const projects = sift(tasks.map((task) => task.project));
    const uniqueProjectList = unique(projects, (project) => project);
    const sortedProjects = alphabetical(uniqueProjectList, (project) => project);

    // 计算每个项目的任务数量
    return sortedProjects.map((project) => ({
      name: project,
      count: tasks.filter((task) => task.project === project).length,
    }));
  }, [tasks]);

  /** 根据项目筛选任务 */
  const filteredTasks = useMemo(() => {
    if (selectedProject === "all") {
      return tasks;
    }
    return tasks.filter((task) => task.project === selectedProject);
  }, [tasks, selectedProject]);

  /** 根据搜索查询筛选任务（使用 Fuse.js 和拼音搜索） */
  const searchedTasks = useMemo(() => {
    return searchTasks(filteredTasks, searchQuery);
  }, [filteredTasks, searchQuery]);

  const sortedTasks = useMemo(() => {
    const tasksToSort = searchedTasks;
    if (sortOrder === "none") return tasksToSort;

    const sorted = [...tasksToSort].sort((a, b) => {
      if (sortOrder.startsWith("date")) {
        const dateA = dayjs(a.deadline);
        const dateB = dayjs(b.deadline);

        // Handle invalid dates - put them at the end
        if (!dateA.isValid() && !dateB.isValid()) return 0;
        if (!dateA.isValid()) return 1;
        if (!dateB.isValid()) return -1;

        if (sortOrder === "date-asc") {
          return dateA.isBefore(dateB) ? -1 : dateA.isAfter(dateB) ? 1 : 0;
        } else {
          return dateB.isBefore(dateA) ? -1 : dateB.isAfter(dateA) ? 1 : 0;
        }
      } else if (sortOrder.startsWith("priority")) {
        // Priority: 1 = highest, 4 = lowest
        const priorityA = parseInt(a.priority) || 999;
        const priorityB = parseInt(b.priority) || 999;

        if (sortOrder === "priority-asc") {
          return priorityA - priorityB; // 1,2,3,4 (highest to lowest)
        } else {
          return priorityB - priorityA; // 4,3,2,1 (lowest to highest)
        }
      } else if (sortOrder.startsWith("status")) {
        // Define status order for logical sorting
        const statusOrder = {
          [TaskStatus.WAIT]: 1,
          [TaskStatus.DOING]: 2,
          [TaskStatus.PAUSE]: 3,
          [TaskStatus.DONE]: 4,
          [TaskStatus.CANCEL]: 5,
          [TaskStatus.CLOSED]: 6,
        };

        const statusA = statusOrder[a.status as TaskStatus] || 999;
        const statusB = statusOrder[b.status as TaskStatus] || 999;

        if (sortOrder === "status-asc") {
          return statusA - statusB;
        } else {
          return statusB - statusA;
        }
      }

      return 0;
    });

    return sorted;
  }, [searchedTasks, sortOrder]);

  /** 置顶任务排在前面 */
  const pinnedTasks = useMemo(() => {
    return sortedTasks.filter((t) => pinnedTaskIds.includes(t.id));
  }, [sortedTasks, pinnedTaskIds]);

  const unpinnedTasks = useMemo(() => {
    return sortedTasks.filter((t) => !pinnedTaskIds.includes(t.id));
  }, [sortedTasks, pinnedTaskIds]);

  const renderTaskItem = (task: Task, isOverdue: boolean | string) => {
    const isPinned = pinnedTaskIds.includes(task.id);
    return (
      <TaskListItemComponent
        key={task.id}
        task={task}
        isOverdue={isOverdue}
        isPinned={isPinned}
        onTogglePin={togglePinTask}
        onSortOrderChange={setSortOrder}
        onRefreshSession={handleRefreshSession}
      />
    );
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={t("taskList.searchPlaceholder")}
      filtering={false} // Disable Raycast's filtering since we handle search ourselves
      navigationTitle={t("taskList.myTasks")}
      onSearchTextChange={setSearchQuery}
      searchText={searchQuery}
      searchBarAccessory={
        <List.Dropdown
          tooltip={t("taskList.filterByProject")}
          storeValue={true}
          onChange={(newValue) => {
            setSelectedProject(newValue);
          }}
        >
          <List.Dropdown.Item title={`${t("taskList.allProjects")} (${tasks.length})`} value="all" />
          {projectList.map((project) => {
            return (
              <List.Dropdown.Item
                key={project.name}
                title={`${project.name} ( ${project.count} )`}
                value={project.name}
              />
            );
          })}
        </List.Dropdown>
      }
      actions={
        <ActionPanel>
          <Action title={t("general.refresh")} onAction={fetchTasks} icon={Icon.ArrowClockwise} />
          <SessionRefreshAction onRefreshSuccess={handleRefreshSession} />
          <SortActions onSortOrderChange={setSortOrder} />
        </ActionPanel>
      }
    >
      {pinnedTasks.length === 0 && unpinnedTasks.length === 0 ? (
        <List.EmptyView
          title={t("taskList.noTasksTitle")}
          description={t("taskList.noTasksDescription")}
          actions={
            <ActionPanel>
              <Action title={t("general.refresh")} onAction={fetchTasks} icon={Icon.ArrowClockwise} />
              <SessionRefreshAction onRefreshSuccess={handleRefreshSession} />
            </ActionPanel>
          }
        />
      ) : (
        <>
          {pinnedTasks.length > 0 && (
            <List.Section title={t("general.pinned")}>
              {pinnedTasks.map((task) => {
                const isOverdue =
                  !(
                    task.status === TaskStatus.CANCEL ||
                    task.status === TaskStatus.DONE ||
                    task.status === TaskStatus.CLOSED
                  ) &&
                  task.deadline &&
                  !(dayjs(task.deadline).format("MM DD") === dayjs().format("MM DD")) &&
                  dayjs(task.deadline).year(dayjs().year()).isBefore(dayjs());

                return renderTaskItem(task, isOverdue);
              })}
            </List.Section>
          )}
          <List.Section title={pinnedTasks.length > 0 ? t("taskList.myTasks") : undefined}>
            {unpinnedTasks.map((task) => {
              const isOverdue =
                !(
                  task.status === TaskStatus.CANCEL ||
                  task.status === TaskStatus.DONE ||
                  task.status === TaskStatus.CLOSED
                ) &&
                task.deadline &&
                !(dayjs(task.deadline).format("MM DD") === dayjs().format("MM DD")) &&
                dayjs(task.deadline).year(dayjs().year()).isBefore(dayjs());

              return renderTaskItem(task, isOverdue);
            })}
          </List.Section>
        </>
      )}
    </List>
  );
}
