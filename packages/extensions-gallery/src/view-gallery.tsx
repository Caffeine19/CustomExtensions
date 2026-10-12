import { useState } from "react";

import { Action, ActionPanel, Grid, Icon } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";

import { CustomExtension } from "./types/extension";
import {
  createDeepLink,
  launchExtensionCommand,
  openPackageInEditor,
  openPackageInFinder,
} from "./utils/actions";
import { getCustomExtensions } from "./utils/extensions";

/** Column presets selectable from the grid size dropdown */
const COLUMN_PRESETS = [
  { title: "Large", columns: 3 },
  { title: "Medium", columns: 5 },
  { title: "Small", columns: 6 },
];

export default function Command() {
  const [columns, setColumns] = useState(5);
  const {
    data: extensions,
    error,
    isLoading,
  } = useCachedPromise(getCustomExtensions);

  return (
    <Grid
      columns={columns}
      inset={Grid.Inset.Medium}
      isLoading={isLoading}
      searchBarAccessory={
        <Grid.Dropdown
          tooltip="Grid Item Size"
          storeValue
          defaultValue="5"
          onChange={(newValue) => setColumns(parseInt(newValue))}
        >
          {COLUMN_PRESETS.map((preset) => (
            <Grid.Dropdown.Item
              key={preset.title}
              title={preset.title}
              value={String(preset.columns)}
            />
          ))}
        </Grid.Dropdown>
      }
    >
      {extensions?.map((extension) => (
        <ExtensionGridItem key={extension.name} extension={extension} />
      ))}
      {!isLoading && (error || (extensions ?? []).length === 0) ? (
        <Grid.EmptyView
          icon={error ? Icon.Warning : Icon.Box}
          title={error ? "Failed to Load Extensions" : "No Extensions Found"}
          description={
            error
              ? error.message
              : "No Raycast extension packages were found in the monorepo packages directory."
          }
        />
      ) : null}
    </Grid>
  );
}

/** Renders a single custom extension as a grid item */
function ExtensionGridItem({ extension }: { extension: CustomExtension }) {
  return (
    <Grid.Item
      content={{
        value: extension.iconPath
          ? { source: extension.iconPath, fallback: Icon.Box }
          : Icon.Box,
        tooltip: buildTooltip(extension),
      }}
      title={extension.title}
      subtitle={`${extension.commands.length} ${extension.commands.length === 1 ? "command" : "commands"}`}
      keywords={[
        extension.name,
        extension.author,
        ...extension.commands.map((command) => command.title),
      ]}
      actions={<ExtensionActions extension={extension} />}
    />
  );
}

/** Builds the hover tooltip describing an extension */
function buildTooltip(extension: CustomExtension): string {
  return [
    extension.description,
    `Author: ${extension.author}`,
    `Commands: ${extension.commands.length}`,
    `Updated: ${extension.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Action panel for a single custom extension */
function ExtensionActions({ extension }: { extension: CustomExtension }) {
  const [primaryCommand] = extension.commands;

  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action
          title="Launch Extension"
          icon={Icon.Rocket}
          onAction={() => launchExtensionCommand(extension, primaryCommand)}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Commands">
        {extension.commands.map((command) => (
          <Action
            key={command.name}
            title={`Launch ${command.title}`}
            icon={Icon.Play}
            onAction={() => launchExtensionCommand(extension, command)}
          />
        ))}
      </ActionPanel.Section>
      <ActionPanel.Section title="Package">
        <Action
          title="Open Package in VS Code"
          icon={Icon.Code}
          onAction={() => openPackageInEditor(extension)}
        />
        <Action
          title="Open Package in Finder"
          icon={Icon.Finder}
          onAction={() => openPackageInFinder(extension)}
        />
        <Action.CopyToClipboard
          title="Copy Deeplink"
          content={createDeepLink(extension, primaryCommand)}
        />
        <Action.CopyToClipboard title="Copy Name" content={extension.name} />
        <Action.CopyToClipboard title="Copy Path" content={extension.path} />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
