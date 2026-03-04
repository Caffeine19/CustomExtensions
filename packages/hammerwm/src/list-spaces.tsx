import { ActionPanel, List, Action, Icon, Color } from "@raycast/api";
import { useEffect, useRef } from "react";
import { Space, Window } from "./types/space";
import { DEFAULT_WINDOW_ICON } from "./constants/icon";
import { group } from "radash";
import { useSpaceStore } from "./stores/space-store";

/**
 * Window display component
 */
function WindowList({
  windows,
  appIcons,
}: {
  windows: Window[];
  appIcons: Record<string, string>;
}) {
  return (
    <>
      {windows.map((window: Window) => (
        <List.Item.Detail.Metadata.Label
          key={window.id}
          title={window.application}
          text={window.title || "Untitled"}
          icon={
            appIcons[window.application]
              ? { fileIcon: appIcons[window.application] }
              : DEFAULT_WINDOW_ICON
          }
        />
      ))}
    </>
  );
}

/**
 * Space detail metadata component
 */
function SpaceDetail({
  space,
  windows,
  isLoadingSpaceWindows,
  appIcons,
}: {
  space: Space;
  windows: Window[];
  isLoadingSpaceWindows: boolean;
  appIcons: Record<string, string>;
}) {
  return (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Name"
            text={space.name || `Space ${space.id}`}
          />
          {/* <List.Item.Detail.Metadata.Label title="ID" text={space.id} /> */}
          <List.Item.Detail.Metadata.Label
            title="Screen"
            text={space.screenName}
          />
          <List.Item.Detail.Metadata.Label
            title="Status"
            text={space.isCurrent ? "Current Active Space" : "Inactive Space"}
            icon={{
              source: space.isCurrent ? Icon.CheckCircle : Icon.Circle,
              tintColor: space.isCurrent ? Color.Green : undefined,
            }}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Windows"
            text={
              isLoadingSpaceWindows ? "Loading..." : `${windows.length} windows`
            }
          />
          <WindowList windows={windows} appIcons={appIcons} />
          {/* <List.Item.Detail.Metadata.Label title="• Remove Space" text="Press ⌘⌫ (if not current)" /> */}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

/**
 * Individual space item component
 */
function SpaceItem({ space }: { space: Space }) {
  const { spaceWindows, loadingWindows, appIcons, removeSpace, goToSpace } =
    useSpaceStore();

  const windows = (spaceWindows[space.id] || []).filter(
    (window) => window.application !== "Raycast",
  );
  const isLoadingSpaceWindows = loadingWindows[space.id] || false;

  return (
    <List.Item
      key={space.id}
      id={space.id}
      icon={{
        source: Icon.Window,
        tintColor: space.isCurrent ? Color.Green : undefined,
      }}
      title={space.name || `Space ${space.id}`}
      accessories={[
        {
          text: space.isCurrent ? "Current" : undefined,
          icon: space.isCurrent
            ? {
                source: Icon.CheckCircle,
                tintColor: Color.Green,
              }
            : undefined,
        },
      ]}
      detail={
        <SpaceDetail
          space={space}
          windows={windows}
          isLoadingSpaceWindows={isLoadingSpaceWindows}
          appIcons={appIcons}
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="Go to Space" onAction={() => goToSpace(space.id)} />
            <Action
              title="Remove Space"
              onAction={() => removeSpace(space.id)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const { spaces, isLoading, fetchSpaces, setSelectedSpaceId } =
    useSpaceStore();

  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) {
      return;
    }
    hasFetchedRef.current = true;
    fetchSpaces();
  }, []);

  const handleSelectionChange = (spaceId: string | null) => {
    // console.log("🚀 ~ list-spaces.tsx:47 ~ handleSelectionChange ~ spaceId:", spaceId);
    setSelectedSpaceId(spaceId);
  };

  // Group spaces by screen using radash.group
  const spacesByScreen = group(spaces, (space) => space.screenName);

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Spaces"
      searchBarPlaceholder="Search spaces..."
      isShowingDetail
      onSelectionChange={handleSelectionChange}
    >
      {Object.entries(spacesByScreen).map(([screenName, spacesInScreen]) => {
        return (
          <List.Section key={screenName} title={screenName}>
            {spacesInScreen?.map((space: Space) => (
              <SpaceItem key={space.id} space={space} />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}
