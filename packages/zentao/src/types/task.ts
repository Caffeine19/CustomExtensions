import { TaskPriority } from "../constants/priority";
import { TaskStatus } from "../constants/status";

/** 禅道 任务 对象 */
export interface Task {
  /** 任务 ID */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务状态 */
  status: TaskStatus;
  /** 所属项目 */
  project: string;
  /** 指派给 */
  assignedTo: string;
  /** 截止日期 */
  deadline: string;
  /** 优先级 */
  priority: TaskPriority;
  /** 预计工时 */
  estimate: string;
  /** 消耗工时 */
  consumed: string;
  /** 剩余工时 */
  left: string;
  /** 预计开始时间 */
  estimatedStart: string;
  /** 实际开始时间 */
  actualStart: string;
}
