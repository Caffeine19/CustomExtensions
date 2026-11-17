import { Color, Icon } from "@raycast/api";

import { ChatStatus } from "../types/sessions/session";

/** Presentation config for a chat session's status badge. */
export const STATUS_CONFIG: Record<ChatStatus, { label: string; icon: Icon; color: Color }> = {
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
  archived: {
    label: "Archived",
    icon: Icon.Tray,
    color: Color.Blue,
  },
};
