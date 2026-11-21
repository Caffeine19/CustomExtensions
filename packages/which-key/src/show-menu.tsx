import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Color,
  Form,
  getFrontmostApplication,
  getPreferenceValues,
  Icon,
  Image,
  List,
  LocalStorage,
  popToRoot,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import fs from "fs";
import { fetchAllMenus } from "./utils/menuItems";
import type { FlatMenuItem } from "./utils/menuItems";
import { appCacheKey, readSnapshot, StaleGuard, writeSnapshot } from "./utils/menuCache";
import type { MenuSnapshot } from "./utils/menuCache";
import { listPins, movePin, pinItem, unpinItem } from "./utils/pinStore";
import type { PinEntry } from "./utils/pinStore";
import { rankItems } from "./utils/rank";
import { isModifierOnlyShortcut, matchesQuery } from "./utils/search";
import { getKeyBindings, matchKeyBinding, formatKeySequence } from "./utils/keybindings";
import { resolveBundleId, resolveMenuKey } from "./utils/appShortcuts";
import { filterBrowserMenuItems } from "./utils/browserFilter";
import { runMenuItem } from "./utils/runMenuItem";
import RemapForm from "./components/RemapForm";
import type { RemapTarget } from "./components/RemapForm";

type Mode = "search" | "action";

function ExportForm({ onExport }: { onExport: (dir: string) => Promise<void> }) {
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Export"
            icon={Icon.Download}
            onSubmit={async (values: { directory: string[] }) => {
              const dir = values.directory[0];
              if (!dir) {
                await showToast({ style: Toast.Style.Failure, title: "Please select a directory" });
                return;
              }
              await onExport(dir);
              await closeMainWindow({ clearRootSearch: true });
              await popToRoot();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="directory"
        title="Export Directory"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
      />
    </Form>
  );
}

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [mode, setMode] = useState<Mode>("search");

  // Read once per launch (toggling the pref in Raycast settings re-runs the command)
  const { excludeBrowserDynamicItems } = getPreferenceValues<Preferences.ShowMenu>();

  // Restore persisted mode on mount
  useEffect(() => {
    (async () => {
      const stored = await LocalStorage.getItem<string>("which-key-mode");
      if (stored === "search" || stored === "action") setMode(stored);
    })();
  }, []);

  // Step 1: Get frontmost app info (seed identity; the menu fetch refines it below)
  const { data: frontmost, isLoading: isLoadingApp } = useCachedPromise(
    async () => {
      const app = await getFrontmostApplication();
      return {
        name: app.name,
        bundleId: app.bundleId ?? (await resolveBundleId(app.name).catch(() => "")),
        icon: app.path ? ({ fileIcon: app.path } as Image.ImageLike) : undefined,
      };
    },
    [],
    { keepPreviousData: true },
  );

  // Step 2: two-phase menu load — cached snapshot first (ends the initial loading),
  // then a fresh read replaces it; a failed refresh keeps the snapshot (useCache semantics).
  const seedKey = frontmost ? appCacheKey(frontmost.bundleId, frontmost.name) : "";
  const guardRef = useRef(new StaleGuard());
  const [cached, setCached] = useState<MenuSnapshot | undefined>();
  const [fresh, setFresh] = useState<MenuSnapshot | undefined>();
  const [isLoadingMenus, setIsLoadingMenus] = useState(true);
  const [menuError, setMenuError] = useState<string | undefined>();

  useEffect(() => {
    if (!seedKey) return;
    const guard = guardRef.current;
    const token = guard.begin();
    setIsLoadingMenus(true);
    setMenuError(undefined);

    let gotFresh = false;
    readSnapshot(seedKey).then((snap) => {
      // Stale-request guard: older results must not overwrite newer state
      if (!guard.isCurrent(token) || gotFresh) return;
      setCached(snap);
    });

    fetchAllMenus()
      .then((result) => {
        if (!guard.isCurrent(token)) return;
        gotFresh = true;
        const snapshot: MenuSnapshot = {
          pid: result.pid,
          appName: result.appName,
          bundleId: result.bundleId,
          items: result.items,
          savedAt: new Date().toISOString(),
        };
        setFresh(snapshot);
        writeSnapshot(seedKey, snapshot);
      })
      .catch((e) => {
        if (!guard.isCurrent(token)) return;
        setMenuError(String(e));
      })
      .finally(() => {
        if (guard.isCurrent(token)) setIsLoadingMenus(false);
      });
  }, [seedKey]);

  useEffect(() => {
    if (menuError) {
      showToast({ style: Toast.Style.Failure, title: "Failed to read menus", message: menuError });
    }
  }, [menuError]);

  // ─── Target identity: the menu-bar-owning app (snapshot wins over frontmost) ───
  const snapshot = fresh ?? cached;
  const target = useMemo(() => {
    if (snapshot) return { name: snapshot.appName, bundleId: snapshot.bundleId };
    return frontmost ? { name: frontmost.name, bundleId: frontmost.bundleId } : undefined;
  }, [snapshot, frontmost]);
  const appName = target?.name ?? "";
  const appIcon = frontmost?.icon ?? Icon.Document;
  const targetKey = target ? appCacheKey(target.bundleId, target.name) : "";
  const keyBindings = target ? getKeyBindings(target.name) : [];

  const items = useMemo(() => {
    const leaves = (snapshot?.items ?? [])
      .filter((item) => !item.hasSubmenu)
      // Drop modifier-only AX shortcut artifacts (also cleans older cache snapshots)
      .map((item) => (isModifierOnlyShortcut(item.shortcut) ? { ...item, shortcut: "" } : item));
    // Optionally hide dynamic browser content (bookmarks/history/tabs) via whitelist
    return excludeBrowserDynamicItems ? filterBrowserMenuItems(leaves, target?.bundleId ?? "") : leaves;
  }, [snapshot, excludeBrowserDynamicItems, target?.bundleId]);

  // ─── Pinned items (AppMenuBarItemsRepository equivalent) ───
  const [pins, setPins] = useState<PinEntry[]>([]);
  useEffect(() => {
    if (!targetKey) return;
    let cancelled = false;
    listPins(targetKey).then((loaded) => {
      if (!cancelled) setPins(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [targetKey]);

  const pinIndexOf = useCallback(
    (item: { breadcrumb: string }) => pins.findIndex((p) => p.itemId === item.breadcrumb),
    [pins],
  );

  const handleTogglePin = async (item: FlatMenuItem) => {
    if (!target) return;
    const updated =
      pinIndexOf(item) >= 0
        ? await unpinItem(targetKey, item.breadcrumb)
        : await pinItem({
            app: target.name,
            appKey: targetKey,
            itemId: item.breadcrumb,
            breadcrumb: item.breadcrumb,
            name: item.name,
          });
    setPins(updated);
  };

  const handleMovePin = async (item: FlatMenuItem, direction: "up" | "down") => {
    if (!target) return;
    setPins(await movePin(targetKey, item.breadcrumb, direction));
  };

  // Vim-style mode switching: "/" → search, ":" → action
  const handleSearchTextChange = (text: string) => {
    if (mode === "action" && text === "/") {
      setMode("search");
      setSearchText("");
      LocalStorage.setItem("which-key-mode", "search");
      return;
    }
    if (mode === "search" && (text === ":" || text === ";")) {
      setMode("action");
      setSearchText("");
      LocalStorage.setItem("which-key-mode", "action");
      return;
    }
    setSearchText(text);
  };

  // Action mode: auto-trigger when exact match, show partial matches
  useEffect(() => {
    if (mode !== "action" || !searchText.trim() || !target) return;
    const result = matchKeyBinding(target.name, searchText.trim(), items);
    if (result.exact && !result.partial) {
      handleRun(result.exact.breadcrumb);
    }
  }, [searchText, mode, items, target]);

  const handleRun = async (breadcrumb: string) => {
    if (!target) return;
    try {
      await runMenuItem(target.name, breadcrumb, target.bundleId);
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to run menu item", message: String(e) });
    }
  };

  // Open just the top-level menu (Raycast's Show Menu sends only the top-level path)
  const handleShowMenu = async (breadcrumb: string) => {
    if (!target) return;
    try {
      await runMenuItem(target.name, breadcrumb.split(" → ")[0], target.bundleId);
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to open menu", message: String(e) });
    }
  };

  // Build the remap target for a menu item (menu key disambiguates duplicate leaf titles)
  const buildRemapTarget = (breadcrumb: string, name: string, shortcut?: string): RemapTarget => ({
    app: appName,
    bundleId: target?.bundleId ?? "",
    breadcrumb,
    menu: resolveMenuKey({ name, breadcrumb }, items),
    shortcut,
  });

  const handleCopyApp = async () => {
    if (!target) return;
    await Clipboard.copy(`"${target.name}"`);
    await showToast({ style: Toast.Style.Success, title: "Copied app name", message: target.name });
  };

  const handleCopyMenuPath = async (breadcrumb: string) => {
    await Clipboard.copy(`"${breadcrumb}"`);
    await showToast({ style: Toast.Style.Success, title: "Copied menu path", message: breadcrumb });
  };

  const handleExport = async (exportDir: string) => {
    if (!items.length || !appName) return;
    const exportData = items.map((item) => ({
      name: item.name,
      breadcrumb: item.breadcrumb,
      shortcut: item.shortcut,
    }));
    const json = JSON.stringify(exportData, null, 2);
    const fileName = `which-key-${appName.replace(/\s+/g, "-").toLowerCase()}.json`;
    const filePath = `${exportDir}/${fileName}`;
    await fs.promises.writeFile(filePath, json, "utf-8");
    await showHUD(`Exported ${items.length} items to ${fileName}`);
  };

  // ─── Action mode items: show bindings for current app ───
  const actionItems = useMemo(() => {
    if (!keyBindings.length) return [];
    const q = searchText.trim().toLowerCase();
    return keyBindings
      .filter((b) => !q || b.key.toLowerCase().startsWith(q))
      .map((b) => {
        const menuItem = items.find((item) => item.breadcrumb === b.path);
        return {
          ...b,
          shortcut: menuItem?.shortcut ?? "",
          displayKey: formatKeySequence(b.key),
          menuName: menuItem?.name ?? b.path.split(" → ").pop() ?? b.path,
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [keyBindings, searchText, items]);

  // ─── Search mode: Pinned + top-level groups on empty query, ranked flat list otherwise ───
  const queryText = searchText.trimStart();

  const pinnedItems = useMemo(() => {
    return pins
      .map((pin) => items.find((item) => item.breadcrumb === pin.itemId))
      .filter((item): item is FlatMenuItem => !!item);
  }, [pins, items]);

  const searchGroups = useMemo(() => {
    if (queryText) return [];
    const pinnedIds = new Set(pins.map((p) => p.itemId));
    const filtered = items.filter((item) => !pinnedIds.has(item.breadcrumb));
    const groups = new Map<string, typeof items>();
    for (const item of filtered) {
      // Breadcrumb root IS the top-level menu title: "Window → Move To → Display"
      const segments = item.breadcrumb.split(" → ");
      const parent = segments[0] || appName;
      const group = groups.get(parent);
      if (group) group.push(item);
      else groups.set(parent, [item]);
    }
    return Array.from(groups, ([title, groupItems]) => ({ title, items: groupItems }));
  }, [items, queryText, pins, appName]);

  const rankedItems = useMemo(() => {
    if (!queryText) return [];
    const filtered = items.filter((item) => matchesQuery(item, queryText));
    return rankItems(filtered, queryText, pinIndexOf);
  }, [items, queryText, pinIndexOf]);

  const isLoading = isLoadingApp || isLoadingMenus;

  // ─── Shared row for search-mode items (Pinned / groups / ranked results) ───
  const renderItem = (item: FlatMenuItem) => {
    const pinIndex = pinIndexOf(item);
    const pinned = pinIndex >= 0;
    const parentPath = item.breadcrumb.split(" → ").slice(0, -1).join(" → ");
    return (
      <List.Item
        key={item.key}
        icon={appIcon}
        title={item.name}
        subtitle={parentPath || undefined}
        accessories={[
          ...(item.shortcut ? [{ tag: item.shortcut }] : []),
          ...(item.checked ? [{ tag: { value: item.mark || "✓", color: Color.Green } }] : []),
        ]}
        actions={
          <ActionPanel>
            <Action title="Open" icon={Icon.ArrowRightCircle} onAction={() => handleRun(item.breadcrumb)} />
            <Action title="Show Menu" icon={Icon.List} onAction={() => handleShowMenu(item.breadcrumb)} />
            <Action.Push
              title="Remap Key"
              icon={Icon.Keyboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
              target={<RemapForm target={buildRemapTarget(item.breadcrumb, item.name, item.shortcut)} />}
            />
            {pinned ? (
              <Action title="Unpin Item" icon={Icon.PinDisabled} onAction={() => handleTogglePin(item)} />
            ) : (
              <Action title="Pin Item" icon={Icon.Pin} onAction={() => handleTogglePin(item)} />
            )}
            {pinned && pinIndex > 0 && (
              <Action title="Move up" icon={Icon.ArrowUp} onAction={() => handleMovePin(item, "up")} />
            )}
            {pinned && pinIndex < pins.length - 1 && (
              <Action title="Move Down" icon={Icon.ArrowDown} onAction={() => handleMovePin(item, "down")} />
            )}
            <Action title="Copy App Name" icon={Icon.Clipboard} onAction={handleCopyApp} />
            <Action
              title="Copy Menu Path"
              icon={Icon.CopyClipboard}
              onAction={() => handleCopyMenuPath(item.breadcrumb)}
            />
            {item.shortcut && <Action.CopyToClipboard title="Copy Shortcut" content={item.shortcut} />}
            <Action.Push
              title="Export Menu Items (JSON)"
              icon={Icon.Download}
              shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
              target={<ExportForm onExport={handleExport} />}
            />
          </ActionPanel>
        }
      />
    );
  };

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={handleSearchTextChange}
      searchBarPlaceholder={mode === "action" ? `Press a key to trigger…` : `Search ${appName} menus…`}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Switch Mode"
          value={mode}
          onChange={(v) => {
            const newMode = v as Mode;
            setMode(newMode);
            setSearchText("");
            LocalStorage.setItem("which-key-mode", newMode);
          }}
        >
          <List.Dropdown.Item value="search" title="Search" icon={Icon.MagnifyingGlass} />
          <List.Dropdown.Item value="action" title="Action" icon={Icon.Bolt} />
        </List.Dropdown>
      }
      throttle
    >
      {/* ─── No keybindings configured ─── */}
      {mode === "action" && keyBindings.length === 0 && !isLoading && (
        <List.EmptyView
          title="No Keybindings"
          description={`No keybindings configured for ${appName} yet.\nUse "Copy App Name" and "Copy Menu Path" actions to help configure.`}
          icon={Icon.BlankDocument}
        />
      )}

      {/* ─── Action mode ─── */}
      {mode === "action" && keyBindings.length > 0 && (
        <List.Section title={`${appName} — Actions`}>
          {actionItems.map((b) => (
            <List.Item
              key={`action-${b.key}`}
              icon={appIcon}
              title={b.path}
              subtitle={b.shortcut || undefined}
              accessories={[{ tag: { value: b.displayKey, color: Color.Blue } }]}
              actions={
                <ActionPanel>
                  <Action title="Run Action" icon={Icon.Play} onAction={() => handleRun(b.path)} />
                  <Action.Push
                    title="Remap Key"
                    icon={Icon.Keyboard}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                    target={<RemapForm target={buildRemapTarget(b.path, b.menuName, b.shortcut)} />}
                  />
                  <Action title="Copy App Name" icon={Icon.Clipboard} onAction={handleCopyApp} />
                  <Action
                    title="Copy Menu Path"
                    icon={Icon.CopyClipboard}
                    onAction={() => handleCopyMenuPath(b.path)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {/* ─── Search mode ─── */}
      {mode === "search" && !isLoading && items.length === 0 && (
        <List.EmptyView
          title="No Menu Items"
          description={`No menu items found for ${appName}.`}
          icon={Icon.BlankDocument}
        />
      )}
      {mode === "search" && !isLoading && items.length > 0 && queryText && rankedItems.length === 0 && (
        <List.EmptyView
          title="No Results"
          description={`No menu items matching "${searchText}".`}
          icon={Icon.MagnifyingGlass}
        />
      )}

      {mode === "search" && !queryText && pinnedItems.length > 0 && (
        <List.Section title="Pinned">{pinnedItems.map((item) => renderItem(item))}</List.Section>
      )}
      {mode === "search" &&
        !queryText &&
        searchGroups.map((group) => (
          <List.Section
            key={group.title}
            title={`${group.title} (${group.items.length} item${group.items.length === 1 ? "" : "s"})`}
          >
            {group.items.map((item) => renderItem(item))}
          </List.Section>
        ))}
      {mode === "search" && queryText && rankedItems.length > 0 && (
        <List.Section title={`Results (${rankedItems.length} item${rankedItems.length === 1 ? "" : "s"})`}>
          {rankedItems.map((item) => renderItem(item))}
        </List.Section>
      )}
    </List>
  );
}
