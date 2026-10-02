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
import {
  applyKeyEquivalent,
  checkStatus,
  promptRestart,
  promptRestartApps,
  readKeyEquivalents,
  removeKeyEquivalent,
} from "./utils/appShortcuts";
import type { ShortcutStatus } from "./utils/appShortcuts";
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

  // Verify each remap against what is actually written in the app's defaults domain
  const bundleKey = useMemo(() => [...new Set((remaps ?? []).map((r) => r.bundleId))].join(","), [remaps]);
  const {
    data: keyEquivs,
    isLoading: isLoadingStatus,
    revalidate: revalidateStatus,
  } = useCachedPromise(
    async (ids: string) => {
      const map: Record<string, Record<string, string> | undefined> = {};
      for (const id of ids.split(",").filter(Boolean)) map[id] = await readKeyEquivalents(id);
      return map;
    },
    [bundleKey],
    { execute: bundleKey.length > 0, keepPreviousData: true },
  );

  // Status tag shown before the shortcut tags (hover for details)
  const STATUS_TAG: Record<ShortcutStatus, { value: string; color: Color }> = {
    applied: { value: "Applied", color: Color.Green },
    "not-applied": { value: "Not Applied", color: Color.Red },
    mismatch: { value: "Mismatch", color: Color.Orange },
    unknown: { value: "Unknown", color: Color.SecondaryText },
  };

  const statusTooltip = (entry: RemapEntry, status: ShortcutStatus): string => {
    const dict = keyEquivs?.[entry.bundleId];
    switch (status) {
      case "applied":
        return `Written: "${entry.menu}" = "${entry.encoded}" — takes effect after the app restarts`;
      case "not-applied":
        return `Not written yet: no "${entry.menu}" entry in ${entry.bundleId}`;
      case "mismatch":
        return `System has "${entry.menu}" = "${dict?.[entry.menu]}" but this remap expects "${entry.encoded}"`;
      default:
        return `Could not read ${entry.bundleId} — Full Disk Access may be required`;
    }
  };

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
      revalidateStatus();
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to remove remap", message: String(e) });
      return;
    }
    await promptRestart(entry.app);
  };

  // Re-apply remaps to the system (e.g. after carrying remaps.json to a new machine where nothing took effect)
  const handleReapply = async (entries: RemapEntry[]) => {
    if (!entries.length) return;
    const failures: { label: string; error: string }[] = [];
    const appliedApps: string[] = [];
    for (const entry of entries) {
      try {
        await applyKeyEquivalent(entry.bundleId, entry.menu, entry.encoded);
        appliedApps.push(entry.app);
      } catch (e) {
        failures.push({ label: `${entry.app} → ${entry.breadcrumb}`, error: String(e) });
      }
    }
    const applied = entries.length - failures.length;
    if (applied === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: entries.length === 1 ? "Failed to re-apply shortcut" : "Failed to re-apply shortcuts",
        message: failures[0].error,
      });
      return;
    }
    if (failures.length) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Re-applied ${applied} of ${entries.length} shortcuts`,
        message: `${failures.map((f) => f.label).join("\n")}\n${failures[0].error}`,
      });
    } else {
      await showToast({
        style: Toast.Style.Success,
        title: entries.length === 1 ? "Shortcut re-applied" : `Re-applied ${applied} shortcuts`,
      });
    }
    revalidateStatus();
    // Changes only take effect after each affected app restarts
    await promptRestartApps(appliedApps);
  };

  return (
    <List isLoading={isLoading || isLoadingStatus} searchBarPlaceholder="Search remapped shortcuts…" throttle>
      {groups.map((group) => (
        <List.Section key={group.title} title={group.title}>
          {group.items.map((entry) => {
            const status = checkStatus(entry, keyEquivs?.[entry.bundleId]);
            return (
              <List.Item
                key={`${entry.bundleId}-${entry.menu}`}
                icon={iconFor(entry)}
                title={entry.breadcrumb}
                subtitle={entry.menu}
                // Status (defaults read) → pre-remap shortcut (gray) → the current one
                accessories={[
                  ...(entry.originalShortcut !== undefined
                    ? [{ tag: { value: entry.originalShortcut || "—", color: Color.SecondaryText } }]
                    : []),
                  { tag: { value: entry.shortcut, color: Color.Green } },
                  { tag: STATUS_TAG[status], tooltip: statusTooltip(entry, status) },
                ]}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action title="Run Menu Item" icon={Icon.Play} onAction={() => handleRun(entry)} />
                      <Action.Push
                        title="Edit Remap"
                        icon={Icon.Pencil}
                        target={<RemapForm target={toTarget(entry)} />}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section title="Re-Apply & Status">
                      <Action
                        title="Re-Apply Shortcut"
                        icon={Icon.RotateClockwise}
                        onAction={() => handleReapply([entry])}
                      />
                      <Action
                        title="Re-Apply Shortcuts for This App"
                        icon={Icon.Repeat}
                        onAction={() => handleReapply(remaps?.filter((r) => r.bundleId === entry.bundleId) ?? [])}
                      />
                      <Action
                        title="Re-Apply All Shortcuts"
                        icon={Icon.ArrowClockwise}
                        onAction={() => handleReapply(remaps ?? [])}
                      />
                      <Action title="Check Status" icon={Icon.CheckCircle} onAction={() => revalidateStatus()} />
                    </ActionPanel.Section>
                    <ActionPanel.Section title="Copy">
                      <Action.CopyToClipboard title="Copy Menu Path" content={entry.breadcrumb} />
                      <Action.CopyToClipboard title="Copy Shortcut" content={entry.shortcut} />
                      <Action.CopyToClipboard title="Copy Encoded Value" content={entry.encoded} />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        title="Remove Remap"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["ctrl"], key: "x" }}
                        onAction={() => handleRemove(entry)}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
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
