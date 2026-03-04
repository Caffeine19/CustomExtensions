import { Color, Icon } from "@raycast/api";

import { BugStatus } from "../types/bug";

/** Bug状态图标配置映射 */
export const BUG_STATUS_ICON_CONFIGS = {
  [BugStatus.ACTIVE]: { source: Icon.Bug, tintColor: Color.SecondaryText }, // 激活 - Bug图标
  [BugStatus.RESOLVED]: { source: Icon.CheckCircle, tintColor: Color.Green }, // 已解决 - 绿色对勾圆圈
  [BugStatus.CLOSED]: { source: Icon.XMarkCircle, tintColor: Color.SecondaryText }, // 已关闭 - X标记圆圈
} as const;

/** Bug状态标签映射 */
export const BUG_STATUS_LABELS = {
  [BugStatus.ACTIVE]: "激活",
  [BugStatus.RESOLVED]: "已解决",
  [BugStatus.CLOSED]: "已关闭",
} as const;

/** Bug状态颜色映射 */
export const BUG_STATUS_COLORS = {
  [BugStatus.ACTIVE]: Color.Blue, // 激活 - 蓝色
  [BugStatus.RESOLVED]: Color.Green, // 已解决 - 绿色
  [BugStatus.CLOSED]: Color.SecondaryText, // 已关闭 - 次要文本色
} as const;

/**
 * 获取Bug状态图标配置
 *
 * @param status Bug状态
 * @returns 图标配置对象
 */
export function getBugStatusIconConfig(status: BugStatus) {
  return BUG_STATUS_ICON_CONFIGS[status] || { source: Icon.Circle, tintColor: Color.SecondaryText };
}

/**
 * 获取Bug状态显示标签
 *
 * @param status Bug状态
 * @returns 状态标签
 */
export function getBugStatusLabel(status: BugStatus): string {
  return BUG_STATUS_LABELS[status] || "未知";
}

/**
 * 获取Bug状态颜色
 *
 * @param status Bug状态
 * @returns 颜色值
 */
export function getBugStatusColor(status: BugStatus): Color {
  return BUG_STATUS_COLORS[status] || Color.SecondaryText;
}
