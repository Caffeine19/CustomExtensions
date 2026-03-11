/** 缓存键常量 用于 useCachedState 等缓存机制 */
export const CACHE_KEYS = {
  /** 选中的产品（Bug列表筛选） */
  SELECTED_PRODUCT: "selected-product",
  /** 选中的项目（任务列表筛选） */
  SELECTED_PROJECT: "selected-project",
  /** Bug列表缓存 */
  BUGS: "bugs",
  /** 任务列表缓存 */
  TASKS: "tasks",
  /** 置顶的任务ID列表 */
  PINNED_TASKS: "pinned-tasks",
  /** 置顶的BugID列表 */
  PINNED_BUGS: "pinned-bugs",
} as const;
