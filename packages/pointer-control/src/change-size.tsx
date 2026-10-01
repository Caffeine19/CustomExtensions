import { ActionPanel, Action, Icon, List, showToast, Toast } from "@raycast/api";
import { exec } from "child_process";
import { promisify } from "util";

const promisifyExec = promisify(exec);

interface PointerSizeItem {
  id: string;
  title: string;
  subtitle: string;
  size: number;
}

const POINTER_SIZES: PointerSizeItem[] = [
  {
    id: "normal",
    title: "Normal",
    subtitle: "Default cursor size",
    size: 1,
  },
  {
    id: "medium",
    title: "Medium",
    subtitle: "Slightly larger cursor",
    size: 1.5,
  },
  {
    id: "large",
    title: "Large",
    subtitle: "Larger cursor size",
    size: 2,
  },
  {
    id: "extra-large",
    title: "Extra Large",
    subtitle: "Much larger cursor size",
    size: 3,
  },
  {
    id: "huge",
    title: "Huge",
    subtitle: "Maximum cursor size",
    size: 4,
  },
];

/**
 * Set the macOS cursor size via the universalaccess preference, then restart
 * `universalaccessd` so the change is reflected immediately on screen.
 *
 * @param size - Cursor scale factor between 1 and 4 (1 = default, 4 = maximum)
 */
async function setPointerSize(size: number) {
  try {
    // Writing the plist alone does not refresh the visible cursor;
    // restarting universalaccessd forces it to reload the new value.
    await promisifyExec(`defaults write com.apple.universalaccess mouseDriverCursorSize -float ${size}`);

    try {
      await promisifyExec("killall universalaccessd");
    } catch {
      // Daemon may not be running; the setting still applies when it next starts.
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Pointer Size Changed",
      message: `Cursor size set to ${size}x.`,
    });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to Change Pointer Size",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export default function Command() {
  return (
    <List>
      {POINTER_SIZES.map((item) => (
        <List.Item
          key={item.id}
          title={item.title}
          subtitle={item.subtitle}
          accessories={[{ text: `${item.size}x` }]}
          actions={
            <ActionPanel>
              <Action title="Set Cursor Size" icon={Icon.Checkmark} onAction={() => setPointerSize(item.size)} />
              <Action.CopyToClipboard title="Copy Size Value" content={item.size.toString()} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
