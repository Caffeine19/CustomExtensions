import dayjs from "dayjs";

/**
 * Smart email date formatting:
 * - Today → `HH:mm` (e.g., `13:44`)
 * - This year → `D MMM` (e.g., `6 Jun`, `28 May`)
 * - Older → `YY-MM-DD` (e.g., `25-06-11`)
 */
export const formatEmailDate = (date: string): string => {
  const d = dayjs(date);
  if (!d.isValid()) return date;
  if (d.isSame(dayjs(), "day")) return d.format("HH:mm");
  if (d.isSame(dayjs(), "year")) return d.format("D MMM");
  return d.format("YY-MM-DD");
};
