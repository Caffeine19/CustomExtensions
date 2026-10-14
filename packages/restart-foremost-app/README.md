# Restart Foremost App

Safely restart the frontmost application — quit it, wait until it is really gone, then relaunch and verify that a fresh instance appeared.

## Why the ceremony?

Killing an app and immediately calling `open` is a classic race: LaunchServices can hand back the still-tearing-down old process (error `-600`), so the app looks "relaunched" but nothing ever starts again. This command:

1. Locates the frontmost app's process (by executable path inside its bundle)
2. Sends SIGTERM and polls until the process is really gone (SIGKILL escalation after 10 s)
3. Relaunches through LaunchServices (`open -b <bundle id>`)
4. Verifies a **new** process (different PID) actually appeared, retrying the launch up to 3 times

## Notes

- Finder and Raycast itself are never restarted
- Unsaved-document prompts are skipped by design (SIGTERM/SIGKILL), which is what "restart" means here
- macOS only
