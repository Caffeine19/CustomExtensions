import { showToast, Toast } from "@raycast/api";
import { Effect } from "effect";

import i18n from "../i18n";
import {
  HttpError,
  LoginFailedError,
  LoginResponseParseError,
  SessionExpiredError,
  SessionRefreshError,
} from "./error";
import { logger } from "./logger";
import { reLoginUser } from "./loginService";

/** 重新登录可能产生的错误类型 */
type ReloginErrors = LoginFailedError | LoginResponseParseError | SessionRefreshError | HttpError;

/** 自动重试包装器选项 */
interface AutoRetryOptions {
  /** 是否显示刷新会话的提示（默认为true） */
  showToast?: boolean;
}

/**
 * 包装 Effect，在会话过期时自动刷新会话并重试一次
 *
 * @example
 *   ```typescript
 *   const bugs = await Effect.runPromise(
 *     fetchBugsFromZentao().pipe(withAutoRetry),
 *   );
 *   ```;
 *
 * @param effect - 要执行的 Effect
 * @param options - 重试选项
 * @returns 包装后的 Effect（SessionExpiredError 被处理，可能新增重新登录相关错误）
 */
export const withAutoRetry =
  (options: AutoRetryOptions = {}) =>
  <A, E>(effect: Effect.Effect<A, E | SessionExpiredError>): Effect.Effect<A, E | ReloginErrors> => {
    const { showToast: shouldShowToast = true } = options;

    return effect.pipe(
      Effect.catchTag("SessionExpiredError", () =>
        Effect.gen(function* () {
          logger.info("会话已过期，正在自动刷新会话...");

          if (shouldShowToast) {
            yield* Effect.promise(() =>
              showToast({
                style: Toast.Style.Animated,
                title: i18n.t("sessionRefresh.autoRefreshingSession"),
                message: i18n.t("sessionRefresh.pleaseWait"),
              }),
            );
          }

          yield* reLoginUser().pipe(
            Effect.tapError((refreshError) =>
              Effect.sync(() => {
                logger.error("自动刷新会话失败:", refreshError.message);
                if (shouldShowToast) {
                  showToast({
                    style: Toast.Style.Failure,
                    title: i18n.t("sessionRefresh.autoRefreshFailed"),
                    message: refreshError.message,
                  });
                }
              }),
            ),
          );

          logger.info("会话刷新成功，将重试操作");

          if (shouldShowToast) {
            yield* Effect.promise(() =>
              showToast({
                style: Toast.Style.Success,
                title: i18n.t("sessionRefresh.autoRefreshSuccess"),
                message: i18n.t("sessionRefresh.retryingOperation"),
              }),
            );
          }

          // 重试一次原操作
          return yield* effect as Effect.Effect<A, E | ReloginErrors>;
        }),
      ),
    ) as Effect.Effect<A, E | ReloginErrors>;
  };
