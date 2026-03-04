import {
  ActionPanel,
  Action,
  Icon,
  List,
  Image,
  closeMainWindow,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { useSpaceStore } from "./stores/space-store";
import { DEFAULT_WINDOW_ICON } from "./constants/icon";

interface WindowItemProps {
  window: {
    id: string;
    title: string;
    application: string;
    isMinimized: boolean;
    isFullscreen: boolean;
  };
  appIcon?: string;
  onFocus: (windowId: string) => void;
}

function WindowItem({ window, appIcon, onFocus }: WindowItemProps) {
  const getIcon = (): Image.ImageLike => {
    if (appIcon) {
      return { fileIcon: appIcon };
    }
    return DEFAULT_WINDOW_ICON;
  };

  const getAccessories = () => {
    const accessories: List.Item.Accessory[] = [];
    if (window.isFullscreen) {
      accessories.push({ icon: Icon.Maximize, tooltip: "Fullscreen" });
    }
    if (window.isMinimized) {
      accessories.push({ icon: Icon.Minus, tooltip: "Minimized" });
    }
    // Show application name on the right side
    accessories.push({ text: window.application });
    return accessories;
  };

  return (
    <List.Item
      icon={getIcon()}
      title={window.title}
      accessories={getAccessories()}
      id={window.id}
      actions={
        <ActionPanel>
          <Action
            title="Focus Window"
            icon={Icon.Eye}
            onAction={() => onFocus(window.id)}
          />
          <Action.CopyToClipboard
            title="Copy Window Title"
            content={window.title}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action.CopyToClipboard
            title="Copy Window ID"
            content={window.id}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const {
    allWindows,
    isLoadingAllWindows,
    appIcons,
    fetchAllWindows,
    focusWindow,
  } = useSpaceStore();
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    fetchAllWindows();
  }, []);

  const handleFocus = async (windowId: string) => {
    await closeMainWindow();
    await focusWindow(windowId);
  };

  const filteredWindows = allWindows
    .filter(
      (window) =>
        window.title.toLowerCase().includes(searchText.toLowerCase()) ||
        window.application.toLowerCase().includes(searchText.toLowerCase()),
    )
    .sort((a, b) => a.application.localeCompare(b.application));

  return (
    <List
      isLoading={isLoadingAllWindows}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search windows by title or application..."
      throttle
    >
      {filteredWindows.map((window) => (
        <WindowItem
          key={window.id}
          window={window}
          appIcon={appIcons[window.application]}
          onFocus={handleFocus}
        />
      ))}
    </List>
  );
}
