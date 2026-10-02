import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  getApplications,
  Icon,
  Image,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo } from "react";
import { loadRemaps, removeRemap } from "./utils/remapStore";
import type { RemapEntry } from "./utils/remapStore";
import { promptRestart, removeKeyEquivalent } from "./utils/appShortcuts";
import { runMenuItem } from "./utils/runMenuItem";
import RemapForm from "./components/RemapForm";
import type { RemapTarget } from "./components/RemapForm";

export default function Command() {
  const { data: remaps, isLoading, revalidate } = useCachedPromise(loadRemaps, [], { keepPreviousData: true });
  const { data: applications } = useCachedPromise(getApplications, [], { keepPreviousData: true });

  // Group remaps by application name, sorted: sections by app name, items by menu path
  const groups = useMemo(() => {
    const map = new Map<string, RemapEntry[]>();
    for (const entry of remaps ?? []) {
      const group = map.get(entry.app);
      if (group) group.push(entry);
      else map.set(entry.app, [entry]);
    }
    return Array.from(map, ([title, items]) => ({
      title,
      items: [...items].sort((a, b) => a.breadcrumb.localeCompare(b.breadcrumb)),
    })).sort((a, b) => a.title.localeCompare(b.title));
  }, [remaps]);

  const iconFor = (entry: RemapEntry): Image.ImageLike => {
    const app = applications?.find((a) => a.bundleId === entry.bundleId);
    return app?.path ? ({ fileIcon: app.path } as Image.ImageLike) : Icon.Document;
  };

  const toTarget = (entry: RemapEntry): RemapTarget => ({
    app: entry.app,
    bundleId: entry.bundleId,
    breadcrumb: entry.breadcrumb,
    menu: entry.menu,
    shortcut: entry.shortcut,
  });

  const handleRun = async (entry: RemapEntry) => {
    try {
      await runMenuItem(entry.app, entry.breadcrumb);
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to run menu item", message: String(e) });
    }
  };

  const handleRemove = async (entry: RemapEntry) => {
    const confirmed = await confirmAlert({
      title: "Remove Shortcut Remap?",
      message: `${entry.app} → ${entry.breadcrumb}`,
      primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel" },
    });
    if (!confirmed) return;
    try {
      // Clear = remove the system override AND the ledger entry
      await removeKeyEquivalent(entry.bundleId, entry.menu);
      await removeRemap(entry.bundleId, entry.menu);
      await showToast({ style: Toast.Style.Success, title: "Shortcut cleared", message: entry.breadcrumb });
      revalidate();
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to remove remap", message: String(e) });
      return;
    }
    await promptRestart(entry.app);
  };

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search remapped shortcuts…" throttle>
      {groups.map((group) => (
        <List.Section key={group.title} title={group.title}>
          {group.items.map((entry) => (
            <List.Item
              key={`${entry.bundleId}-${entry.menu}`}
              icon={iconFor(entry)}
              title={entry.breadcrumb}
              subtitle={entry.menu}
              // Pre-remap shortcut (gray) before the current one
              accessories={[
                ...(entry.originalShortcut !== undefined
                  ? [{ tag: { value: entry.originalShortcut || "—", color: Color.SecondaryText } }]
                  : []),
                { tag: { value: entry.shortcut, color: Color.Green } },
              ]}
              actions={
                <ActionPanel>
                  <Action title="Run Menu Item" icon={Icon.Play} onAction={() => handleRun(entry)} />
                  <Action.Push title="Edit Remap" icon={Icon.Pencil} target={<RemapForm target={toTarget(entry)} />} />
                  <Action
                    title="Remove Remap"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    onAction={() => handleRemove(entry)}
                  />
                  <Action.CopyToClipboard title="Copy Menu Path" content={entry.breadcrumb} />
                  <Action.CopyToClipboard title="Copy Shortcut" content={entry.shortcut} />
                  <Action.CopyToClipboard title="Copy Encoded Value" content={entry.encoded} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
      {groups.length === 0 && (
        <List.EmptyView
          title="No Remapped Keys"
          description={'No shortcut remaps recorded yet.\nUse "Remap Key" in Show Menu to remap a menu item.'}
          icon={Icon.Keyboard}
        />
      )}
    </List>
  );
}
