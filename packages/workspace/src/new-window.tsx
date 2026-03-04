import { Action, ActionPanel, closeMainWindow, Form, popToRoot, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";

import { EdgeProfile } from "./types/edge-profile";
import { openNewEdgeWindow } from "./utils/newWindow";
import { discoverEdgeProfiles } from "./utils/profile";

export default function NewWindowCommand() {
  const [profiles, setProfiles] = useState<EdgeProfile[]>([]);

  const [selectedProfile, setSelectedProfile] = useState<string>("Default");

  const [url, setUrl] = useState<string>("");

  const [incognito, setIncognito] = useState<boolean>(false);

  useEffect(() => {
    const discoveredProfiles = discoverEdgeProfiles();
    setProfiles(discoveredProfiles);

    setSelectedProfile(discoveredProfiles[0]?.path || "Default");
  }, []);

  const handleSubmit = async () => {
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Opening new Edge window...",
      });

      closeMainWindow();
      popToRoot();

      await openNewEdgeWindow({
        url,
        incognito,
        profilePath: selectedProfile,
      });

      await showToast({
        style: Toast.Style.Success,
        title: "Edge window opened successfully",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to open Edge window",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={handleSubmit} title="Open New Window" />
        </ActionPanel>
      }
    >
      <Form.TextField id="url" title="URL (Optional)" placeholder="https://example.com" value={url} onChange={setUrl} />

      <Form.Dropdown id="profile" title="Profile" value={selectedProfile} onChange={setSelectedProfile}>
        {profiles.map((profile) => (
          <Form.Dropdown.Item key={profile.path} value={profile.path} title={profile.name} />
        ))}
      </Form.Dropdown>

      <Form.Checkbox
        id="incognito"
        title="Incognito Mode"
        label="Open in incognito mode"
        value={incognito}
        onChange={setIncognito}
      />
    </Form>
  );
}
