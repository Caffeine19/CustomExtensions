import { Action, ActionPanel, Form, Icon, popToRoot, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";

import { parseSyncCsv } from "./utils/parse-sync-csv";
import { loadSyncImport, saveSyncImport } from "./utils/sync-cache";

interface FormValues {
  csvFile: string[];
}

export default function Command() {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const existing = loadSyncImport();

  const onSubmit = async (values: FormValues) => {
    const [filePath] = values.csvFile ?? [];
    if (!filePath) {
      await showToast({ style: Toast.Style.Failure, title: "Please select a CSV file" });
      return;
    }

    setIsLoading(true);
    try {
      const result = parseSyncCsv(filePath);

      if (result.workspaces.length === 0 && result.tabs.length === 0) {
        await showToast({
          style: Toast.Style.Failure,
          title: "No workspaces found",
          message: result.warnings[0] ?? "Payload was empty",
        });
        return;
      }

      saveSyncImport({
        importedAt: Date.now(),
        source: filePath,
        workspaces: result.workspaces,
        tabs: result.tabs,
        totalRows: result.totalRows,
        skippedRows: result.skippedRows,
      });

      await showToast({
        style: Toast.Style.Success,
        title: "Imported",
        message: `${result.workspaces.length} workspace(s), ${result.tabs.length} tab(s)${
          result.skippedRows ? ` · ${result.skippedRows} skipped` : ""
        }`,
      });
      pop();
      await popToRoot();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to import",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Download} title="Import" onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Import Workspaces from Sync Dump"
        text={
          "Select a sync-data-dump-*.csv or .xlsx file exported from edge://sync-internals.\n\n" +
          "⚠ The default .csv export is always REDACTED on macOS Edge. " +
          "To get real titles and URLs, open the .csv in WPS or Excel and save it as .xlsx, " +
          "then pick the .xlsx here."
        }
      />
      <Form.FilePicker id="csvFile" title="Sync Dump File" />
      {existing ? (
        <Form.Description
          title="Current Cache"
          text={
            `Imported ${new Date(existing.importedAt).toLocaleString()}: ` +
            `${existing.workspaces.length} workspace(s), ${existing.tabs.length} tab(s).\n` +
            `Submitting will replace it.`
          }
        />
      ) : null}
    </Form>
  );
}
