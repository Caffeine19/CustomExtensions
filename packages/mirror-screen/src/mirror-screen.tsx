import {
  ActionPanel,
  Action,
  Icon,
  List,
  showToast,
  Toast,
  Color,
  showHUD,
  closeMainWindow,
  popToRoot,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { useCachedState, createDeeplink } from "@raycast/utils";
import { findDisplays, type ScreenDisplay } from "./utils/findDisplays";
import { toggleDisplay } from "./utils/toggleDisplay";

interface Context {
  displayName?: string;
}

export default function Command({ launchContext }: { launchContext?: Context }) {
  const [isLoading, setIsLoading] = useState(false);
  const [screenList, setScreenList] = useCachedState<ScreenDisplay[]>("screen-displays", []);

  // Auto-toggle if displayName is provided via quicklink
  useEffect(() => {
    if (!launchContext?.displayName) return;

    const displayName = launchContext.displayName;
    const foundDisplay = screenList.find(
      (display) => display.title.replace(" (Currently Mirroring)", "") === displayName,
    );

    if (foundDisplay) {
      (async function () {
        try {
          const result = await toggleDisplay(foundDisplay.title);

          if (result.success) {
            const isToggleOff = foundDisplay.title.includes("(Currently Mirroring)");
            const action = isToggleOff ? "stopped" : "started";

            closeMainWindow({ clearRootSearch: true });
            popToRoot({ clearSearchBar: true });
            showHUD(`Screen mirroring ${action} for ${displayName}`);
          } else {
            showToast({
              style: Toast.Style.Failure,
              title: "Failed to Toggle Display",
              message: result.error || `Could not toggle mirroring for ${displayName}`,
            });
          }
        } catch (error) {
          console.error("Auto-toggle failed:", error);
          showToast({
            style: Toast.Style.Failure,
            title: "Error",
            message: `Failed to toggle mirroring for ${displayName}`,
          });
        }
      })();
    } else {
      // Show error if display not found
      showToast({
        style: Toast.Style.Failure,
        title: "Display Not Found",
        message: `The display with name "${displayName}" was not found. Try refreshing displays manually.`,
      });
    }
  }, [launchContext?.displayName, screenList]);

  async function openDisplayMenuItem(displayTitle: string) {
    try {
      setIsLoading(true);

      const result = await toggleDisplay(displayTitle);

      if (result.success) {
        const isToggleOff = displayTitle.includes("(Currently Mirroring)");
        const cleanTitle = displayTitle.replace(" (Currently Mirroring)", "");

        showToast({
          style: Toast.Style.Success,
          title: isToggleOff ? "Screen Mirroring Stopped" : "Screen Mirroring Started",
          message: result.message || `${isToggleOff ? "Stopped mirroring to" : "Started mirroring to"} ${cleanTitle}`,
        });
      } else {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to Toggle Display",
          message: result.error || "Could not interact with the display",
        });
      }
    } catch (error) {
      console.error("Failed to toggle display mirroring:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: "Failed to interact with display",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function findScreenMirroringMenuItem() {
    try {
      setIsLoading(true);

      const displays = await findDisplays();
      setScreenList(displays);

      if (displays.length > 0) {
        showToast({
          style: Toast.Style.Success,
          title: "Screen Mirroring Menu Found!",
          message: `Found ${displays.length} display(s) in Control Center`,
        });
      } else {
        showToast({
          style: Toast.Style.Failure,
          title: "Screen Mirroring Menu Not Found",
          message: "Could not locate the menu item or find any displays",
        });
      }
    } catch (error) {
      console.error("Failed to find screen mirroring menu:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: "Failed to search for menu item",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <List isLoading={isLoading}>
      {screenList.length > 0 ? (
        <List.Section title="Available Displays" subtitle={`${screenList.length} display(s) found`}>
          {screenList.map((display, index) => {
            const isCurrentlyMirroring = display.title.includes("(Currently Mirroring)");
            const displayTitle = display.title.replace(" (Currently Mirroring)", "");

            return (
              <List.Item
                key={`${display.title}-${index}`}
                icon={{
                  source: isCurrentlyMirroring
                    ? Icon.CheckCircle
                    : display.role === "AXCheckBox"
                      ? Icon.Monitor
                      : Icon.Desktop,
                  tintColor: isCurrentlyMirroring ? Color.Green : Color.SecondaryText,
                }}
                title={displayTitle}
                subtitle={isCurrentlyMirroring ? "Currently Mirroring • " + display.role : `Role: ${display.role}`}
                actions={
                  <ActionPanel>
                    <Action
                      title={isCurrentlyMirroring ? "Stop Mirroring" : "Start Mirroring"}
                      icon={isCurrentlyMirroring ? Icon.Stop : Icon.Play}
                      onAction={() => openDisplayMenuItem(displayTitle)}
                    />
                    <Action.CreateQuicklink
                      quicklink={{
                        link: createDeeplink({
                          command: "mirror-screen",
                          context: { displayName: displayTitle },
                        }),
                        name: `Mirror to ${displayTitle}`,
                      }}
                      title="Save as Quicklink"
                      icon={Icon.Link}
                      shortcut={{ modifiers: ["cmd"], key: "s" }}
                    />
                    <Action
                      title="Refresh Displays"
                      icon={Icon.ArrowClockwise}
                      onAction={findScreenMirroringMenuItem}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ) : (
        <List.Item
          key="find-menu"
          icon={Icon.Monitor}
          title="No Displays Found"
          subtitle="Click 'Refresh Displays' to search for available screen mirroring options"
          actions={
            <ActionPanel>
              <Action title="Refresh Displays" icon={Icon.ArrowClockwise} onAction={findScreenMirroringMenuItem} />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
