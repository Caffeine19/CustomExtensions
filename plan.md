# Plan: Migrate to TypeScript Native (`tsgo`) + Oxlint

## Goal

Replace `typescript` with `@typescript/native-preview` (`tsgo`) for type-checking/compilation, and replace `eslint` with `oxlint` as the primary linter across the entire monorepo.

---

## Current State

| Area         | Current                                 | Version   |
| ------------ | --------------------------------------- | --------- |
| TypeScript   | `typescript`                            | `^5.8.2`  |
| Linter       | `eslint` + `@raycast/eslint-config`     | `^9.22.0` |
| Formatter    | `prettier`                              | `^3.5.3`  |
| Packages     | 13 Raycast extensions under `packages/` | —         |
| Config style | Per-package (no root tsconfig/eslint)   | —         |

### Key facts

- All 13 packages share **identical** `tsconfig.json` (strict, ES2023, react-jsx, isolatedModules)
- 10 packages use the **base** eslint config; 3 extend it (hammerwm → react, workspace/zentao → simple-import-sort)
- Build/dev/lint all run through `ray build` / `ray develop` / `ray lint` (Raycast CLI)
- `ray build` and `ray lint` internally invoke `tsc` and `eslint` — custom tooling must either replace those calls or run alongside them

---

## Phase 1: Add Oxlint (Low Risk — Additive)

Oxlint can run **alongside** ESLint. Start here because it requires no breaking changes.

### 1.1 Install oxlint at the root

```bash
pnpm add -Dw oxlint
```

### 1.2 Create root `.oxlintrc.json`

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "pedantic": "off",
    "nursery": "off",
  },
  "plugins": ["typescript", "react"],
  "ignorePatterns": ["**/node_modules/**", "**/dist/**", "**/.build/**"],
}
```

### 1.3 Add root-level `oxlint` script

```jsonc
// package.json (root)
{
  "scripts": {
    "oxlint": "oxlint --config .oxlintrc.json packages/",
    "lint": "turbo lint", // keep existing
    "lint:ox": "pnpm oxlint", // new fast lint
  },
}
```

### 1.4 Add Turborepo task (optional)

```jsonc
// turbo.json
{
  "tasks": {
    "oxlint": { "cache": true },
  },
}
```

### 1.5 Validate

```bash
pnpm oxlint          # should run clean or show only real issues
pnpm lint             # existing eslint still works
```

---

## Phase 2: Integrate `eslint-plugin-oxlint` (Deduplicate Rules)

Once oxlint is running clean, disable ESLint rules already covered by oxlint to avoid duplicate warnings and speed up the ESLint pass.

### 2.1 Install the plugin

```bash
pnpm add -Dw eslint-plugin-oxlint
```

### 2.2 Update each package's `eslint.config.js`

**Base packages (10 packages):**

```javascript
const { defineConfig } = require("eslint/config");
const raycastConfig = require("@raycast/eslint-config");
const oxlint = require("eslint-plugin-oxlint");

module.exports = defineConfig([
  ...raycastConfig,
  ...oxlint.buildFromOxlintConfigFile("../../.oxlintrc.json"),
]);
```

**hammerwm** (has react plugin):

```javascript
const { defineConfig } = require("eslint/config");
const raycastConfig = require("@raycast/eslint-config");
const reactPlugin = require("eslint-plugin-react");
const oxlint = require("eslint-plugin-oxlint");

module.exports = defineConfig([
  ...raycastConfig,
  {
    plugins: { react: reactPlugin },
    rules: { "react/jsx-first-prop-new-line": ["warn", "multiline"] },
  },
  ...oxlint.buildFromOxlintConfigFile("../../.oxlintrc.json"),
]);
```

**workspace / zentao** (have simple-import-sort — keep as-is, just append oxlint last).

### 2.3 Update CI / Turborepo lint command

Change the lint pipeline to run oxlint first (fast), then eslint (thorough):

```jsonc
// Per-package package.json scripts
{
  "scripts": {
    "lint": "oxlint --config ../../.oxlintrc.json . && ray lint",
  },
}
```

Or keep `ray lint` as-is and run `oxlint` separately at root level before Turbo.

### 2.4 Validate

```bash
pnpm lint             # no duplicate warnings between oxlint & eslint
pnpm oxlint           # fast pass
```

---

## Phase 3: Add TypeScript Native (`tsgo`) for Type-Checking

### ⚠️ Important Caveats

- `@typescript/native-preview` is a **preview/experimental** Go port of the TypeScript compiler
- As of early 2026 it targets **TypeScript 7.0** semantics and may have **behavioral differences** from tsc 5.x
- `ray build` uses `tsc` internally via the Raycast CLI — `tsgo` **cannot replace `ray build`**, only complement it
- Best used as a **fast type-check pass** alongside the existing `tsc`-based build

### 3.1 Install tsgo at the root

```bash
pnpm add -Dw @typescript/native-preview
```

### 3.2 Add a root type-check script

```jsonc
// package.json (root)
{
  "scripts": {
    "typecheck": "turbo typecheck",
    "typecheck:native": "tsgo --noEmit",
  },
}
```

Per-package script:

```jsonc
{
  "scripts": {
    "typecheck": "tsgo --noEmit -p tsconfig.json",
  },
}
```

### 3.3 Verify tsconfig compatibility

`tsgo` reads `tsconfig.json` the same way as `tsc`. The current config should work:

```jsonc
{
  "compilerOptions": {
    "lib": ["ES2023"],
    "module": "commonjs",
    "target": "ES2023",
    "strict": true,
    "isolatedModules": true, // tsgo benefits from this
    "jsx": "react-jsx",
  },
}
```

If `tsgo` reports new errors due to stricter checking, fix them — they're likely real issues.

### 3.4 Validate

```bash
pnpm typecheck        # fast native type-check across all packages
pnpm build            # ray build still uses tsc — must still pass
```

### 3.5 (Future) Replace `tsc` entirely

Once `tsgo` reaches stable and the Raycast CLI supports it (or allows custom compiler), swap `ray build` internals. Until then, keep both:

- `tsgo --noEmit` → fast CI type-check (seconds instead of minutes)
- `ray build` → production build (still uses `tsc`)

---

## Phase 4: (Optional) Fully Replace ESLint with Oxlint

Only do this if/when oxlint covers all rules you need, including `@raycast/eslint-config` rules.

### 4.1 Audit rule coverage

```bash
# See which eslint rules oxlint already covers
npx @oxlint/migrate eslint.config.js
```

Run this in each package with custom eslint config (hammerwm, workspace, zentao).

### 4.2 If coverage is sufficient

1. Remove `eslint`, `@raycast/eslint-config`, `eslint-plugin-oxlint`, and any eslint plugins from all packages
2. Delete all `eslint.config.js` files
3. Change scripts:

```jsonc
{
  "scripts": {
    "lint": "oxlint --config ../../.oxlintrc.json .",
    "fix-lint": "oxlint --config ../../.oxlintrc.json --fix .",
  },
}
```

4. Update Turborepo accordingly

### 4.3 Blockers for full replacement

- `@raycast/eslint-config` may contain custom rules with no oxlint equivalent
- `eslint-plugin-react` `jsx-first-prop-new-line` — check if oxlint has an equivalent
- `eslint-plugin-simple-import-sort` — oxlint has `sort-imports` in the `import` plugin but it may not behave identically
- `ray lint` command (`ray lint` runs eslint internally) — would need to stop using it or the Raycast CLI would need to support oxlint

**Recommendation:** Stay in Phase 2 (oxlint + eslint hybrid) until the Raycast CLI officially supports oxlint or until you no longer depend on `ray lint`.

---

## Phase 5: Cleanup & Normalization (Housekeeping)

While making these changes, also normalize inconsistencies found during the audit:

- [ ] Normalize `@raycast/api` version across all packages (currently ranges `^1.96.0` → `^1.104.4`)
- [ ] Normalize `radash` version (`^12.1.0` vs `^12.1.1`)
- [ ] Fix whitespace in `packages/mirror-screen/tsconfig.json` to match others
- [ ] Consider a root `tsconfig.base.json` that packages extend (reduces 13× duplication)
- [ ] Standardize `eslint.config.js` module format (zentao uses ESM, all others use CJS)

---

## Execution Order

```
Phase 1  →  Phase 2  →  Phase 5  →  Phase 3  →  Phase 4 (when ready)
 (oxlint     (dedupe     (cleanup)    (tsgo        (drop
  additive)   rules)                   typecheck)   eslint)
```

**Estimated effort:** ~2-3 hours for Phases 1-3 + 5. Phase 4 is a future milestone.

---

## Risk Assessment

| Risk                                                            | Likelihood | Mitigation                                                                     |
| --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `ray build` / `ray lint` doesn't support tsgo/oxlint            | High       | Keep `ray` commands using tsc/eslint; run tsgo/oxlint as **additional** checks |
| `tsgo` reports false positives or different errors than tsc 5.x | Medium     | Run both in CI, diff output; fix genuine issues                                |
| oxlint missing rules from `@raycast/eslint-config`              | Medium     | Keep eslint for uncovered rules (Phase 2 hybrid)                               |
| `@typescript/native-preview` breaking changes before stable     | Medium     | Pin version; only use for `--noEmit` type-checking, not building               |
