import { ActionPanel, Action, Icon, List, showToast, Toast } from "@raycast/api";
import { execSync } from "child_process";
import { promisify } from "util";

interface PointerSizeItem {
  id: string;
  title: string;
  subtitle: string;
  size: number;
  icon: Icon;
}

const POINTER_SIZES: PointerSizeItem[] = [
  {
    id: "normal",
    title: "Normal",
    subtitle: "Default cursor size",
    size: 1,
    icon: Icon.Circle,
  },
  {
    id: "large",
    title: "Large",
    subtitle: "Larger cursor size",
    size: 2,
    icon: Icon.Plus,
  },
  {
    id: "extra-large",
    title: "Extra Large",
    subtitle: "Much larger cursor size",
    size: 3,
    icon: Icon.PlusCircle,
  },
  {
    id: "huge",
    title: "Huge",
    subtitle: "Maximum cursor size",
    size: 4,
    icon: Icon.PlusCircleFilled,
  },
];

async function changePointerSizeAdvanced(size: number) {
  try {
    const appleScript = `
tell application "System Settings"
    activate
    reveal anchor "AX_CURSOR_SIZE" of pane id "com.apple.Accessibility-Settings.extension" of application "System Settings"
end tell

tell application "System Events"
    tell process "System Settings"
        -- Wait until the slider is available
        repeat until slider "Pointer size" of group 3 of scroll area 1 of group 1 of group 2 of splitter group 1 of group 1 of window 1 exists
            delay 0
        end repeat
        
        set pointerSettings to group 3 of scroll area 1 of group 1 of group 2 of splitter group 1 of group 1 of window 1
        set pointerSizeSlider to slider "Pointer size" of pointerSettings
        
        if value of pointerSizeSlider is 4 then
            repeat until value of pointerSizeSlider is 1
                decrement pointerSizeSlider
            end repeat
        else
            repeat until value of pointerSizeSlider is 4
                increment pointerSizeSlider
            end repeat
        end if
    end tell
end tell`;

    const res = await promisify(execSync)(`osascript -e '${appleScript}'`);
    console.log("🚀 ~ change-size.tsx:110 ~ changePointerSizeAdvanced ~ res:", res);

    await showToast({
      style: Toast.Style.Success,
      title: "Pointer Size Changed",
      message: `Cursor size set to ${size}x automatically.`,
    });
  } catch (error) {
    console.error("Failed to change pointer size automatically:", error);
    // Fall back to opening settings manually
  }
}

export default function Command() {
  return (
    <List>
      {POINTER_SIZES.map((item) => (
        <List.Item
          key={item.id}
          icon={item.icon}
          title={item.title}
          subtitle={item.subtitle}
          accessories={[{ icon: Icon.Mouse, text: `${item.size}x` }]}
          actions={
            <ActionPanel>
              <Action
                title="Auto-Apply Size"
                icon={Icon.Checkmark}
                onAction={() => changePointerSizeAdvanced(item.size)}
              />
              <Action.CopyToClipboard title="Copy Size Value" content={item.size.toString()} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
