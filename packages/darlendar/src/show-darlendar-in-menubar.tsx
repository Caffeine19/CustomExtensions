import {
  Clipboard,
  Color,
  Icon,
  MenuBarExtra,
  getPreferenceValues,
  openCommandPreferences,
  showHUD,
} from "@raycast/api";
import dayjs from "dayjs";

import {
  DEFAULT_FORMAT,
  formatDay,
  getCurrentWeekDays,
  relativeLabel,
  weekdayLabel,
} from "./utils/dates";

export default function Command() {
  const { format, listFormat } = getPreferenceValues();
  const menuBarDateFormat = format || DEFAULT_FORMAT;
  const listDateFormat = listFormat || DEFAULT_FORMAT;
  const dateText = formatDay(dayjs(), menuBarDateFormat);

  const weekDays = getCurrentWeekDays();

  const copyDay = async (day: dayjs.Dayjs) => {
    const formatted = formatDay(day, listDateFormat);
    await Clipboard.copy(formatted);
    await showHUD(`Copied ${formatted}`);
  };

  return (
    <MenuBarExtra
      icon={{
        source: "calendar-dots-fill-v7.svg",
        tintColor: Color.PrimaryText,
      }}
      title={dateText}
    >
      <MenuBarExtra.Section title="This Week">
        {weekDays.map((day) => {
          const isToday = day.isSame(dayjs(), "day");

          return (
            <MenuBarExtra.Item
              key={day.format("YYYY-MM-DD")}
              title={formatDay(day, listDateFormat)}
              subtitle={`${weekdayLabel(day)} · ${relativeLabel(day)}`}
              icon={
                isToday
                  ? { source: Icon.Star, tintColor: Color.Red }
                  : { source: Icon.Minus, tintColor: Color.SecondaryText }
              }
              onAction={() => copyDay(day)}
            />
          );
        })}
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Configure Command"
          icon={Icon.Gear}
          shortcut={{ modifiers: ["cmd"], key: "," }}
          onAction={openCommandPreferences}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
