# Workspace Changelog

## [Fix Sync Dump Import] - {PR_MERGE_DATE}

- Fix parsing of raw `sync-data-dump-*.csv` exports from edge://sync-internals: embedded JSON payloads were mangled by CSV quote handling and every row was skipped.
- Import now accepts `.csv` dumps only; the `.xlsx` path and its `xlsx`/`json5` dependencies were removed.

## [Initial Version] - {PR_MERGE_DATE}
