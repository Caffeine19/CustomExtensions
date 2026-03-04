import { Action, ActionPanel, Form, Icon, popToRoot, showToast, Toast } from "@raycast/api";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useT } from "../hooks/useT";
import { Task } from "../types/task";
import { TeamMember } from "../types/teamMember";
import { SessionExpiredError } from "../utils/error";
import { logger } from "../utils/logger";
import { fetchTaskFormDetails, finishTask, FinishTaskParams } from "../utils/taskService";
import { SessionRefreshAction } from "./SessionRefreshAction";

/** 工作日常量 */
const WORK_START_HOUR = 9; // 上班时间 09:00
const WORK_END_HOUR = 18; // 下班时间 18:00
const HOURS_PER_DAY = 8; // 每天工作 8 小时

/**
 * 根据开始时间和消耗工时计算结束时间
 *
 * 计算逻辑：
 *
 * - 每个工作日 8 小时 (09:00 - 18:00)
 * - 8 小时 → 当天 18:00
 * - 4 小时 → 当天 13:00 (09:00 + 4)
 * - 16 小时 → 次日 18:00 (2 个工作日)
 * - 24 小时 → 第三天 18:00 (3 个工作日)
 *
 * @param startDateTime - 开始时间 (YYYY-MM-DD HH:mm)
 * @param consumedHours - 消耗工时
 * @returns 结束时间 (YYYY-MM-DD HH:mm)
 */
function calculateFinishTime(startDateTime: string, consumedHours: number): string {
  if (!startDateTime || consumedHours <= 0) {
    return dayjs().format("YYYY-MM-DD HH:mm");
  }

  const start = dayjs(startDateTime);

  // 计算需要的工作天数和剩余小时
  const daysNeeded = Math.ceil(consumedHours / HOURS_PER_DAY);
  const remainingHours = consumedHours % HOURS_PER_DAY;

  let finishTime: dayjs.Dayjs;

  if (remainingHours === 0) {
    // 刚好完成整数天，结束于第 daysNeeded 天的 18:00
    // 例如: 24小时 = 3天，从 12.10 开始，结束于 12.12 18:00 (加 2 天)
    finishTime = start
      .add(daysNeeded - 1, "day")
      .hour(WORK_END_HOUR)
      .minute(0);
  } else {
    // 有剩余小时，结束于第 daysNeeded 天的 09:00 + remainingHours
    // 例如: 12小时 = 1天8小时 + 4小时，从 12.10 开始，结束于 12.11 13:00
    finishTime = start
      .add(daysNeeded - 1, "day")
      .hour(WORK_START_HOUR + remainingHours)
      .minute(0);
  }

  return finishTime.format("YYYY-MM-DD HH:mm");
}

interface FinishTaskFormProps {
  task: Task;
  onFinished?: () => void;
}

interface FormValues {
  currentConsumed: string;
  consumed: string;
  assignedTo: string;
  realStarted: string;
  finishedDate: string;
  comment: string;
}

export function FinishTaskForm({ task, onFinished }: FinishTaskFormProps) {
  const { t } = useT();
  const [isLoading, setIsLoading] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [formUid, setFormUid] = useState<string>("");

  // 预设默认值
  const defaultConsumed = task.consumed || "0";
  // 默认当前消耗工时为预计工时
  const defaultCurrentConsumed = task.estimate || "8";
  // 默认实际开始时间为预计开始日期 + 09:00
  const defaultRealStarted = task.estimatedStart
    ? `${task.estimatedStart} 09:00`
    : dayjs().format("YYYY-MM-DD") + " 09:00";
  // 默认完成时间根据开始时间和消耗工时计算
  const defaultFinishedDate = calculateFinishTime(defaultRealStarted, parseFloat(defaultCurrentConsumed) || 8);
  console.log("🚀 ~ FinishTaskForm.tsx:89 ~ FinishTaskForm ~ defaultFinishedDate:", defaultFinishedDate);

  // 计算总消耗工时
  const calculateTotalConsumed = (current: string) => {
    const currentNum = parseFloat(current) || 0;
    const previousNum = parseFloat(defaultConsumed) || 0;
    return (currentNum + previousNum).toString();
  };

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      currentConsumed: defaultCurrentConsumed,
      consumed: calculateTotalConsumed(defaultCurrentConsumed),
      assignedTo: "", // Will be set after loading form details
      realStarted: defaultRealStarted,
      finishedDate: defaultFinishedDate,
      comment: "client: raycast/zentao",
    },
  });

  const loadFormData = async () => {
    try {
      const formDetails = await fetchTaskFormDetails(task.id);
      setMembers(formDetails.members);
      setFormUid(formDetails.uid);

      const selectedMember = formDetails.members.find((member) => member.selected);
      if (selectedMember) {
        // Update the form with the selected member's value instead of the task's assignedTo
        setValue("assignedTo", selectedMember.value);
      }
    } catch (error) {
      logger.error("Failed to load form details:", error instanceof Error ? error : String(error));

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
          title: t("errors.loadFormDetailsError"),
          message: String(error),
        });
      }
    }
  };

  // Watch currentConsumed and realStarted to update total consumed and finish time
  const currentConsumed = watch("currentConsumed");
  const realStarted = watch("realStarted");

  useEffect(() => {
    const newTotal = calculateTotalConsumed(currentConsumed);
    setValue("consumed", newTotal);

    // 重新计算完成时间
    const hours = parseFloat(currentConsumed) || 8;
    const startTime = realStarted || defaultRealStarted;
    const newFinishedDate = calculateFinishTime(startTime, hours);
    setValue("finishedDate", newFinishedDate);
  }, [currentConsumed, realStarted, setValue]);

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);

    try {
      const params: FinishTaskParams = {
        taskId: task.id,
        currentConsumed: values.currentConsumed,
        consumed: values.consumed,
        assignedTo: values.assignedTo || task.assignedTo,
        realStarted: values.realStarted,
        finishedDate: values.finishedDate,
        status: "done",
        uid: formUid,
        comment: values.comment,
      };

      logger.debug("FinishTaskForm.tsx ~ onSubmit ~ params:", params);

      await finishTask(params);

      showToast({
        style: Toast.Style.Success,
        title: t("taskCompletion.taskCompletedSuccessTitle"),
        message: t("taskCompletion.taskCompletedSuccessMessage", { title: task.title }),
      });

      if (onFinished) {
        onFinished();
      }

      // 返回到根视图
      popToRoot();
    } catch (error) {
      logger.error("Error finishing task:", error instanceof Error ? error : String(error));

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
          title: t("taskCompletion.taskCompletionFailedTitle"),
          message: error instanceof Error ? error.message : t("errors.unknownError"),
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshSession = async () => {
    await loadFormData();
  };

  useEffect(() => {
    loadFormData();
  }, [task.id, setValue]);

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action title={t("taskActions.finishTask")} icon={Icon.Checkmark} onAction={handleSubmit(onSubmit)} />
          <SessionRefreshAction onRefreshSuccess={handleRefreshSession} />
        </ActionPanel>
      }
    >
      <Form.Description title={t("taskForm.finishTaskTitle")} text={task.title} />
      <Form.Description title={t("taskDetails.project")} text={task.project} />
      <Form.Separator />

      <Controller
        name="currentConsumed"
        control={control}
        render={({ field }) => (
          <Form.TextField
            id="currentConsumed"
            title={t("taskForm.currentConsumedTime")}
            placeholder={t("taskForm.currentConsumedTimePlaceholder")}
            info={t("taskForm.currentConsumedTimeInfo")}
            value={field.value}
            onChange={field.onChange}
            error={errors.currentConsumed?.message}
          />
        )}
      />

      <Form.Description
        title={t("taskForm.totalConsumedTime")}
        text={t("taskForm.totalConsumedTimeCalculation", {
          total: watch("consumed"),
          previous: defaultConsumed,
          current: currentConsumed,
        })}
      />

      <Controller
        name="assignedTo"
        control={control}
        render={({ field }) => (
          <Form.Dropdown
            id="assignedTo"
            title={t("taskForm.assignTo")}
            info={t("taskForm.assignToInfo")}
            value={field.value}
            onChange={field.onChange}
          >
            {members.map((member: TeamMember) => (
              <Form.Dropdown.Item key={member.value} value={member.value} title={member.title} />
            ))}
          </Form.Dropdown>
        )}
      />

      <Form.Separator />

      <Controller
        name="realStarted"
        control={control}
        render={({ field }) => (
          <Form.DatePicker
            id="realStarted"
            title={t("taskForm.actualStartTime")}
            info={t("taskForm.actualStartTimeInfo")}
            type={Form.DatePicker.Type.DateTime}
            value={field.value ? dayjs(field.value).toDate() : null}
            onChange={(date) => field.onChange(date ? dayjs(date).format("YYYY-MM-DD HH:mm") : "")}
            error={errors.realStarted?.message}
          />
        )}
      />

      <Form.Description
        title={t("taskForm.actualStartTime")}
        text={realStarted ? dayjs(realStarted, "YYYY-MM-DD HH:mm").format("YYYY-MM-DD HH:mm") : "-"}
      />

      <Controller
        name="finishedDate"
        control={control}
        render={({ field }) => (
          <Form.DatePicker
            id="finishedDate"
            title={t("taskForm.finishTime")}
            info={t("taskForm.finishTimeInfo")}
            type={Form.DatePicker.Type.DateTime}
            value={field.value ? dayjs(field.value).toDate() : null}
            onChange={(date) => field.onChange(date ? dayjs(date).format("YYYY-MM-DD HH:mm") : "")}
            error={errors.finishedDate?.message}
          />
        )}
      />

      <Form.Description
        title={t("taskForm.finishTime")}
        text={watch("finishedDate") ? dayjs(watch("finishedDate"), "YYYY-MM-DD HH:mm").format("YYYY-MM-DD HH:mm") : "-"}
      />

      <Form.Separator />

      <Controller
        name="comment"
        control={control}
        render={({ field }) => (
          <Form.TextArea
            id="comment"
            title={t("taskForm.comments")}
            placeholder={t("taskForm.commentsPlaceholder")}
            info={t("taskForm.commentsInfo")}
            value={field.value}
            onChange={field.onChange}
            error={errors.comment?.message}
          />
        )}
      />
    </Form>
  );
}
