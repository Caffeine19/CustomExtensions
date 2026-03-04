import { Action, ActionPanel, Detail, getPreferenceValues, Icon, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";

import { getPriorityColor, getPriorityLabel } from "../constants/priority";
import { getStatusColor, getStatusLabel, TaskStatus } from "../constants/status";
import { useT } from "../hooks/useT";
import { Task } from "../types/task";
import { logger } from "../utils/logger";
import { fetchTaskDetail } from "../utils/taskService";
import { FinishTaskForm } from "./FinishTaskForm";
import { SessionRefreshAction } from "./SessionRefreshAction";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task }: TaskDetailProps) {
  const preferences = getPreferenceValues<Preferences>();
  const { t } = useT();

  // 任务详情状态
  const [taskDetail, setTaskDetail] = useState<Task>(task);
  const [isLoading, setIsLoading] = useState(false);

  /** 获取任务详细信息 */
  const loadTaskDetail = async () => {
    try {
      setIsLoading(true);

      showToast({
        style: Toast.Style.Animated,
        title: t("taskDetails.loadingTaskDetail"),
        message: t("taskDetails.pleaseWait"),
      });

      const detailedTask = await fetchTaskDetail(task.id);
      setTaskDetail(detailedTask);

      showToast({
        style: Toast.Style.Success,
        title: t("taskDetails.loadTaskDetailSuccess"),
        message: t("taskDetails.taskDetailLoaded"),
      });
    } catch (error) {
      logger.error("Error loading task detail:", error instanceof Error ? error : String(error));
      showToast({
        style: Toast.Style.Failure,
        title: t("taskDetails.loadTaskDetailFailed"),
        message: error instanceof Error ? error.message : t("errors.unknownError"),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 组件加载时获取任务详情
  useEffect(() => {
    loadTaskDetail();
  }, [task.id]);

  const markdown = /* md */ `
##   ${taskDetail.title}

| 🕰️ ${t("taskDetails.estimatedTime")} | ⚡ ${t("taskDetails.consumedTime")} | ⏳ ${t("taskDetails.remainingTime")} |
|:--:|:--:|:--:|
| ${taskDetail.estimate || t("taskDetails.notSet")} | ${taskDetail.consumed || "0"} | ${taskDetail.left || t("taskDetails.notCalculated")} |

| 📅 ${t("taskDetails.estimatedStart")} | 🚀 ${t("taskDetails.actualStart")} | ⏰ ${t("taskDetails.deadline")} |
|:--:|:--:|:--:|
| ${taskDetail.estimatedStart || t("taskDetails.notSet")} | ${taskDetail.actualStart || t("taskDetails.notStarted")} | ${taskDetail.deadline || t("taskDetails.notSet")} |
`;

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={`${t("taskDetails.taskTitle")} #${taskDetail.id}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title={`${t("taskDetails.taskTitle")} ID`} text={taskDetail.id} />

          <Detail.Metadata.Separator />

          <Detail.Metadata.TagList title={t("taskDetails.currentStatus")}>
            <Detail.Metadata.TagList.Item
              text={getStatusLabel(taskDetail.status)}
              color={getStatusColor(taskDetail.status)}
            />
          </Detail.Metadata.TagList>

          <Detail.Metadata.TagList title={t("taskDetails.priority")}>
            <Detail.Metadata.TagList.Item
              text={`${getPriorityLabel(taskDetail.priority)}(${taskDetail.priority})`}
              color={getPriorityColor(taskDetail.priority)}
            />
          </Detail.Metadata.TagList>

          <Detail.Metadata.Separator />

          <Detail.Metadata.Label
            title={t("taskDetails.project")}
            text={taskDetail.project || t("errors.unknownError")}
          />
          <Detail.Metadata.Label
            title={t("taskDetails.assignedTo")}
            text={taskDetail.assignedTo || t("taskDetails.notAssigned")}
          />

          <Detail.Metadata.Separator />

          <Detail.Metadata.Link
            title={t("taskActions.openInZentao")}
            target={`${preferences.zentaoUrl}/task-view-${taskDetail.id}.html`}
            text={t("taskActions.viewTaskDetails")}
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {/* 只有未完成的任务才显示完成操作 */}
          {taskDetail.status !== TaskStatus.DONE && taskDetail.status !== TaskStatus.CLOSED && (
            <Action.Push
              title={t("taskActions.finishTask")}
              icon={Icon.Checkmark}
              target={<FinishTaskForm task={taskDetail} />}
            />
          )}
          <Action.OpenInBrowser
            title={t("taskActions.openInZentao")}
            url={`${preferences.zentaoUrl}/task-view-${taskDetail.id}.html`}
            icon={Icon.Globe}
          />
          <SessionRefreshAction />
          <ActionPanel.Section title={t("taskActions.copyTaskId")}>
            <Action.CopyToClipboard title={t("taskActions.copyTaskId")} content={taskDetail.id} icon={Icon.Clipboard} />
            <Action.CopyToClipboard
              title={t("taskDetails.copyUrl")}
              content={`${preferences.zentaoUrl}/task-view-${taskDetail.id}.html`}
              icon={Icon.Link}
            />
            <Action.CopyToClipboard title={t("taskDetails.copyTitle")} content={taskDetail.title} icon={Icon.Text} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
