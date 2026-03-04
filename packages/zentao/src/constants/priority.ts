import { Icon } from "@raycast/api";

import { TAILWIND_COLORS } from "./colors";

/** 任务优先级枚举 注意：数字越小，优先级越高（1是最高优先级） */
export enum TaskPriority {
  /** 最高优先级 - 紧急重要 */
  CRITICAL = "1",
  /** 高优先级 - 重要 */
  HIGH = "2",
  /** 中等优先级 - 一般 */
  MEDIUM = "3",
  /** 低优先级 - 不紧急 */
  LOW = "4",
}

/** 优先级显示标签映射 */
export const PRIORITY_LABELS = {
  [TaskPriority.CRITICAL]: "紧急",
  [TaskPriority.HIGH]: "重要",
  [TaskPriority.MEDIUM]: "一般",
  [TaskPriority.LOW]: "低优先级",
} as const;

/** 根据优先级获取显示标签 */
export function getPriorityLabel(priority: TaskPriority): string {
  return PRIORITY_LABELS[priority] || "未知优先级";
}

/** 优先级颜色映射 */
export const PRIORITY_COLORS = {
  [TaskPriority.CRITICAL]: TAILWIND_COLORS.red[400], // 紧急 - 深红色
  [TaskPriority.HIGH]: TAILWIND_COLORS.amber[300], // 重要 - 红色
  [TaskPriority.MEDIUM]: TAILWIND_COLORS.blue[300], // 一般 - 琥珀色
  [TaskPriority.LOW]: TAILWIND_COLORS.emerald[400], // 低优先级 - 翡翠绿
} as const;

/** 根据优先级获取颜色 */
export function getPriorityColor(priority: TaskPriority): string {
  return PRIORITY_COLORS[priority] || TAILWIND_COLORS.gray[500];
}

/** 优先级图标映射 */
export const PRIORITY_ICONS = {
  [TaskPriority.CRITICAL]: Icon.StackedBars4, // 紧急 - 4层堆叠条
  [TaskPriority.HIGH]: Icon.StackedBars3, // 重要 - 3层堆叠条
  [TaskPriority.MEDIUM]: Icon.StackedBars2, // 一般 - 2层堆叠条
  [TaskPriority.LOW]: Icon.StackedBars1, // 低优先级 - 1层堆叠条
} as const;

/** 根据优先级获取图标 */
export function getPriorityIcon(priority: TaskPriority): Icon {
  return PRIORITY_ICONS[priority] || Icon.StackedBars1;
}
