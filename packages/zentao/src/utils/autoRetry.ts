import { showToast, Toast } from "@raycast/api";

import i18n from "../i18n";
import { SessionExpiredError } from "./error";
import { logger } from "./logger";
import { reLoginUser } from "./loginService";

/** 自动重试包装器选项 */
interface AutoRetryOptions {
  /** 最大重试次数（默认为1） */
  maxRetries?: number;
  /** 是否显示刷新会话的提示（默认为true） */
  showToast?: boolean;
}

/**
 * 包装异步函数，在会话过期时自动刷新会话并重试
 *
 * @example
 *   ```typescript
 *   const tasks = await withAutoRetry(async () => {
 *     return await fetchTasksFromZentao();
 *   });
 *   ```;
 *
 * @param fn - 要执行的异步函数
 * @param options - 重试选项
 * @returns 包装后的函数返回值
 */
export async function withAutoRetry<T>(fn: () => Promise<T>, options: AutoRetryOptions = {}): Promise<T> {
  const { maxRetries = 1, showToast: shouldShowToast = true } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // 如果不是会话过期错误，或已经是最后一次尝试，直接抛出
      if (!(error instanceof SessionExpiredError) || attempt >= maxRetries) {
        throw error;
      }

      lastError = error;
      logger.info(`会话已过期（尝试 ${attempt + 1}/${maxRetries + 1}），正在自动刷新会话...`);

      try {
        // 显示会话刷新提示
        if (shouldShowToast) {
          await showToast({
            style: Toast.Style.Animated,
            title: i18n.t("sessionRefresh.autoRefreshingSession"),
            message: i18n.t("sessionRefresh.pleaseWait"),
          });
        }

        // 尝试刷新会话
        await reLoginUser();

        logger.info("会话刷新成功，将重试操作");

        // 显示成功提示
        if (shouldShowToast) {
          await showToast({
            style: Toast.Style.Success,
            title: i18n.t("sessionRefresh.autoRefreshSuccess"),
            message: i18n.t("sessionRefresh.retryingOperation"),
          });
        }

        // 继续下一次循环，重试原操作
      } catch (refreshError) {
        logger.error("自动刷新会话失败:", refreshError instanceof Error ? refreshError : String(refreshError));

        // 显示错误提示
        if (shouldShowToast) {
          await showToast({
            style: Toast.Style.Failure,
            title: i18n.t("sessionRefresh.autoRefreshFailed"),
            message: refreshError instanceof Error ? refreshError.message : i18n.t("errors.unknownError"),
          });
        }

        // 抛出刷新错误
        throw refreshError;
      }
    }
  }

  // 理论上不会到达这里，但为了类型安全
  throw lastError || new Error("未知错误");
}
