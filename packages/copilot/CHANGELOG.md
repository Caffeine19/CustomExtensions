# Copilot Changelog

## [Add Copilot Harness session support] - {PR_MERGE_DATE}

- List Copilot Harness (Agent Host) sessions alongside local VS Code chat sessions, with live status, provider and fork badges
- Add a "Session Scope" preference to show all, Copilot Harness only, or local only sessions
- Add actions for Copilot Harness sessions: Rename Session, Fork from Latest Turn, Archive/Unarchive, Delete Chat
- Add an offline hint when no VS Code Agent Host is reachable
- Open sessions in their `.code-workspace` (multi-root) window instead of a single folder
- Fix Quick Chat's fallback folder picker: its values arrived as an array and broke launching with a misleading error
- Fix sessions missing an explicit empty flag being hidden from the lists
- Fix unarchiving: a running chat in an archived session showed only its activity and could not be unarchived

## [Initial Version] - {PR_MERGE_DATE}
