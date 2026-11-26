# Workspace Changelog

## [Close Extra New Tab on Workspace Launch] - {PR_MERGE_DATE}

- Add a "Close New Tab" preference (default on) that closes the blank New Tab Microsoft Edge adds whenever a workspace is launched, including New Tab pages customized by extensions.
- "Search Workspaces" now launches workspaces through the shared utility, so it honors the preference too.

## [Fix Sync Dump Import] - {PR_MERGE_DATE}

- Fix parsing of raw `sync-data-dump-*.csv` exports from edge://sync-internals: embedded JSON payloads were mangled by CSV quote handling and every row was skipped.
- Import now accepts `.csv` dumps only; the `.xlsx` path and its `xlsx`/`json5` dependencies were removed.

## [Initial Version] - {PR_MERGE_DATE}
