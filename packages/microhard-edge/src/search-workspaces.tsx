import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import { EdgeProfile } from "./types/edge-profile";
import { Workspace } from "./types/workspace-cache";
import { hexMap, WorkspaceColor } from "./types/workspace-color";
import { launchWorkspaceByGuid } from "./utils/launch-workspace";
import { discoverEdgeProfiles } from "./utils/profile";
import { readAllWorkspaceCacheFiles } from "./utils/workspace";

export default function Command() {
  const [selectedProfile, setSelectedProfile] = useState<string>("all");

  const { data: profiles = [], isLoading: profilesLoading } = useCachedPromise(
    async (): Promise<EdgeProfile[]> => {
      return discoverEdgeProfiles();
    },
    [],
    {
      keepPreviousData: true,
    },
  );

  const { data: workspaceList = [], isLoading: workspacesLoading } = useCachedPromise(
    async (): Promise<Workspace[]> => {
      return readAllWorkspaceCacheFiles();
    },
    [],
    {
      keepPreviousData: true,
    },
  );

  const [isOpenWorkspaceLoading, setIsOpenWorkspaceLoading] = useState(false);

  const isLoading = profilesLoading || workspacesLoading || isOpenWorkspaceLoading;

  const onSelectWorkspace = async (workspace: Workspace) => {
    setIsOpenWorkspaceLoading(true);
    try {
      await launchWorkspaceByGuid(workspace.id, workspace.profilePath);
    } finally {
      setIsOpenWorkspaceLoading(false);
    }
  };

  const getIconColor = (workspaceColor: WorkspaceColor) => {
    return hexMap[workspaceColor] || hexMap[WorkspaceColor.Transparent];
  };

  const filteredWorkspaces =
    selectedProfile === "all" ? workspaceList : workspaceList.filter((w) => w.profilePath === selectedProfile);

  return (
    <List
      isLoading={isLoading}
      searchBarAccessory={
        <List.Dropdown tooltip="Select Profile" storeValue={true} defaultValue="all" onChange={setSelectedProfile}>
          <List.Dropdown.Item key="all" title="All Profiles" value="all" />
          {profiles.map((profile) => (
            <List.Dropdown.Item
              key={profile.path}
              title={`${profile.name} ${profile.hasWorkspaces ? "" : "(No Workspaces)"}`}
              value={profile.path}
            />
          ))}
        </List.Dropdown>
      }
    >
      {filteredWorkspaces.map((workspace) => (
        <List.Item
          key={`${workspace.profilePath}-${workspace.id}`}
          icon={{
            source: Icon.Map,
            tintColor: getIconColor(workspace.color),
          }}
          title={workspace.name}
          subtitle={`${workspace.count} tabs${workspace.profileName ? ` • ${workspace.profileName}` : ""}`}
          accessories={[
            ...(workspace.accent
              ? [
                  {
                    tag: {
                      value: "Opening",
                      color: "#10b981",
                    },
                    icon: Icon.ArrowNe,
                  },
                ]
              : []),
            ...(workspace.shared
              ? [
                  {
                    tag: {
                      value: "Shared",
                      color: "#818cf8",
                    },
                    icon: Icon.TwoPeople,
                  },
                ]
              : []),
          ]}
          actions={
            <ActionPanel>
              <Action icon={Icon.Compass} title="Open" onAction={() => onSelectWorkspace(workspace)} />
              <Action.CopyToClipboard content={workspace.connectionUrl} title="Share Link" />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
