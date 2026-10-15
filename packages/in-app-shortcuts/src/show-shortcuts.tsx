import { Action, ActionPanel, Color, getApplications, Icon, Image, List } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useMemo } from "react";
import { fetchShortcuts, formatShortcut, groupByApp } from "./utils/shortcuts";
import type { InAppShortcut } from "./utils/shortcuts";

export default function Command() {
  const {
    data: shortcuts,
    isLoading,
    revalidate,
  } = useCachedPromise(fetchShortcuts, [], {
    keepPreviousData: true,
    onError: (error) => {
      showFailureToast(error, { title: "Failed to load in-app shortcuts" });
    },
  });

  const { data: applications } = useCachedPromise(getApplications, [], { keepPreviousData: true });

  const groups = useMemo(() => groupByApp(shortcuts ?? []), [shortcuts]);

  const iconFor = (appName: string): Image.ImageLike => {
    const app = applications?.find((a) => a.name === appName);
    return app?.path ? { fileIcon: app.path } : Icon.Keyboard;
  };

  const keywordsFor = (item: InAppShortcut): string[] =>
    [
      item.appName,
      item.requestedAppName,
      item.hotkeyLabel,
      formatShortcut(item.hotkeyLabel),
      item.description ?? "",
      item.key,
      ...item.mods,
    ].filter(Boolean);

  return (
    <List isLoading={isLoading} filtering searchBarPlaceholder="Search by app, shortcut, or description">
      <List.EmptyView icon={Icon.Keyboard} title="No in-app shortcuts found" description="Reload to try again." />
      {groups.map((group) => (
        <List.Section key={group.app} title={`${group.app} (${group.items.length})`}>
          {group.items.map((item) => (
            <List.Item
              key={item.id}
              icon={iconFor(group.app)}
              title={item.description ?? formatShortcut(item.hotkeyLabel)}
              keywords={keywordsFor(item)}
              accessories={[{ tag: { value: formatShortcut(item.hotkeyLabel), color: Color.Green } }]}
              actions={
                <ActionPanel>
                  <Action title="Reload Data" onAction={revalidate} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
