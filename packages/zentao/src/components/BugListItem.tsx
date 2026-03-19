import { List } from "@raycast/api";

import { BugItemActions } from "@/components/actions/BugItemActions";
import { getBugSeverityColor, getBugSeverityIcon, getBugSeverityLabel } from "@/constants/bugSeverity";
import { getBugStatusIconConfig } from "@/constants/bugStatus";
import { TAILWIND_COLORS } from "@/constants/colors";
import { getPriorityColor, getPriorityIcon, getPriorityLabel } from "@/constants/taskPriority";
import { BugListItem as BugListItemType } from "@/types/bug";
import { SortOrder } from "@/types/sortOrder";

interface BugListItemProps {
  bug: BugListItemType;
  selectedProduct: string;
  isOverdue: boolean | string;
  isPinned: boolean;

  onTogglePin: (bugId: string) => void;
  onSortOrderChange: (order: SortOrder) => void;
  onRefreshSession: () => Promise<void>;
}

export function BugListItem({
  bug,
  selectedProduct,
  isOverdue,
  isPinned,

  onTogglePin,
  onSortOrderChange,
  onRefreshSession,
}: BugListItemProps) {
  return (
    <List.Item
      icon={getBugStatusIconConfig(bug.status)}
      title={bug.title}
      subtitle={selectedProduct ? undefined : bug.product}
      accessories={[
        ...(bug.deadline
          ? [
              {
                tag: {
                  value: bug.deadline,
                  color: isOverdue ? TAILWIND_COLORS.red[400] : TAILWIND_COLORS.gray[200],
                },
              },
            ]
          : []),
        {
          icon: {
            source: getBugSeverityIcon(bug.severity),
            tintColor: getBugSeverityColor(bug.severity),
          },
          tooltip: getBugSeverityLabel(bug.severity),
        },
        {
          icon: {
            source: getPriorityIcon(bug.priority),
            tintColor: getPriorityColor(bug.priority),
          },
          tooltip: getPriorityLabel(bug.priority),
        },
      ]}
      actions={
        <BugItemActions
          bug={bug}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
          onSortOrderChange={onSortOrderChange}
          onRefreshSession={onRefreshSession}
        />
      }
    />
  );
}
