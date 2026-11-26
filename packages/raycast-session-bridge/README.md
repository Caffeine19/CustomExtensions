# Raycast Session Bridge

Companion to the `copilot` Raycast extension. Receives

```
vscode[-insiders]://caffeinecat.raycast-session-bridge/open?link=<encodeURIComponent(agent-host-session://…)>
```

and forwards `link` to the workbench opener service (`vscode.open`), whose agent-session opener
reveals an already-open chat editor (including inactive tabs) and otherwise opens the chat in the
sidebar.

Without this extension the Raycast extension falls back to its plain `vscode://file…?session=…`
deep link (which always opens the sidebar).

## Develop

```bash
pnpm build   # tsc -> dist/extension.js
```

Install by copying this folder to `~/.vscode{,-insiders}/extensions/caffeinecat.raycast-session-bridge-0.0.1`,
then reload the window.
