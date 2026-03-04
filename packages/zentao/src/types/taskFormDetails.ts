import { TeamMember } from "./teamMember";

/** 任务完成表单详情 */
export interface TaskFormDetails {
  /** 可选择的团队成员列表 */
  members: TeamMember[];
  /** 当前消耗的工时（小时） */
  currentConsumed: string;
  /** 总消耗的工时（小时） */
  totalConsumed: string;
  /** 当前指派的负责人 */
  assignedTo: string;
  /** 实际开始时间，格式：YYYY-MM-DD HH:mm */
  realStarted: string;
  /** 完成时间，格式：YYYY-MM-DD HH:mm */
  finishedDate: string;
  /** 表单的唯一标识符，用于提交表单 */
  uid: string;
}
