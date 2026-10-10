import {
  ActionPanel,
  Action,
  Icon,
  List,
  Image,
  Color,
  closeMainWindow,
  useNavigation,
  showToast,
  Toast,
  popToRoot,
} from "@raycast/api";
import { useCachedPromise, useCachedState } from "@raycast/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSpaceStore } from "./stores/space-store";
import { DEFAULT_WINDOW_ICON } from "./constants/icon";
import { group, tryit, unique } from "radash";
import {
  moveWindowToSpace,
  getAllWindows,
  focusWindow as focusWindowFn,
} from "./utils/space";
import { Space, Window as AppWindow } from "./types/space";

const ALL_APPS_VALUE = "__all__";

/**
 * Window list sort mode: "focus" = most recently focused first (MRU),
 * "app" = alphabetical by application name.
 */
type SortMode = "focus" | "app";

/** Props for a single window row in the Switch Windows list */
interface WindowItemProps {
  window: AppWindow;
  appIcon?: string;
  onFocus: (windowId: string) => void;
  sortMode: SortMode;
  onToggleSort: () => void;
}

function MoveToSpaceList({
  windowId,
  windowTitle,
  windowSpaceId,
}: {
  windowId: string;
  windowTitle: string;
  windowSpaceId?: string;
}) {
  const { spaces, isLoading, fetchSpaces } = useSpaceStore();
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    if (spaces.length === 0) {
      fetchSpaces();
    }
  }, []);

  const handleMove = async (spaceId: string, spaceName: string) => {
    await closeMainWindow();
    const [err] = await tryit(moveWindowToSpace)(windowId, spaceId);
    if (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed: ${err.message}`,
      });
      return;
    }
    await showToast({
      style: Toast.Style.Success,
      title: `Moved "${windowTitle}" to ${spaceName}`,
    });
    popToRoot();
  };

  const spacesByScreen = group(spaces, (space) => space.screenName);

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Move "${windowTitle}" to\u2026`}
      searchBarPlaceholder="Search spaces..."
    >
      {Object.entries(spacesByScreen).map(([screenName, spacesInScreen]) => (
        <List.Section key={screenName} title={screenName}>
          {spacesInScreen?.map((space: Space) => (
            <List.Item
              key={space.id}
              id={space.id}
              icon={{
                source: Icon.Window,
                tintColor: space.id === windowSpaceId ? Color.Green : undefined,
              }}
              title={space.name || `Space ${space.id}`}
              accessories={[
                space.id === windowSpaceId
                  ? {
                      icon: {
                        source: Icon.Pin,
                        tintColor: Color.Green,
                      },
                    }
                  : {},
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Move Window Here"
                    icon={Icon.ArrowRight}
                    onAction={() => handleMove(space.id, space.name)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

function WindowItem({
  window,
  appIcon,
  onFocus,
  sortMode,
  onToggleSort,
}: WindowItemProps) {
  const { push } = useNavigation();

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
          <Action
            title="Move to Space"
            icon={Icon.ArrowRight}
            onAction={() =>
              push(
                <MoveToSpaceList
                  windowId={window.id}
                  windowTitle={window.title}
                  windowSpaceId={window.spaceId}
                />,
              )
            }
          />
          <Action
            title={
              sortMode === "focus"
                ? "Sort by Application Name"
                : "Sort by Focus Order"
            }
            icon={sortMode === "focus" ? Icon.Lowercase : Icon.Clock}
            onAction={onToggleSort}
          />
          {/* <Action.CopyToClipboard
            title="Copy Window Title"
            content={window.title}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action.CopyToClipboard
            title="Copy Window ID"
            content={window.id}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          /> */}
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const {
    data: allWindows = [],
    isLoading,
    error,
  } = useCachedPromise(
    async (): Promise<AppWindow[]> => {
      return getAllWindows();
    },
    [],
    {
      keepPreviousData: true,
    },
  );

  const appIcons = useMemo(() => {
    const icons: Record<string, string> = {};
    for (const window of allWindows) {
      if (!icons[window.application] && window.appPath) {
        icons[window.application] = window.appPath;
      }
    }
    return icons;
  }, [allWindows]);

  const [searchText, setSearchText] = useState("");
  const [selectedApp, setSelectedApp] = useState(ALL_APPS_VALUE);
  const [sortMode, setSortMode] = useCachedState<SortMode>(
    "window-sort-mode",
    "focus",
  );

  const handleToggleSort = () => {
    setSortMode((mode) => (mode === "focus" ? "app" : "focus"));
  };

  if (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to load windows",
      message: String(error),
    });
  }

  const handleFocus = async (windowId: string) => {
    await closeMainWindow();
    await focusWindowFn(windowId);
  };

  // Raycast's own window is focused while this list is open, so it would
  // always top the MRU order — exclude it entirely (same as switch-spaces.tsx)
  const visibleWindows = allWindows.filter((w) => w.application !== "Raycast");

  const uniqueApps = unique(visibleWindows.map((w) => w.application)).sort();

  const matchedWindows = visibleWindows.filter(
    (window) =>
      (selectedApp === ALL_APPS_VALUE || window.application === selectedApp) &&
      (window.title.toLowerCase().includes(searchText.toLowerCase()) ||
        window.application.toLowerCase().includes(searchText.toLowerCase())),
  );

  // "focus" keeps Hammerspoon's MRU order untouched; "app" sorts alphabetically
  const filteredWindows =
    sortMode === "app"
      ? [...matchedWindows].sort((a, b) =>
          a.application.localeCompare(b.application),
        )
      : matchedWindows;

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search windows by title or application..."
      throttle
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by Application"
          storeValue
          onChange={setSelectedApp}
        >
          <List.Dropdown.Item title="All Apps" value={ALL_APPS_VALUE} />
          <List.Dropdown.Section title="Applications">
            {uniqueApps.map((app) => (
              <List.Dropdown.Item key={app} title={app} value={app} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {filteredWindows.map((window) => (
        <WindowItem
          key={window.id}
          window={window}
          appIcon={appIcons[window.application]}
          onFocus={handleFocus}
          sortMode={sortMode}
          onToggleSort={handleToggleSort}
        />
      ))}
    </List>
  );
}
