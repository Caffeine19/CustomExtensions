import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Color,
  Form,
  getFrontmostApplication,
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
import { useEffect, useMemo, useState } from "react";
import fs from "fs";
import { fetchAllMenus, clickMenuItem } from "./utils/menuItems";
import { matchesQuery } from "./utils/search";
import { getKeyBindings, matchKeyBinding, formatKeySequence } from "./utils/keybindings";

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

  // Restore persisted mode on mount
  useEffect(() => {
    (async () => {
      const stored = await LocalStorage.getItem<string>("which-key-mode");
      if (stored === "search" || stored === "action") setMode(stored);
    })();
  }, []);

  // Step 1: Get frontmost app info
  const { data: appInfo, isLoading: isLoadingApp } = useCachedPromise(
    async () => {
      const app = await getFrontmostApplication();
      return {
        name: app.name,
        icon: app.path ? ({ fileIcon: app.path } as Image.ImageLike) : undefined,
      };
    },
    [],
    { keepPreviousData: true },
  );

  // Step 2: Fetch menus, cached per app name
  const {
    data: menuData,
    isLoading: isLoadingMenus,
    error,
  } = useCachedPromise(
    async (_name) => {
      const { items } = await fetchAllMenus();
      return items.filter((item) => !item.hasSubmenu);
    },
    [appInfo?.name ?? ""],
    { keepPreviousData: true, execute: !!appInfo?.name },
  );

  if (error) {
    showToast({ style: Toast.Style.Failure, title: "Failed to read menus", message: String(error) });
  }

  const items = menuData ?? [];
  const keyBindings = appInfo ? getKeyBindings(appInfo.name) : [];

  // Vim-style mode switching: "/" → search, ":" → action
  const handleSearchTextChange = (text: string) => {
    if (mode === "action" && text === "/") {
      setMode("search");
      setSearchText("");
      LocalStorage.setItem("which-key-mode", "search");
      return;
    }
    if (mode === "search" && text === ":") {
      setMode("action");
      setSearchText("");
      LocalStorage.setItem("which-key-mode", "action");
      return;
    }
    setSearchText(text);
  };

  // Action mode: auto-trigger when exact match, show partial matches
  useEffect(() => {
    if (mode !== "action" || !searchText.trim() || !appInfo) return;
    const result = matchKeyBinding(appInfo.name, searchText.trim(), items);
    if (result.exact && !result.partial) {
      handleRun(result.exact.breadcrumb);
    }
  }, [searchText, mode, items, appInfo]);

  const handleRun = async (breadcrumb: string) => {
    if (!appInfo) return;
    try {
      await clickMenuItem(appInfo.name, breadcrumb);
      await closeMainWindow({ clearRootSearch: true });
      await popToRoot();
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to run menu item", message: String(e) });
    }
  };

  const handleCopyApp = async () => {
    if (!appInfo) return;
    await Clipboard.copy(`"${appInfo.name}"`);
    await showToast({ style: Toast.Style.Success, title: "Copied app name", message: appInfo.name });
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
        return { ...b, shortcut: menuItem?.shortcut ?? "", displayKey: formatKeySequence(b.key) };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [keyBindings, searchText, items]);

  // ─── Search mode items ───
  const searchItems = useMemo(() => {
    if (!searchText.trim()) return items;
    return items.filter((item) => matchesQuery(item, searchText));
  }, [items, searchText]);

  const isLoading = isLoadingApp || isLoadingMenus;
  const appName = appInfo?.name ?? "";

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
          icon={Icon.Warning}
        />
      )}

      {/* ─── Action mode ─── */}
      {mode === "action" && keyBindings.length > 0 && (
        <List.Section title={`${appName} — Actions`}>
          {actionItems.map((b) => (
            <List.Item
              key={`action-${b.key}`}
              icon={appInfo?.icon ?? Icon.Document}
              title={b.path}
              subtitle={b.shortcut || undefined}
              accessories={[{ tag: { value: b.displayKey, color: Color.Blue } }]}
              actions={
                <ActionPanel>
                  <Action title="Run Action" icon={Icon.Play} onAction={() => handleRun(b.path)} />
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
      {mode === "search" && (
        <List.Section title={`${appName} — Menu Bar`}>
          {searchItems.map((item) => (
            <List.Item
              key={item.key}
              icon={appInfo?.icon ?? Icon.Document}
              title={item.breadcrumb}
              accessories={[...(item.shortcut ? [{ tag: item.shortcut }] : [])]}
              actions={
                <ActionPanel>
                  <Action title="Run Menu Item" icon={Icon.Play} onAction={() => handleRun(item.breadcrumb)} />
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
          ))}
        </List.Section>
      )}
    </List>
  );
}
