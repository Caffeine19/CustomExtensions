import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useEffect, useMemo } from "react";

import { SyncImport, SyncTab, SyncWorkspace } from "./types/sync-workspace";
import { hexMap } from "./types/workspace-color";
import { launchWorkspaceByGuid } from "./utils/launch-workspace";
import { clearSyncImport, loadSyncImport } from "./utils/sync-cache";

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
    >
      {data.workspaces.map((workspace) => {
        const tabs = tabsByWorkspace.get(workspace.guid) ?? [];
        return (
          <List.Item
            key={workspace.guid}
            icon={{ source: Icon.Map, tintColor: hexMap[workspace.color] }}
            title={workspace.title}
            subtitle={`${tabs.length} tab${tabs.length === 1 ? "" : "s"}${
              workspace.creationSource ? ` • ${workspace.creationSource}` : ""
            }`}
            accessories={[{ tag: { value: `${tabs.length}`, color: Color.SecondaryText } }]}
            actions={
              <ActionPanel>
                <Action
                  icon={Icon.Compass}
                  title="Launch Workspace"
                  onAction={() => launchWorkspaceByGuid(workspace.guid)}
                />
                <Action.Push
                  title="View Tabs"
                  icon={Icon.List}
                  target={<WorkspaceTabs workspace={workspace} tabs={tabs} />}
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

function WorkspaceTabs({ workspace, tabs }: { workspace: SyncWorkspace; tabs: SyncTab[] }) {
  return (
    <List navigationTitle={workspace.title} searchBarPlaceholder={`Search tabs in ${workspace.title}…`}>
      {tabs.length === 0 ? (
        <List.EmptyView icon={Icon.Tray} title="No tabs" />
      ) : (
        tabs.map((tab) => (
          <List.Item
            key={tab.guid}
            icon={tab.faviconUrl ? { source: tab.faviconUrl, fallback: Icon.Globe } : Icon.Globe}
            title={tab.title}
            subtitle={tab.url}
            actions={
              <ActionPanel>
                {tab.url ? <Action.OpenInBrowser url={tab.url} /> : null}
                {tab.url ? <Action.CopyToClipboard title="Copy URL" content={tab.url} /> : null}
                <Action
                  icon={Icon.Compass}
                  title="Launch Parent Workspace"
                  onAction={() => launchWorkspaceByGuid(workspace.guid)}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
