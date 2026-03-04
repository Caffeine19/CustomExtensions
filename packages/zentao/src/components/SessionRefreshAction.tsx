import { Action, Icon, showToast, Toast } from "@raycast/api";

import { useT } from "../hooks/useT";
import { logger } from "../utils/logger";
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
    try {
      showToast({
        style: Toast.Style.Animated,
        title: t("sessionRefresh.refreshingSession"),
        message: t("sessionRefresh.pleaseWait"),
      });

      await reLoginUser();

      showToast({
        style: Toast.Style.Success,
        title: t("sessionRefresh.sessionRefreshSuccess"),
        message: t("sessionRefresh.sessionRefreshSuccessDescription"),
      });

      // 刷新成功后执行回调
      onRefreshSuccess?.();
    } catch (error) {
      logger.error("Error during manual session refresh:", error instanceof Error ? error : String(error));
      showToast({
        style: Toast.Style.Failure,
        title: t("sessionRefresh.sessionRefreshFailed"),
        message: error instanceof Error ? error.message : t("errors.unknownError"),
      });
    }
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
