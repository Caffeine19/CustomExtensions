import { Action, ActionPanel, Color, getApplications, getFrontmostApplication, Icon, Image, List } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useEffect, useMemo, useState } from "react";
import { fetchShortcuts, formatShortcut, groupByApp } from "./utils/shortcuts";
import type { AppShortcutGroup, InAppShortcut } from "./utils/shortcuts";

const FRONTMOST_POLL_MS = 1000;

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

  // Track the app behind Raycast so its shortcuts can be pinned to the top.
  const [frontmostName, setFrontmostName] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const app = await getFrontmostApplication();
        if (!cancelled) setFrontmostName(app.name);
      } catch {
        // Transient focus errors — keep the last known name.
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), FRONTMOST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const { currentGroup, otherGroups } = useMemo(() => {
    const needle = frontmostName?.toLowerCase();
    const current = needle
      ? groups.find((g) => [g.app, ...g.items.map((i) => i.requestedAppName)].some((n) => n.toLowerCase() === needle))
      : undefined;
    return { currentGroup: current, otherGroups: groups.filter((g) => g !== current) };
  }, [groups, frontmostName]);

  const iconFor = (group: AppShortcutGroup): Image.ImageLike => {
    // getApplications() is Spotlight-based and misses nested helper apps (e.g. "Screen Mirroring - AndroMeld"),
    // so prefer the bundle path reported by Hammerspoon.
    const appPath = group.items.find((item) => item.appPath)?.appPath;
    if (appPath) {
      return { fileIcon: appPath };
    }
    const app = applications?.find((a) => a.name === group.app || a.name === group.items[0]?.requestedAppName);
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

  const renderGroup = (group: AppShortcutGroup, sectionTitle: string) => (
    <List.Section key={group.app} title={sectionTitle}>
      {group.items.map((item) => (
        <List.Item
          key={item.id}
          icon={iconFor(group)}
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
  );

  return (
    <List isLoading={isLoading} filtering searchBarPlaceholder="Search by app, shortcut, or description">
      <List.EmptyView icon={Icon.Keyboard} title="No in-app shortcuts found" description="Reload to try again." />
      {currentGroup && renderGroup(currentGroup, `Current App · ${currentGroup.app} (${currentGroup.items.length})`)}
      {otherGroups.map((group) => renderGroup(group, `${group.app} (${group.items.length})`))}
    </List>
  );
}
