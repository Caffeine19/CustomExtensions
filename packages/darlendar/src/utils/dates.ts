import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/zh-cn";

dayjs.extend(isoWeek);

/** Fallback dayjs format used when the preference is empty or invalid */
export const DEFAULT_FORMAT = "YYYY/MM/DD";

/**
 * Formats a date with a dayjs format string
 *
 * @param date - the date to format
 * @param format - dayjs format string, e.g. YYYY/MM/DD
 * @returns the formatted date, falling back to DEFAULT_FORMAT when dayjs rejects the input
 */
export const formatDay = (date: dayjs.Dayjs, format: string): string => {
  try {
    return date.format(format);
  } catch {
    return date.format(DEFAULT_FORMAT);
  }
};

/**
 * Returns the seven days (Monday to Sunday) of the week containing today
 *
 * @returns 7 dayjs objects, Monday first
 */
export const getCurrentWeekDays = (): dayjs.Dayjs[] => {
  const start = dayjs().startOf("isoWeek");
  return Array.from({ length: 7 }, (_, i) => start.add(i, "day"));
};

/**
 * Short weekday label in Chinese, e.g. 周一
 *
 * @param date - the date to label
 * @returns the Chinese weekday label
 */
export const weekdayLabel = (date: dayjs.Dayjs): string =>
  date.locale("zh-cn").format("ddd");

/**
 * Relative label of a date compared to today
 *
 * @param date - the date to label
 * @returns "Today" / "Tomorrow" / "Yesterday" or "+N days" / "-N days"
 */
export const relativeLabel = (date: dayjs.Dayjs): string => {
  const diff = date.startOf("day").diff(dayjs().startOf("day"), "day");
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff > 0 ? `+${diff} days` : `${diff} days`;
};
