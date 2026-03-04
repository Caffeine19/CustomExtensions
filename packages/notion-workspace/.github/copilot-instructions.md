# Copilot Instructions for Notion Workspace

## Project Overview

This is a **Raycast extension** for switching between Notion workspaces using Hammerspoon automation. It's a single-command extension that displays a list of workspace options.

## Architecture & Key Components

### Extension Structure

- **Single Command**: `list-workspaces` - The main (and only) command defined in `package.json`
- **Entry Point**: `src/list-workspaces.tsx` - React component using Raycast's List UI
- **Automation Layer**: `src/utils/call-hammerspoon.ts` - AppleScript bridge to Hammerspoon

### Data Flow

1. User invokes command → Raycast loads `list-workspaces.tsx`
2. Component renders hardcoded workspace list (`ITEMS` array)
3. User selects workspace → Currently only copies title to clipboard
4. Future: Selection should trigger Hammerspoon automation via `callHammerspoon()`

## Development Patterns

### Raycast-Specific Conventions

- Use `@raycast/api` components: `List`, `ActionPanel`, `Action`, `Icon`
- Commands are React components exported as default
- Actions are defined in `ActionPanel` within `List.Item`
- Icons from `Icon` enum, not custom assets

### Current Implementation Gaps

- **Hardcoded Data**: `ITEMS` array should be dynamic or configurable
- **Missing Integration**: `callHammerspoon()` utility exists but isn't used
- **Incomplete Actions**: Only clipboard copy, missing workspace switching logic

### Code Style

- **TypeScript**: Strict mode enabled, ES2023 target
- **Prettier**: 120-char line width, double quotes
- **ESLint**: Raycast's official config (`@raycast/eslint-config`)

## Development Workflow

### Commands

```bash
# Development with hot reload
pnpm dev  # or ray develop

# Build for production
pnpm build  # or ray build

# Linting and formatting
pnpm lint
pnpm fix-lint
```

### Testing

- No test framework configured (typical for simple Raycast extensions)
- Manual testing via `pnpm dev` and Raycast interface

## Integration Points

### Hammerspoon Bridge

- `callHammerspoon()` executes Lua code in Hammerspoon via AppleScript
- Handles string escaping for Lua code injection
- Error handling with `HAMMERSPOON_ERROR:` prefix pattern
- **Usage Pattern**: Pass Lua code as string to switch Notion workspaces

### Raycast API Patterns

- **List Items**: Use `key`, `icon`, `title`, `subtitle`, `accessories`, `actions`
- **Actions**: Prefer built-in actions (`Action.CopyToClipboard`) when available
- **Icons**: Use semantic icons from `Icon` enum (`Icon.Bird` currently used)

## Key Files to Understand

- `package.json`: Extension manifest with command definitions
- `src/list-workspaces.tsx`: Main UI component and data structure
- `src/utils/call-hammerspoon.ts`: System automation utility

## Next Development Steps

1. Replace hardcoded `ITEMS` with dynamic workspace detection
2. Implement actual workspace switching using `callHammerspoon()`
3. Add keyboard shortcuts for direct workspace access
4. Consider adding workspace configuration/preferences
