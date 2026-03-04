/** 团队成员信息 */
export interface TeamMember {
  /** 成员的唯一标识值，用于表单提交 */
  value: string;
  /** 成员的显示名称 */
  label: string;
  /** 成员的完整标题或描述信息 */
  title: string;
  /** 是否为当前选中的成员 */
  selected?: boolean;
}
