import { Action, ActionPanel, Icon } from "@raycast/api";

import { useT } from "@/hooks/useT";
import { SortOrder } from "@/types/sortOrder";
interface SortActionsProps {
  onSortOrderChange: (order: SortOrder) => void;
  showSeverity?: boolean;
  showName?: boolean;
}

export function SortActions({ onSortOrderChange, showSeverity = false, showName = false }: SortActionsProps) {
  const { t } = useT();

  return (
    <>
      <ActionPanel.Section title={t("sortActions.sortByDate")}>
        <Action
          title={t("sortActions.sortByDateEarliestFirst")}
          onAction={() => onSortOrderChange("date-asc")}
          icon={Icon.ArrowUp}
        />
        <Action
          title={t("sortActions.sortByDateLatestFirst")}
          onAction={() => onSortOrderChange("date-desc")}
          icon={Icon.ArrowDown}
        />
      </ActionPanel.Section>

      <ActionPanel.Section title={t("sortActions.sortByPriority")}>
        <Action
          title={t("sortActions.sortByPriorityHighToLow")}
          onAction={() => onSortOrderChange("priority-asc")}
          icon={Icon.ArrowUp}
        />
        <Action
          title={t("sortActions.sortByPriorityLowToHigh")}
          onAction={() => onSortOrderChange("priority-desc")}
          icon={Icon.ArrowDown}
        />
      </ActionPanel.Section>

      {showSeverity && (
        <ActionPanel.Section title={t("sortActions.sortBySeverity")}>
          <Action
            title={t("sortActions.sortBySeverityHighToLow")}
            onAction={() => onSortOrderChange("severity-asc")}
            icon={Icon.ArrowUp}
          />
          <Action
            title={t("sortActions.sortBySeverityLowToHigh")}
            onAction={() => onSortOrderChange("severity-desc")}
            icon={Icon.ArrowDown}
          />
        </ActionPanel.Section>
      )}

      <ActionPanel.Section title={t("sortActions.sortByStatus")}>
        <Action
          title={t("sortActions.sortByStatusActiveFirst")}
          onAction={() => onSortOrderChange("status-asc")}
          icon={Icon.ArrowUp}
        />
        <Action
          title={t("sortActions.sortByStatusCompletedFirst")}
          onAction={() => onSortOrderChange("status-desc")}
          icon={Icon.ArrowDown}
        />
      </ActionPanel.Section>

      {showName && (
        <ActionPanel.Section title={t("sortActions.sortByName")}>
          <Action title={t("sortActions.sortByName")} onAction={() => onSortOrderChange("name")} icon={Icon.Text} />
        </ActionPanel.Section>
      )}

      <ActionPanel.Section title={t("sortActions.resetSort")}>
        <Action title={t("sortActions.resetSort")} onAction={() => onSortOrderChange("none")} icon={Icon.Minus} />
      </ActionPanel.Section>
    </>
  );
}
