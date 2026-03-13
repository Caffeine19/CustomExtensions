import { getPreferenceValues } from "@raycast/api";
import * as cheerio from "cheerio";
import { Effect } from "effect";

import { TaskPriority } from "../constants/priority";
import { BugDetail, BugListItem, BugResolution, BugSeverity, BugStatus, BugType } from "../types/bug";
import { HtmlParseError, HttpError, SessionExpiredError } from "./error";
import { processImages } from "./imageProcessor";
import { logger } from "./logger";
import { isSessionExpired } from "./loginService";

/** Bug 列表表格的列类型 */
type BugColumnType =
  | "id"
  | "title"
  | "severity"
  | "pri"
  | "type"
  | "product"
  | "openedBy"
  | "confirm"
  | "deadline"
  | "resolvedBy"
  | "resolution"
  | "actions";

/** 列 class 名称到列类型的映射 */
const COLUMN_CLASS_MAP: Record<string, BugColumnType> = {
  "c-id": "id",
  "c-severity": "severity",
  "c-pri": "pri",
  "c-type": "type",
  "c-product": "product",
  "c-user": "openedBy", // 注意：可能有多个 c-user 列（创建者、解决者）
  "c-confirm": "confirm",
  "c-date": "deadline",
  "c-resolution": "resolution",
  "c-actions": "actions",
};

/** 从表头构建列索引映射 因为禅道系统允许用户自定义列的顺序和显示，需要动态解析表头 */
function buildColumnIndexMap($: cheerio.CheerioAPI, tableSelector: string): Map<string, number> {
  const columnMap = new Map<string, number>();
  const $headers = $(tableSelector).find("thead th");

  // 用于跟踪 c-user 列的出现次数（第一个是创建者，第二个是解决者）
  let userColumnCount = 0;

  $headers.each((index, header) => {
    const $header = $(header);
    const className = $header.attr("class") || "";

    // 检查每个已知的列 class
    for (const [classKey, columnType] of Object.entries(COLUMN_CLASS_MAP)) {
      if (className.includes(classKey)) {
        // 特殊处理 c-user 列，区分创建者和解决者
        if (classKey === "c-user") {
          if (userColumnCount === 0) {
            columnMap.set("openedBy", index);
          } else {
            columnMap.set("resolvedBy", index);
          }
          userColumnCount++;
        }
        // 特殊处理 c-actions 列（可能有多种形式如 c-actions-5）
        else if (classKey === "c-actions" || className.includes("c-actions")) {
          columnMap.set("actions", index);
        } else {
          columnMap.set(columnType, index);
        }
        break;
      }
    }

    // 标题列没有特定 class，通常是第二列且包含 Bug标题 链接
    // 检查表头文本来识别
    const headerText = $header.text().trim();
    if (headerText.includes("Bug标题") || headerText.includes("标题")) {
      columnMap.set("title", index);
    }
  });

  logger.debug("bugService.ts ~ buildColumnIndexMap ~ columnMap:", Object.fromEntries(columnMap));
  return columnMap;
}

/** 从 HTML 页面解析Bug信息 */
export const parseBugsFromHtml = (html: string): Effect.Effect<BugListItem[], HtmlParseError> =>
  Effect.try({
    try: () => {
      const bugs: BugListItem[] = [];
      const $ = cheerio.load(html);

      // 查找Bug表格
      const $table = $("#bugList");
      if ($table.length === 0) {
        logger.warn("Bug table not found");
        return bugs;
      }

      // 从表头构建列索引映射
      const columnMap = buildColumnIndexMap($, "#bugList");

      // 查找Bug表格行
      const $bugRows = $table.find("tbody tr");
      logger.debug(`Found ${$bugRows.length} bug rows`);

      // 遍历每一行提取Bug信息
      $bugRows.each((_index, row) => {
        const $row = $(row);

        // 提取Bug ID
        const bugId = $row.find("input[name='bugIDList[]']").val() as string;

        if (!bugId) return; // 跳过没有ID的行

        // 获取所有 td 单元格
        const $cells = $row.find("td");

        // 辅助函数：根据列名获取单元格
        const getCell = (columnName: string) => {
          const idx = columnMap.get(columnName);
          return idx !== undefined ? $cells.eq(idx) : null;
        };

        // 提取Bug标题
        const titleCell = getCell("title");
        const title = titleCell?.find("a").text().trim() || "";
        logger.debug("bugService.ts ~ parseBugsFromHtml ~ title:", title);

        // 提取严重程度
        const severityCell = getCell("severity");
        const severityElement = severityCell?.find(".label-severity");
        const severityDataValue = severityElement?.attr("data-severity");
        let severity: BugSeverity;
        if (severityDataValue === "1") {
          severity = BugSeverity.MINOR;
        } else if (severityDataValue === "2") {
          severity = BugSeverity.NORMAL;
        } else if (severityDataValue === "3") {
          severity = BugSeverity.MAJOR;
        } else if (severityDataValue === "4") {
          severity = BugSeverity.CRITICAL;
        } else {
          severity = BugSeverity.NORMAL; // Default fallback
        }

        // 提取优先级
        const priCell = getCell("pri");
        const priorityElement = priCell?.find(".label-pri");
        const priorityTitle = priorityElement?.attr("title");
        let priority: TaskPriority;
        const priorityNum = parseInt(priorityTitle || "3");
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

        // 提取Bug类型
        const typeCell = getCell("type");
        const typeText = typeCell?.attr("title") || typeCell?.text().trim() || "";
        let bugType: BugType;
        switch (typeText) {
          case "代码错误":
            bugType = BugType.CODE_ERROR;
            break;
          case "配置相关":
            bugType = BugType.CONFIG;
            break;
          case "安装部署":
            bugType = BugType.INSTALL;
            break;
          case "安全相关":
            bugType = BugType.SECURITY;
            break;
          case "性能问题":
            bugType = BugType.PERFORMANCE;
            break;
          case "标准规范":
            bugType = BugType.STANDARD;
            break;
          case "测试脚本":
            bugType = BugType.TEST_SCRIPT;
            break;
          case "UI缺陷":
            bugType = BugType.UI_DEFECT;
            break;
          case "需求":
            bugType = BugType.REQUIREMENT;
            break;
          default:
            bugType = BugType.OTHERS;
        }

        // 提取所属产品
        const productCell = getCell("product");
        const product = productCell?.find("a").text().trim() || productCell?.text().trim() || "";

        // 提取创建者
        const openedByCell = getCell("openedBy");
        const openedBy = openedByCell?.text().trim() || "";

        // 提取确认状态
        const confirmCell = getCell("confirm");
        const confirmText = confirmCell?.text().trim() || "";
        const confirmed = !confirmText.includes("未确认");

        // 提取截止日期
        const deadlineCell = getCell("deadline");
        const deadline = deadlineCell?.text().trim() || "";

        // 提取解决者
        const resolvedByCell = getCell("resolvedBy");
        const resolvedBy = resolvedByCell?.text().trim() || "";

        // 提取解决方案
        const resolutionCell = getCell("resolution");
        const resolutionText = resolutionCell?.text().trim() || "";
        let resolution: BugResolution | "" = "";
        switch (resolutionText) {
          case "已解决":
            resolution = BugResolution.FIXED;
            break;
          case "不予解决":
            resolution = BugResolution.WONTFIX;
            break;
          case "外部原因":
            resolution = BugResolution.EXTERNAL;
            break;
          case "重复Bug":
            resolution = BugResolution.DUPLICATE;
            break;
          case "无法重现":
            resolution = BugResolution.NOTREPRO;
            break;
          case "延期处理":
            resolution = BugResolution.POSTPONED;
            break;
          case "设计如此":
            resolution = BugResolution.BYDESIGN;
            break;
          case "无需修复":
            resolution = BugResolution.WILLNOTFIX;
            break;
          case "转为需求":
            resolution = BugResolution.TOSTORY;
            break;
          default:
            resolution = "";
        }

        // 默认状态为激活，实际应根据HTML内容确定
        let status: BugStatus = BugStatus.ACTIVE;
        if (resolution) {
          status = BugStatus.RESOLVED;
        }

        bugs.push({
          id: bugId,
          title: title,
          status: status,
          severity: severity,
          priority: priority,
          type: bugType,
          product: product,
          openedBy: openedBy,
          assignedTo: openedBy, // 在Bug列表页面，指派给可能需要从其他地方获取
          confirmed: confirmed,
          deadline: deadline,
          resolvedBy: resolvedBy,
          resolution: resolution,
        });
      });

      logger.info(`Parsed ${bugs.length} bugs from HTML`);
      logger.debug("bugService.ts ~ parseBugsFromHtml ~ bugs:", bugs);

      return bugs;
    },
    catch: (e) => new HtmlParseError({ message: "解析Bug列表HTML失败", cause: e }),
  });

/**
 * 从Bug详情页面 HTML 解析Bug信息
 *
 * @param html - Bug详情页面的 HTML 内容
 * @param bugId - Bug ID
 */
export const parseBugDetailFromHtml = (html: string, bugId: string): Effect.Effect<BugDetail, HtmlParseError> =>
  Effect.gen(function* () {
    const preferences = getPreferenceValues<Preferences>();
    const { zentaoUrl } = preferences;

    // 同步解析部分包在 Effect.try 中
    const parsed = yield* Effect.try({
      try: () => {
        const $ = cheerio.load(html);

        // 从页面标题提取Bug标题
        const fullTitle = $("title").text();
        const titleMatch = fullTitle.match(/BUG#\d+\s+(.+?)\s+\/\s+/);
        const title = titleMatch ? titleMatch[1].trim() : $(".page-title .text").text().trim();

        // 从基本信息表格提取数据
        const basicTable = $("#legendBasicInfo table.table-data");

        // 获取所属产品
        const product = basicTable.find("th:contains('所属产品')").next("td").text().trim();

        // 获取所属模块
        const module = basicTable.find("th:contains('所属模块')").next("td").text().trim();

        // 获取Bug类型
        const typeText = basicTable.find("th:contains('Bug类型')").next("td").text().trim();
        let bugType: BugType;
        switch (typeText) {
          case "代码错误":
            bugType = BugType.CODE_ERROR;
            break;
          case "配置相关":
            bugType = BugType.CONFIG;
            break;
          case "安装部署":
            bugType = BugType.INSTALL;
            break;
          case "安全相关":
            bugType = BugType.SECURITY;
            break;
          case "性能问题":
            bugType = BugType.PERFORMANCE;
            break;
          case "标准规范":
            bugType = BugType.STANDARD;
            break;
          case "测试脚本":
            bugType = BugType.TEST_SCRIPT;
            break;
          case "UI缺陷":
            bugType = BugType.UI_DEFECT;
            break;
          case "需求":
            bugType = BugType.REQUIREMENT;
            break;
          default:
            bugType = BugType.OTHERS;
        }

        // 获取严重程度
        const severityElement = basicTable.find("th:contains('严重程度')").next("td").find(".label-severity");
        const severityDataValue = severityElement.attr("data-severity");
        let severity: BugSeverity;
        if (severityDataValue === "1") {
          severity = BugSeverity.MINOR;
        } else if (severityDataValue === "2") {
          severity = BugSeverity.NORMAL;
        } else if (severityDataValue === "3") {
          severity = BugSeverity.MAJOR;
        } else if (severityDataValue === "4") {
          severity = BugSeverity.CRITICAL;
        } else {
          severity = BugSeverity.NORMAL;
        }

        // 获取优先级
        const priorityElement = basicTable.find("th:contains('优先级')").next("td").find(".label-pri");
        const priorityTitle = priorityElement.attr("title");
        let priority: TaskPriority;
        const priorityNum = parseInt(priorityTitle || "3");
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

        // 获取Bug状态
        const statusText = basicTable.find("th:contains('Bug状态')").next("td").text().trim();
        let status: BugStatus;
        if (statusText.includes("激活")) {
          status = BugStatus.ACTIVE;
        } else if (statusText.includes("已解决")) {
          status = BugStatus.RESOLVED;
        } else if (statusText.includes("已关闭")) {
          status = BugStatus.CLOSED;
        } else {
          status = BugStatus.ACTIVE;
        }

        // 获取当前指派信息
        const assignedInfoText = basicTable.find("th:contains('当前指派')").next("td").text().trim();
        const assignedMatch = assignedInfoText.split(" ");
        const assignedTo = assignedMatch.length > 0 ? assignedMatch[0] : "";

        // 获取确认状态
        const confirmText = basicTable.find("th:contains('是否确认')").next("td").text().trim();
        const confirmed = !confirmText.includes("未确认");

        // 获取创建者
        const openedBy = basicTable.find("th:contains('由谁创建')").next("td").text().trim();

        // 获取截止日期
        const deadline = basicTable.find("th:contains('截止日期')").next("td").text().trim();

        // 获取解决者
        const resolvedBy = basicTable.find("th:contains('解决者')").next("td").text().trim();

        // 获取激活次数
        const activatedCountText = basicTable.find("th:contains('激活次数')").next("td").text().trim();
        const activatedCount = parseInt(activatedCountText) || 0;

        // 获取激活日期
        const activatedDate = basicTable.find("th:contains('激活日期')").next("td").text().trim();

        // 获取来源用例
        const fromCase = basicTable.find("th:contains('来源用例')").next("td").text().trim();

        // 获取所属计划
        const plan = basicTable.find("th:contains('所属计划')").next("td").text().trim();

        // 获取反馈者
        const feedbackBy = basicTable.find("th:contains('反馈者')").next("td").text().trim();

        // 获取通知邮箱
        const notifyEmail = basicTable.find("th:contains('通知邮箱')").next("td").text().trim();

        // 获取操作系统
        const os = basicTable.find("th:contains('操作系统')").next("td").find(".osContent").text().trim();

        // 获取浏览器
        const browser = basicTable.find("th:contains('浏览器')").next("td").find(".browserContent").text().trim();

        // 获取关键词
        const keywords = basicTable.find("th:contains('关键词')").next("td").text().trim();

        // 获取抄送给
        const mailto = basicTable.find("th:contains('抄送给')").next("td").text().trim();

        const stepsContainer = $(".detail-content.article-content");

        // 解析结构化重现步骤
        let steps = "";
        let stepsImages: string[] = [];
        let result = "";
        let resultImages: string[] = [];
        let expected = "";
        let expectedImages: string[] = [];

        // 检查是否有结构化的stepTitle
        const hasStructuredSteps = stepsContainer.find(".stepTitle").length > 0;

        if (hasStructuredSteps) {
          // 处理结构化的重现步骤（有stepTitle）
          let currentSection = "";
          let currentText = "";
          let currentImages: string[] = [];

          stepsContainer.children().each((_index, element) => {
            const $el = $(element);
            const text = $el.text().trim();

            if ($el.hasClass("stepTitle")) {
              // 保存上一个section的内容
              if (currentSection) {
                if (currentSection.includes("步骤")) {
                  steps = currentText.trim();
                  stepsImages = [...currentImages];
                } else if (currentSection.includes("结果")) {
                  result = currentText.trim();
                  resultImages = [...currentImages];
                } else if (currentSection.includes("期望")) {
                  expected = currentText.trim();
                  expectedImages = [...currentImages];
                }
              }

              // 开始新的section
              currentSection = text;
              currentText = "";
              currentImages = [];
            } else if ($el.is("p") && !$el.hasClass("stepTitle") && text) {
              // 普通文本段落
              currentText += (currentText ? "\n" : "") + text;

              // 检查段落内是否有图片
              $el.find("img").each((_imgIndex, img) => {
                const src = $(img).attr("src");
                if (src) {
                  const imageUrl = src.startsWith("/") ? `${zentaoUrl}${src}` : src;
                  currentImages.push(imageUrl);
                }
              });
            } else if ($el.is("img")) {
              // 直接的图片元素
              const src = $el.attr("src");
              if (src) {
                const imageUrl = src.startsWith("/") ? `${zentaoUrl}${src}` : src;
                currentImages.push(imageUrl);
              }
            }
          });

          // 保存最后一个section的内容
          if (currentSection) {
            if (currentSection.includes("步骤")) {
              steps = currentText.trim();
              stepsImages = [...currentImages];
            } else if (currentSection.includes("结果")) {
              result = currentText.trim();
              resultImages = [...currentImages];
            } else if (currentSection.includes("期望")) {
              expected = currentText.trim();
              expectedImages = [...currentImages];
            }
          }
        } else {
          // 处理简单的重现步骤（无stepTitle，所有内容作为步骤）
          const textParts: string[] = [];
          const images: string[] = [];

          stepsContainer.children().each((_index, element) => {
            const $el = $(element);
            const text = $el.text().trim();

            if ($el.is("p") && text && text !== "") {
              // 提取段落文本（排除只有<br/>的段落）
              textParts.push(text);
            }

            // 查找段落内的图片
            $el.find("img").each((_imgIndex, img) => {
              const src = $(img).attr("src");
              if (src) {
                const imageUrl = src.startsWith("/") ? `${zentaoUrl}${src}` : src;
                images.push(imageUrl);
              }
            });

            // 直接的图片元素
            if ($el.is("img")) {
              const src = $el.attr("src");
              if (src) {
                const imageUrl = src.startsWith("/") ? `${zentaoUrl}${src}` : src;
                images.push(imageUrl);
              }
            }
          });

          steps = textParts.join("\n");
          stepsImages = images;
        }

        return {
          bugId,
          title,
          status,
          severity,
          priority,
          type: bugType,
          product,
          module,
          fromCase,
          plan,
          openedBy,
          assignedTo,
          confirmed,
          deadline,
          resolvedBy,
          resolution: "" as BugResolution | "",
          activatedCount,
          activatedDate,
          assignedInfo: assignedInfoText,
          feedbackBy,
          notifyEmail,
          os,
          browser,
          keywords,
          mailto,
          createdDate: "",
          lastEditedDate: "",
          steps,
          stepsImages,
          result,
          resultImages,
          expected,
          expectedImages,
        };
      },
      catch: (e) => new HtmlParseError({ message: "解析Bug详情HTML失败", cause: e }),
    });

    // 异步处理图片（Effect，永不失败）
    const processedStepsImages = yield* processImages(parsed.stepsImages);
    const processedResultImages = yield* processImages(parsed.resultImages);
    const processedExpectedImages = yield* processImages(parsed.expectedImages);

    return {
      ...parsed,
      id: parsed.bugId,
      stepsImages: processedStepsImages,
      resultImages: processedResultImages,
      expectedImages: processedExpectedImages,
    };
  });

/** 从禅道系统获取Bug列表 */
export const fetchBugsFromZentao = (): Effect.Effect<BugListItem[], SessionExpiredError | HttpError | HtmlParseError> =>
  Effect.gen(function* () {
    const preferences = getPreferenceValues<Preferences>();
    const { zentaoUrl, zentaoSid, username } = preferences;

    const url = `${zentaoUrl}/my-work-bug-assignedTo-0-id_desc-41-100-1.html`;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
            Connection: "keep-alive",
            Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          },
        }),
      catch: (e) => new HttpError({ status: 0, message: String(e) }),
    });

    logger.debug("Bug response status:", response.status);

    if (!response.ok) {
      return yield* Effect.fail(
        new HttpError({ status: response.status, message: `HTTP error! status: ${response.status}` }),
      );
    }

    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (e) => new HttpError({ status: 0, message: String(e) }),
    });

    logger.debug("Bug HTML content length:", html.length);

    if (isSessionExpired(html)) {
      logger.info("Session expired detected while fetching bugs");
      return yield* Effect.fail(new SessionExpiredError({ message: "登录会话已过期，请重新登录" }));
    }

    logger.saveApiResponse("my-bug.html", html, "Bug HTML saved to");

    return yield* parseBugsFromHtml(html);
  });

/**
 * 从禅道系统获取Bug详情
 *
 * @param bugId - Bug ID
 */
export const fetchBugDetail = (
  bugId: string,
): Effect.Effect<BugDetail, SessionExpiredError | HttpError | HtmlParseError> =>
  Effect.gen(function* () {
    const preferences = getPreferenceValues<Preferences>();
    const { zentaoUrl, zentaoSid, username } = preferences;

    const url = `${zentaoUrl}/bug-view-${bugId}.html`;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
            Connection: "keep-alive",
            Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          },
        }),
      catch: (e) => new HttpError({ status: 0, message: String(e) }),
    });

    logger.debug("Bug detail response status:", response.status);

    if (!response.ok) {
      return yield* Effect.fail(
        new HttpError({ status: response.status, message: `HTTP error! status: ${response.status}` }),
      );
    }

    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (e) => new HttpError({ status: 0, message: String(e) }),
    });

    logger.debug("Bug detail HTML content length:", html.length);

    if (isSessionExpired(html)) {
      logger.info("Session expired detected while fetching bug detail");
      return yield* Effect.fail(new SessionExpiredError({ message: "登录会话已过期，请重新登录" }));
    }

    logger.saveApiResponse(`bug-detail-${bugId}.html`, html, "Bug detail HTML saved to");

    const parsedBugDetail = yield* parseBugDetailFromHtml(html, bugId);
    console.log("🚀 ~ bugService.ts ~ fetchBugDetail ~ parsedBugDetail:", parsedBugDetail);
    return parsedBugDetail;
  });
