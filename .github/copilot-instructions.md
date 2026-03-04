# Raycast Custom Extensions — Copilot Instructions

## Monorepo Architecture

This is a **pnpm + Turborepo** monorepo of independent Raycast extensions under `packages/`. Each package is a standalone Raycast extension with its own `package.json`, commands, and assets. Extensions are **never shared as npm packages** — they are published individually to the Raycast Store via `npx @raycast/api@latest publish`.

### Build & Dev Commands

```bash
# Root-level (runs across all packages via Turborepo)
pnpm run build        # ray build all packages
pnpm run lint         # ray lint all packages
pnpm run dev          # ray develop (persistent, per-package)

# Per-package (cd into packages/<name> first)
pnpm dev              # Hot-reload in Raycast
pnpm build            # Production build
pnpm lint             # Lint check
pnpm fix-lint         # Auto-fix lint issues
```

No test framework is configured — testing is manual via `pnpm dev` and the Raycast interface.

## Core Integration Pattern: TypeScript → AppleScript → Hammerspoon → Lua

Most extensions automate macOS via a **bridge pattern**: TypeScript constructs Lua code as template literal strings, which `callHammerspoon()` escapes, wraps in AppleScript, and executes in Hammerspoon.

```typescript
// src/utils/call-hammerspoon.ts (copy-pasted in 5+ packages)
const escapedCode = code.replace(/\\/g, "\\\\").replace(/"/g, '\\"')...;
const script = `tell application "Hammerspoon" execute lua code "${escapedCode}" end tell`;
const res = await runAppleScript(script);
if (res.startsWith("HAMMERSPOON_ERROR:")) throw new Error(...);
```

Some extensions use **direct AppleScript** without Hammerspoon (e.g., `universal-control`, `pointer-control`).

When Lua code is maintained in both inline TS strings and standalone `.lua` files (e.g., `mirror-screen`), **keep both in sync** — the TS string is used at runtime, the `.lua` file is for development reference.

## Command Structure: Two Modes

**No-view commands** (`"mode": "no-view"` in package.json) — async functions for fire-and-forget actions:

```typescript
export default async function Command() {
  try {
    await callHammerspoon(luaCode);
    await showHUD("Done");
  } catch (error) {
    await showHUD(`Error: ${error}`);
  }
}
```

**View commands** (`"mode": "view"`) — React components returning Raycast UI (`List`, `Grid`, `Form`):

```typescript
export default function Command() {
  return <List>...</List>;
}
```

## Conventions & Patterns

### Dependencies

All packages share identical dev dependencies (`typescript ^5.8.2`, `eslint ^9.22.0`, `prettier ^3.5.3`, `@raycast/eslint-config ^2.0.4`). Runtime dependencies always include `@raycast/api` and `@raycast/utils`. Utility-heavy packages also use `radash`.

### TypeScript Config

All packages use **identical** `tsconfig.json`: strict mode, `ES2023` target, `isolatedModules: true`, `react-jsx`. Do not modify per-package — if a change is needed, apply it everywhere.

### ESLint Config

Base config is `@raycast/eslint-config` via `eslint.config.js`. Some packages extend with plugins (`eslint-plugin-react` in hammerwm, `eslint-plugin-simple-import-sort` in workspace).

### Error Handling

- **No-view commands**: `try/catch` + `showHUD()` for simple feedback
- **View commands**: `try/catch` + `showToast({ style: Toast.Style.Failure, ... })` with typed error messages
- **Functional style** (some packages): `radash.tryit()` for tuple-based error handling

### State Management

- Most packages: plain `useState`/`useEffect`
- Caching: `useCachedState` or `useCachedPromise` from `@raycast/utils`
- Complex state: `zustand` (only in hammerwm's `src/stores/space-store.ts`)

### File Organization

```
packages/<name>/
  package.json          # Raycast extension manifest (commands, preferences)
  src/
    <command-name>.ts   # No-view command (async function)
    <command-name>.tsx  # View command (React component)
    utils/              # Shared utilities (callHammerspoon, helpers)
    types/              # TypeScript interfaces (when complex enough)
    stores/             # Zustand stores (hammerwm only)
    lua/                # Standalone Lua reference files (when applicable)
    constants/          # Enums, color maps, status definitions
  assets/               # Icons and images
  doc/                  # Screenshots for store listing
```

### Lua Code in TypeScript

Tag inline Lua with `/* lua */` comment for editor syntax highlighting:

```typescript
const code = /* lua */ `
  local ok, err = hs.spaces.removeSpace(${spaceId})
  if not ok then error("Failed: " .. tostring(err)) end
`;
```

## Package-Specific Instructions

Some packages have their own `.github/copilot-instructions.md` with domain-specific guidance:

- **hammerwm**: Zustand store patterns, async Hammerspoon caveats, space/screen concepts
- **mirror-screen**: Dual Lua maintenance (TS strings ↔ `.lua` files), UI accessibility automation
- **notion-workspace**: Planned integration patterns, current implementation gaps
- **zentao**: Chinese comments convention, HTML scraping patterns, i18n system, `dayjs` for dates

Always check for a package-level instructions file before working in a package.
