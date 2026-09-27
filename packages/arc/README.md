# Arc

Search and quickly navigate your [Arc](https://arc.net) browser's history and open tabs. You can open recent tabs in Arc or Little Arc as well as copy websites to quickly share them.

## Launch with Remote Debugging

The **Launch with Remote Debugging** command starts Arc with the Chrome DevTools Protocol (CDP) enabled on port `9333` (`--remote-debugging-port=9333 --remote-allow-origins=*`), which is handy for debugging Arc from tools like Chrome DevTools or Playwright.

- If Arc is not running yet, it is launched with the debugging flags directly.
- If Arc is already running without the flags, you are asked to kill & relaunch it (flags cannot be added to a running instance).
- If Arc is already running with the flags, nothing happens.
- Every other command in this extension also cold-launches Arc with these flags when it is not running, as long as the **Enable Remote Debugging** preference (on by default) is turned on in the extension settings. This command always uses the flags.

## Fork Notes

This extension is a fork of the [official Arc extension](https://www.raycast.com/the-browser-company/arc) by The Browser Company (originally authored by `thomas` and contributors), migrated into the CustomExtensions monorepo. Changes compared to upstream:

- Added the "Launch with Remote Debugging" command (previously the standalone `arc-remote-debugging` extension)
- Cold starts now launch Arc with remote debugging flags instead of a plain `activate`
