import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useEffect, useMemo } from "react";

import { SyncImport, SyncTab } from "./types/sync-workspace";
import { launchWorkspaceByGuid } from "./utils/launch-workspace";
import { clearSyncImport, loadSyncImport } from "./utils/sync-cache";

/** ARGB int → "#rrggbb" hex string */
function argbToHex(argb: number): string {
  return `#${(argb & 0xffffff).toString(16).padStart(6, "0")}`;
}

const groupTabs = (tabs: SyncTab[]): Map<string, SyncTab[]> => {
  const map = new Map<string, SyncTab[]>();
  for (const tab of tabs) {
    const arr = map.get(tab.parentGuid) ?? [];
    arr.push(tab);
    map.set(tab.parentGuid, arr);
  }
  return map;
};

export default function Command() {
  const [data, setData] = useCachedState<SyncImport | null>("sync-import-v1-state", null);

  useEffect(() => {
    setData(loadSyncImport());
  }, [setData]);

  const tabsByWorkspace = useMemo(() => groupTabs(data?.tabs ?? []), [data?.tabs]);

  type SortBy = "default" | "name";

  const [sortBy, setSortBy] = useCachedState<SortBy>("sync-import-sort", "default");

  const sortedWorkspaces = useMemo(() => {
    const list = [...(data?.workspaces ?? [])];
    if (sortBy === "name") list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [data?.workspaces, sortBy]);

  if (!data) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Download}
          title="No imported data"
          description='Run "Import Workspaces from Sync Dump" first.'
        />
      </List>
    );
  }

  const onClear = async () => {
    clearSyncImport();
    setData(null);
    await showToast({ style: Toast.Style.Success, title: "Cleared imported data" });
  };

  return (
    <List
      searchBarPlaceholder="Search workspaces…"
      navigationTitle={`Imported ${new Date(data.importedAt).toLocaleString()}`}
      searchBarAccessory={
        <List.Dropdown tooltip="Sort Order" storeValue onChange={(v) => setSortBy(v as SortBy)}>
          <List.Dropdown.Item title="Sort by Recent Opened" value="default" />
          <List.Dropdown.Item title="Sort by Name" value="name" />
        </List.Dropdown>
      }
    >
      {sortedWorkspaces.map((workspace) => {
        const tabs = tabsByWorkspace.get(workspace.guid) ?? [];
        return (
          <List.Item
            key={workspace.guid}
            icon={workspace.emoji ? undefined : { source: Icon.Map, tintColor: argbToHex(workspace.color) }}
            title={workspace.emoji ? ` ${workspace.emoji}   ${workspace.title}` : workspace.title}
            accessories={[
              {
                tag: { value: workspace.creationSource, color: Color.SecondaryText },
              },
              {
                tag: { value: `${tabs.length} Tabs`, color: Color.SecondaryText },
              },
            ]}
            actions={
              <ActionPanel>
                <Action
                  icon={Icon.Compass}
                  title="Launch Workspace"
                  onAction={() => launchWorkspaceByGuid(workspace.guid)}
                />
                <Action.CopyToClipboard title="Copy Workspace GUID" content={workspace.guid} />
                <Action
                  title="Clear Imported Data"
                  style={Action.Style.Destructive}
                  icon={Icon.Trash}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
                  onAction={onClear}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
