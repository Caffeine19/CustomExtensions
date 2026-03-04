import { Color, Icon } from "@raycast/api";

import { BugType } from "../types/bug";
import { TAILWIND_COLORS } from "./colors";

/** Bug类型标签映射 */
export const BUG_TYPE_LABELS = {
  [BugType.CODE_ERROR]: "代码错误",
  [BugType.CONFIG]: "配置相关",
  [BugType.INSTALL]: "安装部署",
  [BugType.SECURITY]: "安全相关",
  [BugType.PERFORMANCE]: "性能问题",
  [BugType.STANDARD]: "标准规范",
  [BugType.TEST_SCRIPT]: "测试脚本",
  [BugType.UI_DEFECT]: "UI缺陷",
  [BugType.REQUIREMENT]: "需求",
  [BugType.OTHERS]: "其他",
} as const;

/** 根据Bug类型获取显示标签 */
export function getBugTypeLabel(bugType: BugType): string {
  return BUG_TYPE_LABELS[bugType] || "未知类型";
}

/** Bug类型颜色映射 */
export const BUG_TYPE_COLORS = {
  [BugType.CODE_ERROR]: TAILWIND_COLORS.blue[400], // 代码错误 - 蓝色
  [BugType.CONFIG]: TAILWIND_COLORS.amber[400], // 配置相关 - 琥珀色
  [BugType.INSTALL]: TAILWIND_COLORS.amber[400], // 安装部署 - 琥珀色
  [BugType.SECURITY]: TAILWIND_COLORS.red[400], // 安全相关 - 深红色
  [BugType.PERFORMANCE]: TAILWIND_COLORS.amber[400], // 性能问题 - 亮琥珀色
  [BugType.STANDARD]: TAILWIND_COLORS.blue[400], // 标准规范 - 蓝色
  [BugType.TEST_SCRIPT]: TAILWIND_COLORS.blue[400], // 测试脚本 - 深蓝色
  [BugType.UI_DEFECT]: TAILWIND_COLORS.red[400], // UI缺陷 - 亮红色
  [BugType.REQUIREMENT]: TAILWIND_COLORS.emerald[400], // 需求 - 翡翠绿
  [BugType.OTHERS]: TAILWIND_COLORS.gray[400], // 其他 - 灰色
} as const;

/** 根据Bug类型获取颜色 */
export function getBugTypeColor(bugType: BugType): string {
  return BUG_TYPE_COLORS[bugType] || TAILWIND_COLORS.gray[500];
}

/** Bug类型图标映射 */
export const BUG_TYPE_ICONS = {
  [BugType.CODE_ERROR]: Icon.Code,
  [BugType.CONFIG]: Icon.Gear,
  [BugType.INSTALL]: Icon.Download,
  [BugType.SECURITY]: Icon.Shield,
  [BugType.PERFORMANCE]: Icon.Gauge,
  [BugType.STANDARD]: Icon.Document,
  [BugType.TEST_SCRIPT]: Icon.Terminal,
  [BugType.UI_DEFECT]: Icon.Monitor,
  [BugType.REQUIREMENT]: Icon.BulletPoints,
  [BugType.OTHERS]: Icon.QuestionMark,
} as const;

/** Bug类型图标颜色映射 */
export const BUG_TYPE_ICON_COLORS = {
  [BugType.CODE_ERROR]: Color.Red,
  [BugType.CONFIG]: Color.Orange,
  [BugType.INSTALL]: Color.Yellow,
  [BugType.SECURITY]: Color.Red,
  [BugType.PERFORMANCE]: Color.Yellow,
  [BugType.STANDARD]: Color.Blue,
  [BugType.TEST_SCRIPT]: Color.Blue,
  [BugType.UI_DEFECT]: Color.Red,
  [BugType.REQUIREMENT]: Color.Green,
  [BugType.OTHERS]: Color.SecondaryText,
} as const;

/** 根据Bug类型获取图标 */
export function getBugTypeIcon(bugType: BugType): Icon {
  return BUG_TYPE_ICONS[bugType] || Icon.Circle;
}

/** 根据Bug类型获取图标颜色 */
export function getBugTypeIconColor(bugType: BugType): Color {
  return BUG_TYPE_ICON_COLORS[bugType] || Color.SecondaryText;
}

/** 根据Bug类型获取完整的图标配置（包含图标和颜色） */
export function getBugTypeIconConfig(bugType: BugType): { source: Icon; tintColor: Color } {
  return {
    source: getBugTypeIcon(bugType),
    tintColor: getBugTypeIconColor(bugType),
  };
}
