import { getPreferenceValues } from "@raycast/api";
import * as cheerio from "cheerio";

import { TaskPriority } from "../constants/priority";
import { TaskStatus } from "../constants/status";
import { Task } from "../types/task";
import { TaskFormDetails } from "../types/taskFormDetails";
import { TeamMember } from "../types/teamMember";
import { withAutoRetry } from "./autoRetry";
import { SessionExpiredError } from "./error";
import { logger } from "./logger";
import { isSessionExpired } from "./loginService";

/**
 * 从 HTML 页面解析任务信息
 *
 * @param html - 从禅道系统获取的 HTML 页面内容
 */
export function parseTasksFromHtml(html: string): Task[] {
  const tasks: Task[] = [];

  try {
    // 使用 Cheerio 加载 HTML
    const $ = cheerio.load(html);

    // 查找任务表格行，可能的选择器
    const taskSelectors = [
      "tr[data-id]", // 有 data-id 属性的行
      "tbody tr", // 表格体中的行
      ".table tr", // 有 table 类的表格中的行
      "#taskTable tr", // ID 为 taskTable 的表格中的行
    ];

    let $taskRows = $();

    // 尝试不同的选择器找到任务行
    for (const selector of taskSelectors) {
      $taskRows = $(selector);
      if ($taskRows.length > 0) {
        logger.debug(`Found ${$taskRows.length} rows using selector: ${selector}`);
        break;
      }
    }

    // 遍历每一行提取任务信息
    $taskRows.each((index, row) => {
      const $row = $(row);

      // 提取任务ID
      const taskId = $row.attr("data-id");

      if (!taskId) return; // 跳过没有ID的行

      // 提取任务标题
      const title = $row.find(".c-name a").text().trim();
      logger.debug("taskService.ts ~ parseTasksFromHtml ~ title:", title);

      // 提取状态
      const status = $row.find(".c-status .status-task").text().trim();

      // 提取项目信息（取第一个项目名称）
      const project = $row.find(".c-project a").first().text().trim();

      // 提取优先级
      const priorityText = $row.find(".c-pri span").text().trim();

      // 将优先级文本转换为 TaskPriority 枚举
      let priority: TaskPriority;
      const priorityNum = parseInt(priorityText);
      if (priorityNum === 1) {
        priority = TaskPriority.CRITICAL;
      } else if (priorityNum === 2) {
        priority = TaskPriority.HIGH;
      } else if (priorityNum === 3) {
        priority = TaskPriority.MEDIUM;
      } else if (priorityNum === 4) {
        priority = TaskPriority.LOW;
      } else {
        priority = TaskPriority.MEDIUM; // Default fallback
      }

      // 提取截止日期
      const deadline = $row.find("td.text-center span").text().trim();

      // 提取工时信息（按顺序：预计、消耗、剩余）
      const $hours = $row.find(".c-hours");
      const estimate = $hours.eq(0).text().trim();
      const consumed = $hours.eq(1).text().trim();
      const left = $hours.eq(2).text().trim();

      // 提取指派人
      const assignedTo = $row.find(".c-user").first().text().trim();

      tasks.push({
        id: taskId,
        title: title,
        status: status as TaskStatus,
        project: project,
        assignedTo: assignedTo,
        deadline: deadline,
        priority: priority,
        estimate: estimate,
        consumed: consumed,
        left: left,
        estimatedStart: "", // 在任务列表页面通常不显示，使用空字符串作为默认值
        actualStart: "", // 在任务列表页面通常不显示，使用空字符串作为默认值
      });
    });

    logger.info(`Parsed ${tasks.length} tasks from HTML`);
  } catch (error) {
    logger.error("Error parsing HTML with Cheerio:", error instanceof Error ? error : String(error));
  }

  logger.debug("taskService.ts:79 ~ parseTasksFromHtml ~ tasks:", tasks);

  return tasks;
}

/**
 * 获取任务完成表单详情，包括团队成员列表
 *
 * @param taskId - 任务ID
 */
export async function fetchTaskFormDetails(taskId: string): Promise<TaskFormDetails> {
  return withAutoRetry(async () => {
    const preferences = getPreferenceValues<Preferences>();

    try {
      const finishFormUrl = `${preferences.zentaoUrl}/task-finish-${taskId}.html?onlybody=yes`;

      const response = await fetch(finishFormUrl, {
        method: "GET",
        headers: {
          Cookie: `zentaosid=${preferences.zentaoSid}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();

      // 检查会话是否已过期
      if (isSessionExpired(html)) {
        logger.info("Session expired detected in task form");
        throw new SessionExpiredError();
      }

      // 保存 HTML 到日志文件用于调试
      logger.saveApiResponse("task-finish-form.html", html);

      return parseTaskFormDetails(html);
    } catch (error) {
      logger.error("Error fetching task form details:", error instanceof Error ? error : String(error));
      throw error;
    }
  });
}

/**
 * 解析任务完成表单的详细信息
 *
 * @param html - 表单页面的 HTML 内容
 */
export function parseTaskFormDetails(html: string): TaskFormDetails {
  const $ = cheerio.load(html);

  // 解析团队成员选项
  const members: TeamMember[] = [];
  $("#assignedTo option").each((index, element) => {
    const $option = $(element);
    const value = $option.attr("value") || "";
    const title = $option.attr("title") || "";
    const label = $option.text().trim();
    const selected = $option.attr("selected") === "selected";

    // 跳过空选项
    if (value && label) {
      members.push({
        value,
        label,
        title,
        selected,
      });
    }
  });

  // 获取表单当前值
  const currentConsumed = ($("#currentConsumed").val() as string) || "0";
  const totalConsumed = ($("#consumed").val() as string) || "0";
  const assignedTo = $("#assignedTo option[selected]").attr("value") || "";
  const realStarted = ($("#realStarted").val() as string) || "";
  const finishedDate = ($("#finishedDate").val() as string) || "";

  // 提取 kuid（用作表单的 uid）
  let uid = "";
  const scriptContent = $("script").text();
  const kuidMatch = scriptContent.match(/var kuid = '([^']+)'/);
  if (kuidMatch) {
    uid = kuidMatch[1];
  }

  return {
    members,
    currentConsumed,
    totalConsumed,
    assignedTo,
    realStarted,
    finishedDate,
    uid,
  };
}

/**
 * 获取单个任务的详细信息
 *
 * @param taskId - 任务ID
 */
export async function fetchTaskDetail(taskId: string): Promise<Task> {
  return withAutoRetry(async () => {
    const preferences = getPreferenceValues<Preferences>();
    const { zentaoUrl, zentaoSid, username } = preferences;

    try {
      const url = `${zentaoUrl}/task-view-${taskId}.html`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
          Connection: "keep-alive",
          Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();

      // 检查会话是否已过期
      if (isSessionExpired(html)) {
        logger.info("Session expired detected in task detail");
        throw new SessionExpiredError();
      }

      // 保存 HTML 到日志文件用于调试
      logger.saveApiResponse("task-detail.html", html);

      return parseTaskDetailFromHtml(html, taskId);
    } catch (error) {
      logger.error("Error fetching task detail:", error instanceof Error ? error : String(error));
      throw error;
    }
  });
}

/**
 * 从任务详情页面 HTML 解析任务信息
 *
 * @param html - 任务详情页面的 HTML 内容
 * @param taskId - 任务ID
 */
export function parseTaskDetailFromHtml(html: string, taskId: string): Task {
  const $ = cheerio.load(html);

  // 从页面标题提取任务标题
  const fullTitle = $("title").text();
  const titleMatch = fullTitle.match(/TASK#\d+\s+(.+?)\s+\/\s+/);
  const title = titleMatch ? titleMatch[1].trim() : $("h1").text().trim();

  // 从基本信息表格提取数据
  const basicTable = $("#legendBasic table.table-data");

  // 获取所属执行（项目）
  const project =
    basicTable.find("tr").eq(0).find("td a").text().trim() ||
    basicTable.find("th:contains('所属执行')").next("td").find("a").text().trim();

  // 获取指派给
  const assignedToText = basicTable.find("th:contains('指派给')").next("td").text().trim();
  const assignedToMatch = assignedToText.match(/^([^\s]+)/);
  const assignedTo = assignedToMatch ? assignedToMatch[1] : "";

  // 获取任务状态
  const statusElement = basicTable.find("th:contains('任务状态')").next("td").find(".status-task");
  let status = statusElement.text().trim();
  // 移除状态文本中的标签符号
  status = status.replace(/^\s*•\s*/, "").trim();

  // 获取优先级
  const priorityText = basicTable.find("th:contains('优先级')").next("td").find(".label-pri").text().trim();
  let priority: TaskPriority;
  const priorityNum = parseInt(priorityText);
  if (priorityNum === 1) {
    priority = TaskPriority.CRITICAL;
  } else if (priorityNum === 2) {
    priority = TaskPriority.HIGH;
  } else if (priorityNum === 3) {
    priority = TaskPriority.MEDIUM;
  } else if (priorityNum === 4) {
    priority = TaskPriority.LOW;
  } else {
    priority = TaskPriority.MEDIUM;
  }

  // 从工时信息表格提取数据
  const effortTable = $("#legendEffort table.table-data");

  // 获取最初预计工时
  const estimateText = effortTable.find("th:contains('最初预计')").next("td").text().trim();
  const estimate = estimateText.replace(/工时$/, "").trim();

  // 获取总计消耗工时
  const consumedText = effortTable.find("th:contains('总计消耗')").next("td").text().trim();
  const consumed = consumedText.replace(/工时$/, "").trim();

  // 获取预计剩余工时
  const leftText = effortTable.find("th:contains('预计剩余')").next("td").text().trim();
  const left = leftText.replace(/工时$/, "").trim();

  // 获取截止日期
  const deadline = effortTable.find("th:contains('截止日期')").next("td").text().trim();

  // 获取预计开始时间
  const estimatedStart = effortTable.find("th:contains('预计开始')").next("td").text().trim();

  // 获取实际开始时间
  const actualStart = effortTable.find("th:contains('实际开始')").next("td").text().trim();

  return {
    id: taskId,
    title,
    status: status as TaskStatus,
    project,
    assignedTo,
    deadline,
    priority,
    estimate,
    consumed,
    left,
    estimatedStart,
    actualStart,
  };
}

export async function fetchTasksFromZentao(): Promise<Task[]> {
  return withAutoRetry(async () => {
    const preferences = getPreferenceValues<Preferences>();
    const { zentaoUrl, zentaoSid, username } = preferences;

    const url = `${zentaoUrl}/my-work-task-assignedTo-0-id_desc-19-100-1.html`;
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        Connection: "keep-alive",
        Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      },
    });

    logger.debug("Response status:", response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    logger.debug("HTML content length:", html.length);

    // 检查会话是否已过期
    if (isSessionExpired(html)) {
      logger.info("Session expired detected");
      throw new SessionExpiredError();
    }

    logger.saveApiResponse("my-task.html", html, "HTML saved to");

    const parsedTasks = parseTasksFromHtml(html);
    return parsedTasks;
  });
}

/** 完成任务所需的参数接口 */
export interface FinishTaskParams {
  /** 任务ID */
  taskId: Task["id"];
  /** 当前消耗的工时 */
  currentConsumed: string;
  /** 总消耗的工时 */
  consumed: string;
  /** 任务指派给谁 */
  assignedTo: string;
  /** 实际开始时间，格式：YYYY-MM-DD HH:mm */
  realStarted: string;
  /** 完成时间，格式：YYYY-MM-DD HH:mm */
  finishedDate: string;
  /** 任务状态，完成任务时应该使用 "done" */
  status: "wait" | "doing" | "done" | "pause" | "cancel" | "closed";
  /** 表单的唯一标识符，用于提交表单 */
  uid: string;
  /** 可选的备注信息 */
  comment?: string;
}

/**
 * 完成指定的任务
 *
 * @param params - 完成任务所需的参数
 */
export async function finishTask(params: FinishTaskParams): Promise<boolean> {
  const preferences = getPreferenceValues<Preferences>();
  const { zentaoUrl, zentaoSid, username } = preferences;

  // 构建完成任务的 URL
  const url = `${zentaoUrl}/task-finish-${params.taskId}.html?onlybody=yes`;
  logger.debug("taskService.ts:286 ~ finishTask ~ url:", url);

  // 使用 FormData 构建请求体
  const formData = new FormData();
  formData.append("currentConsumed", params.currentConsumed);
  formData.append("consumed", params.consumed);
  formData.append("assignedTo", params.assignedTo);
  formData.append("realStarted", params.realStarted);
  formData.append("finishedDate", params.finishedDate);
  formData.append("status", params.status);
  formData.append("comment", params.comment || "");
  formData.append("uid", params.uid);
  logger.debug("taskService.ts:300 ~ finishTask ~ formData:", formData);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        "Cache-Control": "max-age=0",
        Connection: "keep-alive",
        // FormData 会自动设置 Content-Type，包括 boundary
        Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
        Origin: zentaoUrl,
        Referer: url,
        "Upgrade-Insecure-Requests": "1",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      },
      body: formData,
    });

    logger.debug("Finish task response status:", response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseText = await response.text();
    logger.debug("Finish task response:", responseText);

    // 将响应内容保存到日志文件以便检查
    logger.saveApiResponse("task-finish-response.log", responseText, "Finish task response saved to");

    // 检查响应中是否包含错误信息
    const alertMatch = responseText.match(/alert\('([^']+)'\)/);
    if (alertMatch) {
      const errorMessage = alertMatch[1];
      logger.error("Task finish failed with error:", errorMessage);
      throw new Error(`任务完成失败: ${errorMessage}`);
    }

    // 检查响应是否表示成功
    // 成功的响应包含关闭模态框并重新加载页面的 JavaScript 代码
    const isSuccess = responseText.includes("parent.parent.location.reload()");

    if (!isSuccess) {
      // 如果没有明确的成功标识，也没有错误消息，抛出通用错误
      throw new Error("任务完成失败: 未知错误，请检查日志文件");
    }

    return true;
  } catch (error) {
    logger.error("Error finishing task:", error instanceof Error ? error : String(error));
    throw error;
  }
}
