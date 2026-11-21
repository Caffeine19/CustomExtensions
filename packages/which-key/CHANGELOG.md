# Which Key Changelog

## [Search Menu Bar Items Parity] - {PR_MERGE_DATE}

- Menu search now matches Raycast's built-in Search Menu Bar Items result-for-result: same fuzzy scoring (4/3/2/1 weights, separator table, gap penalty, threshold `score > 2 × (query length − skipped separators)`), same relevance ranking, and the same `transliteration`-based normalization for non-ASCII text
- Result and menu-group sections carry Raycast-style item counts; action names follow Raycast (Open / Show Menu / Pin Item / Unpin Item / Move Up / Move Down)
- Added Pinned items with pin/unpin/reorder actions, persisted to `~/.config/which-key/pins.json`
- Menu reads now target the menu-bar-owning app, serve the cached snapshot first for instant first paint, then refresh in the background (failed refreshes keep the snapshot)
- Menu lists skip disabled/hidden items, show check marks, and dedupe by path
- Hide modifier-only shortcut artifacts (some macOS items like "Arrange in Front" report an Option mask without any key — Raycast hides these too)
- Added a Show Menu action that opens an item's top-level menu; distinct "No Menu Items" / "No Results" empty states

## [Initial Version] - {PR_MERGE_DATE}
