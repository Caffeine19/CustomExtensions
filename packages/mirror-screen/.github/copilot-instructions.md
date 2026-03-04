# Copilot Instructions: Mirror Screen Raycast Extension

## Architecture Overview

This is a Raycast extension that controls macOS Screen Mirroring through a **hybrid TypeScript + Lua architecture**:

- **UI Layer**: React components using Raycast API (`src/mirror-screen.tsx`)
- **Bridge Layer**: TypeScript utilities that generate and execute Lua scripts (`src/utils/`)
- **Automation Layer**: Lua scripts that interact with macOS accessibility APIs via Hammerspoon

## Key Integration Pattern: TypeScript → AppleScript → Hammerspoon → Lua

The core automation flow follows this chain:

1. TypeScript functions in `src/utils/{findDisplays,toggleDisplay}.ts` generate Lua scripts as strings via `getCode()`
2. `callHammerspoon()` wraps Lua in AppleScript and executes via `runAppleScript()`
3. Hammerspoon executes the Lua code to interact with macOS Control Center
4. Results are JSON-encoded in Lua and parsed back to TypeScript interfaces

Example from `toggleDisplay.ts`:

```typescript
export async function toggleDisplay(displayTitle: string): Promise<ToggleDisplayResult> {
  const luaCode = getCode(displayTitle); // Generate Lua as string
  const response = await callHammerspoon(luaCode); // Execute via AppleScript bridge
  return JSON.parse(response); // Parse Lua JSON response
}
```

## Module Structure

**Focused Utility Modules** - Each handles one core operation:

- `src/utils/findDisplays.ts` - Discovers available displays via Control Center
- `src/utils/toggleDisplay.ts` - Toggles mirroring status of specific displays
- `src/utils/call-hammerspoon.ts` - AppleScript bridge to Hammerspoon

**Function Naming Convention**:

- `getCode()` - Private functions that generate Lua script strings
- `findDisplays()`, `toggleDisplay()` - Public async API functions

## Critical Dependencies

- **Hammerspoon**: Must be installed and running on the user's Mac for any functionality to work
- **Accessibility Permissions**: Required for Lua scripts to interact with Control Center UI elements
- **Control Center**: Extension specifically targets macOS Control Center's Screen Mirroring interface

## State Management Patterns

- Use `useCachedState<ScreenDisplay[]>` for persisting discovered displays between sessions
- Display state includes `"(Currently Mirroring)"` suffix in titles to indicate active status
- UI logic strips this suffix for clean display while preserving it for toggle operations

## Lua Script Patterns

When modifying Lua generation functions:

- Always include recursive depth limits (`depth > 10`) to prevent infinite loops
- Use `hs.timer.usleep()` for timing between UI interactions (500ms for dialogs, 300ms for actions)
- Include comprehensive logging with emoji prefixes for debugging: `logger.i("🔍 Starting search...")`
- End scripts with `hs.eventtap.keyStroke({}, "escape")` to close Control Center dialogs
- Structure as embedded template literals with `${variable}` interpolation
- Use early returns to reduce nesting and improve readability

## Lua Script Synchronization

**CRITICAL**: This project maintains Lua code in two places that must stay in sync:

- **String templates** in TypeScript files (`src/utils/*.ts`) - used at runtime
- **Standalone Lua files** (`src/lua/*.lua`) - used for development and reference

**When updating Lua code:**

1. If editing string template in TS file → also update the corresponding `.lua` file
2. If editing standalone `.lua` file → also update the string template in the related TS file

**File mappings:**

- `src/utils/findDisplays.ts` ↔ `src/lua/findDisplays.lua`
- `src/utils/toggleDisplay.ts` ↔ `src/lua/toggleDisplay.lua`

This ensures consistency between runtime code and development reference files.

## UI Convention: Icon + Color Coding

Display status is indicated through icon and color combinations:

```typescript
icon={{
  source: isCurrentlyMirroring ? Icon.Circle : Icon.Monitor,
  tintColor: isCurrentlyMirroring ? "#00FF00" : undefined,
}}
```

- 🟢 Green circle: Currently mirroring
- 🖥️ Monitor icon: Available displays

## Development Workflow

- `npm run dev`: Start Raycast development mode
- `npm run build`: Build extension for production
- Debug Lua execution via console logs in `callHammerspoon()` - both AppleScript and returned values are logged

## Error Handling Pattern

All async operations follow this pattern:

```typescript
try {
  setIsLoading(true);
  const result = await utilityFunction();
  // Handle success/failure with appropriate toast messages
} catch (error) {
  console.error("Context-specific error message:", error);
  showToast({ style: Toast.Style.Failure, title: "User-friendly title" });
} finally {
  setIsLoading(false);
}
```
