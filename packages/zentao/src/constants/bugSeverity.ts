import { Color, Icon } from "@raycast/api";

import { BugSeverity } from "../types/bug";

/** Bug严重程度图标映射 */
export const BUG_SEVERITY_ICONS = {
  [BugSeverity.CRITICAL]: Icon.CircleProgress100, // 关键 - 100%圆形进度
  [BugSeverity.MAJOR]: Icon.CircleProgress75, // 严重 - 75%圆形进度
  [BugSeverity.NORMAL]: Icon.CircleProgress50, // 一般 - 50%圆形进度
  [BugSeverity.MINOR]: Icon.CircleProgress25, // 轻微 - 25%圆形进度
} as const;

/** Bug严重程度颜色映射 */
export const BUG_SEVERITY_COLORS = {
  [BugSeverity.CRITICAL]: Color.Red, // 关键 - 红色
  [BugSeverity.MAJOR]: Color.Yellow, // 严重 - 橙色
  [BugSeverity.NORMAL]: Color.Blue, // 一般 - 蓝色
  [BugSeverity.MINOR]: Color.Green, // 轻微 - 绿色
} as const;

/** Bug严重程度标签映射 */
export const BUG_SEVERITY_LABELS = {
  [BugSeverity.CRITICAL]: "关键",
  [BugSeverity.MAJOR]: "严重",
  [BugSeverity.NORMAL]: "一般",
  [BugSeverity.MINOR]: "轻微",
} as const;

/**
 * 获取Bug严重程度图标
 *
 * @param severity Bug严重程度
 * @returns 图标
 */
export function getBugSeverityIcon(severity: BugSeverity): Icon {
  return BUG_SEVERITY_ICONS[severity] || Icon.CircleProgress25;
}

/**
 * 获取Bug严重程度颜色
 *
 * @param severity Bug严重程度
 * @returns 颜色值
 */
export function getBugSeverityColor(severity: BugSeverity): Color {
  return BUG_SEVERITY_COLORS[severity] || Color.SecondaryText;
}

/**
 * 获取Bug严重程度显示标签
 *
 * @param severity Bug严重程度
 * @returns 严重程度标签
 */
export function getBugSeverityLabel(severity: BugSeverity): string {
  return BUG_SEVERITY_LABELS[severity] || "未知";
}
