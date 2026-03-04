import Fuse from "fuse.js";
import PinyinMatch from "pinyin-match";

import { BugListItem } from "../types/bug";
import { Task } from "../types/task";

/**
 * 搜索任务，支持模糊搜索和拼音搜索
 *
 * @param tasks 任务列表
 * @param query 搜索关键词
 * @returns 匹配的任务列表
 */
export function searchTasks(tasks: Task[], query: string): Task[] {
  if (!query.trim() || tasks.length === 0) {
    return tasks;
  }

  // 创建 Fuse 搜索
  const fuse = new Fuse(tasks, {
    threshold: 0.4, // 模糊匹配阈值
    keys: ["title", "project", "assignedTo", "status"], // 搜索字段
  });

  // 模糊搜索结果
  const fuseResults = fuse.search(query).map((result) => result.item);

  // 拼音搜索结果
  const pinyinResults = tasks.filter((task) => {
    const fields = [task.title, task.project, task.assignedTo || "", task.status];
    return fields.some((field) => {
      try {
        return field && PinyinMatch.match(field, query) !== false;
      } catch {
        return false;
      }
    });
  });

  // 合并去重
  const allResults = [...fuseResults, ...pinyinResults];
  const uniqueResults = allResults.filter((task, index, arr) => arr.findIndex((t) => t.id === task.id) === index);

  return uniqueResults;
}

/**
 * 搜索Bug，支持模糊搜索和拼音搜索
 *
 * @param bugs Bug列表
 * @param query 搜索关键词
 * @returns 匹配的Bug列表
 */
export function searchBugs(bugs: BugListItem[], query: string): BugListItem[] {
  if (!query.trim() || bugs.length === 0) {
    return bugs;
  }

  // 创建 Fuse 搜索
  const fuse = new Fuse(bugs, {
    threshold: 0.4, // 模糊匹配阈值
    keys: ["title", "product", "assignedTo", "status", "openedBy"], // 搜索字段
  });

  // 模糊搜索结果
  const fuseResults = fuse.search(query).map((result) => result.item);

  // 拼音搜索结果
  const pinyinResults = bugs.filter((bug) => {
    const fields = [bug.title, bug.product, bug.assignedTo || "", bug.status, bug.openedBy || ""];
    return fields.some((field) => {
      try {
        return field && PinyinMatch.match(field, query) !== false;
      } catch {
        return false;
      }
    });
  });

  // 合并去重
  const allResults = [...fuseResults, ...pinyinResults];
  const uniqueResults = allResults.filter((bug, index, arr) => arr.findIndex((b) => b.id === bug.id) === index);

  return uniqueResults;
}
