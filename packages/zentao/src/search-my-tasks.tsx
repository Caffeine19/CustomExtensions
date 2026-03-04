import { Action, ActionPanel, getPreferenceValues, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import dayjs from "dayjs";
import { alphabetical, sift, unique } from "radash";
import { useEffect, useMemo, useState } from "react";

import { SessionRefreshAction } from "./components/SessionRefreshAction";
import { TaskDetail } from "./components/TaskDetail";
import { TAILWIND_COLORS } from "./constants/colors";
import { CACHE_KEYS } from "./constants/key";
import { getPriorityColor, getPriorityIcon, getPriorityLabel } from "./constants/priority";
import { getStatusIconConfig, TaskStatus } from "./constants/status";
import { useT } from "./hooks/useT";
import { Task } from "./types/task";
import { SessionExpiredError } from "./utils/error";
import { searchTasks } from "./utils/fuseSearch";
import { logger } from "./utils/logger";
import { slice } from "./utils/slice";
import { fetchTasksFromZentao } from "./utils/taskService";

type SortOrder = "none" | "date-asc" | "date-desc" | "priority-asc" | "priority-desc" | "status-asc" | "status-desc";

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();

  const { t } = useT();

  const [tasks, setTasks] = useCachedState<Task[]>(CACHE_KEYS.TASKS, []);
  const [isLoading, setIsLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  const [selectedProject, setSelectedProject] = useCachedState<string>(CACHE_KEYS.SELECTED_PROJECT, "all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchTasks = async () => {
    try {
      setIsLoading(true);

      const parsedTasks = await fetchTasksFromZentao();

      showToast({
        style: Toast.Style.Success,
        title: t("taskList.connectedToZentao"),
        message: t("taskList.foundTasks", { count: parsedTasks.length }),
      });

      setTasks(parsedTasks);
    } catch (error) {
      logger.error("Error fetching tasks:", error instanceof Error ? error : String(error));

      // 检查是否是会话过期错误
      if (error instanceof SessionExpiredError) {
        showToast({
          style: Toast.Style.Failure,
          title: t("errors.sessionExpired"),
          message: t("errors.sessionExpiredAction"),
        });
      } else {
        showToast({
          style: Toast.Style.Failure,
          title: t("taskList.failedToFetchTasks"),
          message: error instanceof Error ? error.message : t("errors.unknownError"),
        });
      }
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
                title={`${slice(project.name, 14)} ( ${project.count} )`}
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
          <ActionPanel.Section title={t("sortActions.sortByDate")}>
            <Action
              title={t("sortActions.sortByDateEarliestFirst")}
              onAction={() => setSortOrder("date-asc")}
              icon={Icon.ArrowUp}
            />
            <Action
              title={t("sortActions.sortByDateLatestFirst")}
              onAction={() => setSortOrder("date-desc")}
              icon={Icon.ArrowDown}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title={t("sortActions.sortByPriority")}>
            <Action
              title={t("sortActions.sortByPriorityHighToLow")}
              onAction={() => setSortOrder("priority-asc")}
              icon={Icon.ArrowUp}
            />
            <Action
              title={t("sortActions.sortByPriorityLowToHigh")}
              onAction={() => setSortOrder("priority-desc")}
              icon={Icon.ArrowDown}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title={t("sortActions.sortByStatus")}>
            <Action
              title={t("sortActions.sortByStatusActiveFirst")}
              onAction={() => setSortOrder("status-asc")}
              icon={Icon.ArrowUp}
            />
            <Action
              title={t("sortActions.sortByStatusCompletedFirst")}
              onAction={() => setSortOrder("status-desc")}
              icon={Icon.ArrowDown}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title={t("sortActions.resetSort")}>
            <Action title={t("sortActions.resetSort")} onAction={() => setSortOrder("none")} icon={Icon.Minus} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      {sortedTasks.length === 0 ? (
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
        sortedTasks.map((task) => {
          const isOverdue =
            !(
              task.status === TaskStatus.CANCEL ||
              task.status === TaskStatus.DONE ||
              task.status === TaskStatus.CLOSED
            ) &&
            task.deadline &&
            !(dayjs(task.deadline).format("MM DD") === dayjs().format("MM DD")) &&
            dayjs(task.deadline).year(dayjs().year()).isBefore(dayjs());

          return (
            <List.Item
              key={task.id}
              icon={getStatusIconConfig(task.status)}
              title={task.title}
              subtitle={task.project}
              accessories={[
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
                <ActionPanel>
                  <Action.Push
                    title={t("taskActions.viewTaskDetails")}
                    target={<TaskDetail task={task} />}
                    icon={Icon.Eye}
                  />
                  <Action.OpenInBrowser
                    title={t("taskActions.openInZentao")}
                    url={`${preferences.zentaoUrl}/task-view-${task.id}.html`}
                    icon={Icon.Globe}
                  />
                  <Action.CopyToClipboard title={t("taskActions.copyTaskId")} content={task.id} icon={Icon.Clipboard} />
                  <Action title={t("general.refresh")} onAction={fetchTasks} icon={Icon.ArrowClockwise} />
                  <SessionRefreshAction onRefreshSuccess={handleRefreshSession} />

                  <ActionPanel.Section title={t("sortActions.sortByDate")}>
                    <Action
                      title={t("sortActions.sortByDateEarliestFirst")}
                      onAction={() => setSortOrder("date-asc")}
                      icon={Icon.ArrowUp}
                    />
                    <Action
                      title={t("sortActions.sortByDateLatestFirst")}
                      onAction={() => setSortOrder("date-desc")}
                      icon={Icon.ArrowDown}
                    />
                  </ActionPanel.Section>

                  <ActionPanel.Section title={t("sortActions.sortByPriority")}>
                    <Action
                      title={t("sortActions.sortByPriorityHighToLow")}
                      onAction={() => setSortOrder("priority-asc")}
                      icon={Icon.ArrowUp}
                    />
                    <Action
                      title={t("sortActions.sortByPriorityLowToHigh")}
                      onAction={() => setSortOrder("priority-desc")}
                      icon={Icon.ArrowDown}
                    />
                  </ActionPanel.Section>

                  <ActionPanel.Section title={t("sortActions.sortByStatus")}>
                    <Action
                      title={t("sortActions.sortByStatusActiveFirst")}
                      onAction={() => setSortOrder("status-asc")}
                      icon={Icon.ArrowUp}
                    />
                    <Action
                      title={t("sortActions.sortByStatusCompletedFirst")}
                      onAction={() => setSortOrder("status-desc")}
                      icon={Icon.ArrowDown}
                    />
                  </ActionPanel.Section>

                  <ActionPanel.Section title={t("sortActions.resetSort")}>
                    <Action
                      title={t("sortActions.resetSort")}
                      onAction={() => setSortOrder("none")}
                      icon={Icon.Minus}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
