# HammerWM Copilot Instructions

## Project Architecture

This is a Raycast extension that bridges **TypeScript/React** with **Hammerspoon Lua** for macOS space management. The core architecture follows a **bridge pattern** where TypeScript commands execute Lua scripts via AppleScript, with **Zustand** managing complex state.

### Key Components

- **Command Layer** (`src/*.ts`): Individual Raycast commands (`create-space.ts`, `remove-current-space.ts`, etc.)
- **Bridge Layer** (`src/utils/call-hammerspoon.ts`): Executes Lua code in Hammerspoon via AppleScript
- **Lua Layer** (`src/lua/space.lua`): Space management logic using Hammerspoon APIs
- **UI Layer** (`src/list-spaces.tsx`): React components for space visualization with small, focused components
- **State Layer** (`src/stores/space-store.ts`): Zustand store managing spaces, windows, and app icons
- **Utils Layer** (`src/utils/space.ts`): Bridge functions for space operations, window fetching, and error handling
- **Types Layer** (`src/types/space.ts`): TypeScript interfaces for Space and Window

### Critical Integration Pattern

All space operations follow this pattern:

```typescript
// 1. Define Lua code with proper escaping
const code = /* lua */ `
  local ok, err = hs.spaces.removeSpace(${spaceId})
  if not ok then
    error("Failed to remove space: " .. tostring(err))
  end
`;

// 2. Execute via AppleScript bridge
const result = await callHammerspoon(code);
```

### State Management with Zustand

**Critical**: All complex state is managed through the Zustand store in `src/stores/space-store.ts`:

```typescript
// Access the store
const { spaces, fetchSpaces, fetchSpaceWindows, appIcons } = useSpaceStore();

// Fetch spaces on component mount
useEffect(() => {
  fetchSpaces();
}, []);

// Fetch windows on-demand (only when space is selected)
const handleSpaceSelect = (spaceId: string) => {
  fetchSpaceWindows(spaceId);
};
```

**Performance Pattern**: Only fetch windows for a space when the user selects it, not all at once.

### Async Operation Handling

**Critical**: Hammerspoon space operations are asynchronous but error handling differs:

- Use `hs.timer.doAfter()` for operations that need delays
- Errors inside `doAfter` callbacks **cannot be caught** by the caller
- For reliable error handling, split operations into separate commands with `radash.sleep()` between them

Example problematic pattern:

```lua
-- DON'T: Errors won't propagate
hs.timer.doAfter(0.1, function()
  local ok, err = hs.spaces.removeSpace(spaceId)
  if not ok then
    error("This won't reach TypeScript") -- Lost!
  end
end)
```

Better pattern:

```typescript
// Split into steps with proper error handling
await switchToPreviousSpace();
await sleep(100); // radash.sleep for delay
await removeSpace(spaceId); // Errors propagate correctly
```

### Data Structures

```typescript
interface Space {
  id: string; // Hammerspoon space ID
  name: string; // Mission Control space name
  screenId: string; // Screen UUID
  screenName: string; // Human-readable screen name
  isCurrent: boolean; // Active space indicator
}

interface Window {
  id: string; // Window ID
  title: string; // Window title (truncated to reasonable length)
  application: string; // Application name
  isMinimized: boolean; // Minimized state
  isFullscreen: boolean; // Fullscreen state
}
```

### UI Conventions & Patterns

- **Component Structure**: Split UI into small, focused components but keep them in the same file
- **Screen Grouping**: Use `radash.group()` to group spaces by screen
- **Current Spaces**: Green color (`Color.Green`) with `CheckCircle` icon
- **List Sections**: Organized by screen name (not UUID)
- **Error Handling**: Use `tryit()` from radash + `showFailureToast()`
- **Window Filtering**: Skip windows where `application === "Raycast"`
- **Title Truncation**: Limit window titles to reasonable length for UI
- **App Icons**: Fetch and cache application icons using Raycast's `getApplications()` API

### Window Management Best Practices

1. **On-Demand Loading**: Only fetch windows when a space is selected
2. **Filter Raycast Windows**: Always exclude `window.application === "Raycast"`
3. **Icon Caching**: Cache application icons in the store to avoid repeated API calls
4. **Title Truncation**: Truncate long window titles for better UI experience

### Development Commands

```bash
pnpm dev          # Start development mode
pnpm build        # Build extension
pnpm lint         # ESLint check
pnpm fix-lint     # Auto-fix linting issues
```

### Common Patterns

1. **Lua Template Literals**: Use `/* lua */` comments for syntax highlighting
2. **Error Propagation**: Always check `ok, err` pattern in Lua operations
3. **String Escaping**: The `callHammerspoon` function handles escaping automatically
4. **Debug Command**: `debug.ts` executes clipboard Lua code - useful for testing
5. **JSDoc Comments**: Use JSDoc-style comments for all store methods and interfaces
6. **Async Utilities**: Use `radash.sleep()` for delays, `tryit()` for error handling

### Screen vs Space Concepts

- **Screen**: Physical/virtual monitor (has UUID and human name)
- **Space**: Virtual desktop on a screen (has ID and optional name)
- Always use `screenName` for UI display, `screenId` for operations

### File-Specific Guidance

#### `src/stores/space-store.ts`

- Central state management for all space-related data
- JSDoc comments for all methods and interfaces
- Manages spaces, windows, loading states, and app icons
- Follow the established patterns for async actions with error handling

#### `src/list-spaces.tsx`

- Main UI component using Zustand store
- Split into small, focused components within the same file
- Implements on-demand window loading
- Filters out Raycast windows
- Truncates window titles appropriately

#### `src/utils/space.ts`

- Bridge functions between TypeScript and Lua
- Consistent error handling patterns
- All functions should use `callHammerspoon()` for Lua execution

#### `src/lua/space.lua`

- Pure Lua logic for Hammerspoon APIs
- Careful error handling with `ok, err` patterns
- Proper space/screen name resolution logic
