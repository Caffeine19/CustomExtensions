import { Action, Icon, showToast, Toast } from "@raycast/api";
import { Effect } from "effect";

import { useT } from "../hooks/useT";
import { reLoginUser } from "../utils/loginService";

interface SessionRefreshActionProps {
  /** 刷新成功后的回调函数（可选） */
  onRefreshSuccess?: () => void;
}

/** 会话刷新操作组件 提供统一的会话刷新功能，包含完整的错误处理和用户反馈 */
export function SessionRefreshAction({ onRefreshSuccess }: SessionRefreshActionProps) {
  const { t } = useT();

  /** 处理会话刷新操作 */
  const handleRefreshSession = async () => {
    const program = reLoginUser().pipe(
      Effect.tap(() =>
        Effect.promise(() =>
          showToast({
            style: Toast.Style.Success,
            title: t("sessionRefresh.sessionRefreshSuccess"),
            message: t("sessionRefresh.sessionRefreshSuccessDescription"),
          }),
        ),
      ),
      Effect.tapError((e) =>
        Effect.promise(() =>
          showToast({
            style: Toast.Style.Failure,
            title: t("sessionRefresh.sessionRefreshFailed"),
            message: e.message,
          }),
        ),
      ),
      Effect.tap(() => Effect.promise(async () => onRefreshSuccess?.())),
      Effect.catchAll(() => Effect.void),
    );

    showToast({
      style: Toast.Style.Animated,
      title: t("sessionRefresh.refreshingSession"),
      message: t("sessionRefresh.pleaseWait"),
    });

    await Effect.runPromise(program);
  };

  return (
    <Action
      title={t("sessionRefresh.refreshSession")}
      onAction={handleRefreshSession}
      icon={Icon.Key}
      shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
    />
  );
}
