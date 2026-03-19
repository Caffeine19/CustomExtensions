import { Action, ActionPanel, getPreferenceValues, Icon } from "@raycast/api";

import { SortActions } from "@/components/actions/SortActions";
import { BugDetail } from "@/components/BugDetail";
import { SessionRefreshAction } from "@/components/SessionRefreshAction";
import { useT } from "@/hooks/useT";
import { BugListItem } from "@/types/bug";
import { SortOrder } from "@/types/sortOrder";

interface BugItemActionsProps {
  bug: BugListItem;
  isPinned: boolean;
  onTogglePin: (bugId: string) => void;
  onSortOrderChange: (order: SortOrder) => void;
  onRefreshSession: () => Promise<void>;
}

export function BugItemActions({
  bug,
  isPinned,
  onTogglePin,
  onSortOrderChange,
  onRefreshSession,
}: BugItemActionsProps) {
  const preferences = getPreferenceValues<Preferences>();
  const { t } = useT();

  return (
    <ActionPanel>
      <Action.Push title={t("bugActions.viewBugDetails")} icon={Icon.Eye} target={<BugDetail bug={bug} />} />

      <Action.OpenInBrowser
        title={t("bugActions.openInZentao")}
        url={`${preferences.zentaoUrl}/bug-view-${bug.id}.html`}
      />

      <Action
        title={isPinned ? t("bugActions.unpinBug") : t("bugActions.pinBug")}
        onAction={() => onTogglePin(bug.id)}
        icon={isPinned ? Icon.PinDisabled : Icon.Pin}
        shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
      />

      <Action.CopyToClipboard
        title={t("bugActions.copyBugId")}
        content={bug.id}
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
      />

      <Action.CopyToClipboard
        title={t("bugActions.copyBugUrl")}
        content={`${preferences.zentaoUrl}/bug-view-${bug.id}.html`}
        icon={Icon.Link}
        shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
      />

      <SessionRefreshAction onRefreshSuccess={onRefreshSession} />

      <SortActions onSortOrderChange={onSortOrderChange} showSeverity showName />
    </ActionPanel>
  );
}
