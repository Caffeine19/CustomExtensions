import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import {
  collectDiagnostics,
  DiagnosticReport,
  stopOppoCommand,
} from "./diagnostics";

export default function Command() {
  const [report, setReport] = useState<DiagnosticReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setReport(await collectDiagnostics());
    } catch {
      setError("Could not collect diagnostics. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Detail
      isLoading={loading}
      markdown={
        error ?? report?.markdown ?? "Collecting Kerio VPN diagnostics…"
      }
      actions={
        <ActionPanel>
          <Action
            title="Refresh Diagnostics"
            icon={Icon.ArrowClockwise}
            onAction={refresh}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
          {report && (
            <Action.CopyToClipboard
              title="Copy Diagnostic Report"
              content={report.markdown}
            />
          )}
          {report?.oppoRunning && (
            <Action.CopyToClipboard
              title="Copy O+Connect Stop Command"
              content={stopOppoCommand}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
