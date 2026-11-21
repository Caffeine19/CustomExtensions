import { Color, Icon } from "@raycast/api";

import { ChatStatus } from "../types/sessions/session";

/** Presentation config for a status or accessory badge. */
export interface BadgeConfig {
  label: string;
  icon: Icon;
  color: Color;
}

/** Presentation config for a chat session's status badge. */
export const STATUS_CONFIG: Record<ChatStatus, BadgeConfig> = {
  empty: {
    label: "Empty",
    icon: Icon.Circle,
    color: Color.SecondaryText,
  },
  "in-progress": {
    label: "Active",
    icon: Icon.CircleProgress,
    color: Color.Blue,
  },
  completed: {
    label: "Done",
    icon: Icon.CheckCircle,
    color: Color.Green,
  },
  failed: {
    label: "Fail",
    icon: Icon.ExclamationMark,
    color: Color.Red,
  },
  "needs-input": {
    label: "Waiting",
    icon: Icon.Info,
    color: Color.Yellow,
  },
  unread: {
    label: "Unread",
    icon: Icon.CircleProgress100,
    color: Color.Blue,
  },
  archived: {
    label: "Archived",
    icon: Icon.Tray,
    color: Color.Blue,
  },
};

/** Pending-edit badge — orthogonal to the status badge. */
export const PENDING_BADGE: BadgeConfig = {
  label: "Pending",
  icon: Icon.Pencil,
  color: Color.Orange,
};

/** Fork badge — orthogonal to the status badge. */
export const FORK_BADGE: BadgeConfig = {
  label: "Fork",
  icon: Icon.Duplicate,
  color: Color.SecondaryText,
};

/** Automation-origin badge — orthogonal to the status badge. */
export const AUTOMATION_BADGE: BadgeConfig = {
  label: "Auto",
  icon: Icon.Calendar,
  color: Color.Purple,
};
