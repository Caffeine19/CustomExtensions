# In-App Shortcuts

Browse the per-app keyboard shortcuts registered by your Hammerspoon configuration (`registerInAppShortcut`), grouped by application with real macOS app icons.

## How it works

The extension queries Hammerspoon live over AppleScript (`__IN_APP_SHORTCUTS__.list()`), which is exported by `Utils/registerInAppShortcut.lua` in the Hammerspoon config. Hammerspoon must be running.
