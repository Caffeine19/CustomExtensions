import { Color, Icon } from "@raycast/api";

import { TAILWIND_COLORS } from "./colors";

/** 任务状态枚举 */
export enum TaskStatus {
  /** 未开始 */
  WAIT = "未开始",
  /** 进行中 */
  DOING = "进行中",
  /** 已完成 */
  DONE = "已完成",
  /** 已暂停 */
  PAUSE = "已暂停",
  /** 已取消 */
  CANCEL = "已取消",
  /** 已关闭 */
  CLOSED = "已关闭",
}

/** 状态显示标签映射 */
export const STATUS_LABELS = {
  [TaskStatus.WAIT]: "未开始",
  [TaskStatus.DOING]: "进行中",
  [TaskStatus.DONE]: "已完成",
  [TaskStatus.PAUSE]: "已暂停",
  [TaskStatus.CANCEL]: "已取消",
  [TaskStatus.CLOSED]: "已关闭",
} as const;

/** 根据状态获取显示标签 */
export function getStatusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status] || "未知状态";
}

/** 任务状态颜色映射 */
export const STATUS_COLORS = {
  [TaskStatus.WAIT]: TAILWIND_COLORS.amber[500], // 未开始 - 琥珀色
  [TaskStatus.DOING]: TAILWIND_COLORS.blue[500], // 进行中 - 蓝色
  [TaskStatus.DONE]: TAILWIND_COLORS.emerald[500], // 已完成 - 翡翠绿
  [TaskStatus.PAUSE]: TAILWIND_COLORS.gray[500], // 已暂停 - 灰色
  [TaskStatus.CANCEL]: TAILWIND_COLORS.red[500], // 已取消 - 红色
  [TaskStatus.CLOSED]: TAILWIND_COLORS.gray[600], // 已关闭 - 深灰色
} as const;

/** 根据状态获取颜色 */
export function getStatusColor(status: TaskStatus): string {
  return STATUS_COLORS[status] || TAILWIND_COLORS.gray[500];
}

/** 任务状态图标映射 */
export const STATUS_ICONS = {
  [TaskStatus.WAIT]: Icon.Clock,
  [TaskStatus.DOING]: Icon.ArrowClockwise,
  [TaskStatus.DONE]: Icon.CheckCircle,
  [TaskStatus.PAUSE]: Icon.Pause,
  [TaskStatus.CANCEL]: Icon.XMarkCircle,
  [TaskStatus.CLOSED]: Icon.Lock,
} as const;

/** 任务状态图标颜色映射 */
export const STATUS_ICON_COLORS = {
  [TaskStatus.WAIT]: Color.SecondaryText,
  [TaskStatus.DOING]: Color.Blue,
  [TaskStatus.DONE]: Color.Green,
  [TaskStatus.PAUSE]: Color.SecondaryText,
  [TaskStatus.CANCEL]: Color.SecondaryText,
  [TaskStatus.CLOSED]: Color.SecondaryText,
} as const;

/** 根据状态获取图标 */
export function getStatusIcon(status: TaskStatus): Icon {
  return STATUS_ICONS[status] || Icon.Circle;
}

/** 根据状态获取图标颜色 */
export function getStatusIconColor(status: TaskStatus): Color {
  return STATUS_ICON_COLORS[status] || Color.SecondaryText;
}

/** 根据状态获取完整的图标配置（包含图标和颜色） */
export function getStatusIconConfig(status: TaskStatus): { source: Icon; tintColor: Color } {
  return {
    source: getStatusIcon(status),
    tintColor: getStatusIconColor(status),
  };
}
