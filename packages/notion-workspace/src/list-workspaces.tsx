import { ActionPanel, Action, Icon, List, closeMainWindow, showHUD } from "@raycast/api";
import { createDeeplink } from "@raycast/utils";
import { callHammerspoon } from "./utils/call-hammerspoon";
import { useEffect } from "react";

// Convert Raycast-style modifier names to Hammerspoon modifier names
function convertModifier(modifier: string): string {
  const modifierMap: Record<string, string> = {
    control: "ctrl",
    shift: "shift",
    command: "cmd",
    cmd: "cmd",
    option: "alt",
    alt: "alt",
    fn: "fn",
  };
  return modifierMap[modifier] || modifier;
}

// Convert keys array to Hammerspoon keystroke command
function createKeystrokeCommand(keys: string[]): string {
  if (keys.length === 0) return "";

  // Last element is the key, rest are modifiers
  const modifiers = keys.slice(0, -1).map(convertModifier);
  const key = keys[keys.length - 1];

  // Create the Lua command for Hammerspoon
  const modifiersArray = modifiers.map((mod) => `"${mod}"`).join(", ");
  return `hs.eventtap.keyStroke({${modifiersArray}}, "${key}")`;
}

// Handle workspace switching
async function switchToWorkspace(item: (typeof ITEMS)[0]) {
  closeMainWindow();
  setTimeout(async () => {
    try {
      const luaCommand = createKeystrokeCommand(item.keys);
      if (luaCommand) {
        await callHammerspoon(luaCommand);
      }
    } catch (error) {
      console.error("Failed to switch workspace:", error);
    }
  }, 200);
}

const ITEMS = [
  {
    id: 1,
    icon: Icon.Person,
    title: "Personal",
    subtitle: "Subtitle",
    keys: ["control", "shift", "1"],
    tintColor: "#f87171",
    quicklink: {
      name: "Switch to Notion Personal Workspace",
      link: createDeeplink({
        command: "list-workspaces",
        context: { workspaceId: "1" },
      }),
    },
  },

  {
    id: 2,
    icon: Icon.Building,
    title: "Work",
    subtitle: "Subtitle",
    keys: ["control", "shift", "2"],
    tintColor: "#3b82f6",
    quicklink: {
      name: "Switch to Notion Work Workspace",
      link: createDeeplink({
        command: "list-workspaces",
        context: { workspaceId: "2" },
      }),
    },
  },
];

interface Context {
  workspaceId?: string;
}

export default function Command({ launchContext }: { launchContext?: Context }) {
  // Handle QuickLink launch context
  useEffect(() => {
    if (launchContext?.workspaceId) {
      const workspaceId = launchContext.workspaceId;
      const item = ITEMS.find((item) => item.id.toString() === workspaceId);
      if (item) {
        switchToWorkspace(item);

        closeMainWindow({ clearRootSearch: true });
        // popToRoot();
        showHUD(`Workspace switched to ${item.title}`);
      }
    }
  }, [launchContext?.workspaceId]);

  return (
    <List>
      {ITEMS.map((item) => (
        <List.Item
          key={item.id}
          icon={{ source: item.icon, tintColor: item.tintColor }}
          title={item.title}
          subtitle={item.subtitle}
          actions={
            <ActionPanel>
              <Action title="Switch to Workspace" icon={Icon.Desktop} onAction={() => switchToWorkspace(item)} />
              <Action.CreateQuicklink quicklink={item.quicklink} title="Create Quicklink" icon={Icon.Link} />
              <Action.CopyToClipboard content={item.title} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
