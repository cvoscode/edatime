# Fix Vite "Dynamic import will not move module into another chunk" Warnings

> **Status:** Draft
> **Date:** 2026-06-08
> **Scope:** Frontend (Vite production build warnings)
> **Reference architecture:** `ai/frontend/refactor/2026-06-01-frontend-modularization-staged-design.md`

## Problem

Vite's build emits the following 7 warnings because several modules are both statically and dynamically imported:

```
(!) src/utils/platform.ts       — dynamic: scatter/runtime.ts    | static: app.ts, app/webgpuGuard.ts, chart/DataChart.ts, chart/FftChart.ts, scatter/scatterPage.ts
(!) src/scatter/state.ts        — dynamic: scatter/export.ts     | static: scatter/controls.ts, scatter/correlationsPanel.ts, scatter/export.ts, scatter/matrix.ts, scatter/rendering.ts, scatter/runtime.ts, scatter/scatterPage.ts
(!) src/features/upload/databaseSource.ts — dynamic: ui/upload.ts | static: ui/upload.ts
(!) src/utils/palette.ts        — dynamic: bootstrap/commands.ts | static: app/shell.ts, bootstrap/commands.ts
(!) src/utils/provenance.ts     — dynamic: bootstrap/commands.ts | static: app/shell.ts
(!) src/ui/settingsPanel.ts     — dynamic: bootstrap/commands.ts, ui/pageNavigation.ts | static: app/shell.ts
(!) src/ui/guidedWorkflow.ts    — dynamic: bootstrap/commands.ts | static: app/shell.ts
(!) src/utils/session.ts        — dynamic: bootstrap/commands.ts | static: bootstrap/sessionBootstrap.ts
```

When a module is reachable via a static `import` anywhere in the dependency graph, Rollup keeps it in the main bundle and the dynamic `import()` call becomes a no-op for chunk-splitting. The warning is Vite telling us: "you wrote `import()` here but it has no effect."

## Root Cause Analysis

These warnings come from a **mixed convention**: the codebase has both static and dynamic imports of the same module, often within the same file. There are three structural causes:

1. **Defense-in-depth dynamic imports inside hot paths.** `ui/upload.ts` does `await import('../features/upload/databaseSource.js')` *and* has a top-level `import` of the same module. The dynamic form was probably added as a code-splitting attempt and then a static import was later added for typing/refactor reasons. The two coexist.

2. **Lazy-init pattern leaks into `scatter/runtime.ts`.** `isGPUAvailable()` does `await import('../utils/platform.js')`, but `platform.js` is already pulled in by `app.ts`, the chart modules, and `scatterPage.ts` at startup. The dynamic form gains nothing.

3. **Command-palette action closures use dynamic imports for what are essentially non-lazy operations.** `bootstrap/commands.ts` defines closures like `() => import('../utils/session.js').then(...)`. The intent appears to be deferring the work to click-time. However, `session.js` is statically imported by `bootstrap/sessionBootstrap.ts` (which is loaded by `app/shell.ts`), and `palette.ts` itself is statically imported by both `app/shell.ts` and `bootstrap/commands.ts`. None of these modules are lazy — they're in the main bundle.

4. **Transitive static imports defeat the dynamic form.** `ui/settingsPanel.ts` is statically imported by `app/shell.ts` (init call), so `bootstrap/commands.ts`'s `import('./settingsPanel.js')` and `ui/pageNavigation.ts`'s `import('./settingsPanel.js')` are no-ops.

5. **`scatter/state.ts` re-export pattern.** `scatter/state.ts` re-exports `scatterState` and helper functions from `store/scatterState.ts` and `scatter/helpers.ts`. `export.ts` statically imports from `./state.js` for some symbols and dynamically imports for `buildScatterQueryContext` (line 353). The dynamic form is gratuitous because the module is already in the main bundle via the static import on line 20.

## Goal

Eliminate all 7 Vite warnings by **choosing one import convention per module** (static OR dynamic), matching the choice to the module's real load semantics. Concretely:

- Modules needed at startup → static imports only
- Modules that are truly optional / large / click-time → dynamic imports only, and only at the call sites that need them

We are not adding lazy chunks here. The current bundle layout (one main `app.js` plus vendor chunks) stays the same. The work is **removing dead code and dead complexity**.

## Decision Per Module

| Module | Verdict | Reason |
|--------|---------|--------|
| `utils/platform.ts` | **Static only** | Used at app/chart init; cannot be deferred. Remove the `await import()` in `scatter/runtime.ts`. |
| `scatter/state.ts` | **Static only** | Re-export hub. Multiple call sites need it. Remove the dynamic `import()` in `scatter/export.ts`. |
| `features/upload/databaseSource.ts` | **Static only** | Static imports already present throughout. Remove the `await import()` in `ui/upload.ts`. |
| `utils/palette.ts` | **Static only** | Used at shell boot via `initCommandPalette()` and from `commands.ts`. Remove the dynamic `import()` in `commands.ts`. |
| `utils/provenance.ts` | **Static only** | Statically imported by `app/shell.ts` (init). Remove the dynamic `import()` in `commands.ts`. |
| `ui/settingsPanel.ts` | **Static only** | Statically imported by `app/shell.ts` (init). Remove the dynamic `import()` in `commands.ts` and `pageNavigation.ts`. |
| `ui/guidedWorkflow.ts` | **Static only** | Statically imported by `app/shell.ts` (init). Remove the dynamic `import()` in `commands.ts`. |
| `utils/session.ts` | **Static only** | Statically imported by `bootstrap/sessionBootstrap.ts`. Remove the dynamic `import()` in `commands.ts`. |

> **Why "static only" everywhere?** All eight modules are pulled into the main bundle by their existing static imports. Adding a parallel dynamic form provides no chunk-splitting benefit and adds an unnecessary `Promise` boundary that complicates testing and stack traces. If we ever need true lazy loading later (e.g., for the command palette or settings modal), that becomes its own refactor task with deliberate `manualChunks` placement in `vite.config.ts` and clean removal of the static imports.

## Implementation Tasks

The plan is split into 6 small, independent fix tasks. Each task touches one file (or a small group) and ends with a Vite build that drops the corresponding warning.

### Task 1: Fix `scatter/runtime.ts` dynamic import of `platform.ts`

**File:** `frontend/src/scatter/runtime.ts`

- Replace the `await import('../utils/platform.js')` inside `isGPUAvailable()` with a top-level static import.
- Update import path: add `import { defaultGpuPowerPreference, requestGpuAdapter } from '../utils/platform.js';` next to the existing imports.
- Inline the destructuring inside `isGPUAvailable()` to use the static names directly.

**Verification:** Run `npm run build`; confirm warning for `utils/platform.ts` disappears.

**Risk:** Low. `platform.ts` is already in the main bundle. `isGPUAvailable()` is only called from the scatter runtime path; both call patterns are async, so adding the static import does not change timing.

### Task 2: Fix `scatter/export.ts` dynamic import of `state.ts`

**File:** `frontend/src/scatter/export.ts`

- The file already has a static `import { appState, currentControls, type ScatterControls } from './state.js';` at line ~20.
- Add the missing symbol `buildScatterQueryContext` to that existing static import.
- Replace the dynamic call at line 353 (`(await import('./state.js')).buildScatterQueryContext({...})`) with a direct call: `buildScatterQueryContext({...})`.

**Verification:** Run `npm run build`; confirm warning for `scatter/state.ts` disappears. Run `npm run test -- scatter/export` if such a test exists; otherwise run `npm run test` to ensure no regressions.

**Risk:** Low. The static import path is already established. The dynamic import was gratuitous.

### Task 3: Fix `ui/upload.ts` dynamic import of `databaseSource.ts`

**File:** `frontend/src/ui/upload.ts`

- The file already has a static `import { handleDatabaseConnect, handleDatabaseDisconnect, handleDatabaseLoad, refreshDbTables, resetDatabaseStatusLoaded } from '../features/upload/databaseSource.js';` near the top.
- Add `syncDatabaseStatus` to the existing static import.
- Replace the dynamic call inside `syncDatabaseStatus()` (`const { syncDatabaseStatus: doSync } = await import('../features/upload/databaseSource.js');`) with a direct call: `await syncDatabaseStatus();`.
- If `syncDatabaseStatus` collides with the local function name, rename the local closure or the imported symbol using `as`. The current code uses the alias `doSync` to avoid recursion — keep that pattern by importing as `syncDatabaseStatus as doSync` and calling `doSync()`.

**Verification:** Run `npm run build`; confirm warning for `features/upload/databaseSource.ts` disappears. Run `npm run test -- ui/upload` if it exists; otherwise run the full test suite.

**Risk:** Low. The static import is already present and used by the rest of the file.

### Task 4: Fix `bootstrap/commands.ts` dynamic imports of `palette.ts`, `provenance.ts`, `settingsPanel.ts`, `guidedWorkflow.ts`, `session.ts`

**File:** `frontend/src/bootstrap/commands.ts`

- The file already has a static `import { registerCommands } from '../utils/palette.js';` and a `import type { PaletteCommand } from '../utils/palette.js';` at the top.
- Add static imports for the other modules whose actions are wrapped in dynamic `import()`:
  - `import { exportSessionToFile, importSessionFromFile } from '../utils/session.js';`
  - `import { toggleProvenance } from '../utils/provenance.js';`
  - `import { openPalette } from '../utils/palette.js';` (in addition to existing `registerCommands`)
  - `import { openSettingsModal } from '../ui/settingsPanel.js';`
  - `import { enableGuidedWorkflow, disableGuidedWorkflow, goToNextGuidedStep } from '../ui/guidedWorkflow.js';`
- Replace each dynamic action closure with a direct call. Concretely:
  - `action: () => import('../utils/session.js').then(({ exportSessionToFile }) => exportSessionToFile())` → `action: () => { exportSessionToFile(); }`
  - Similarly for the other 6 actions (session-load, provenance, cmd-palette, settings, workflow-enable, workflow-disable, workflow-next).
- Keep the function bodies side-effect only. If we want to be conservative, wrap each in a function that preserves `void` semantics: `action: () => { void exportSessionToFile(); }`.

**Verification:** Run `npm run build`; confirm warnings for `utils/palette.ts`, `utils/provenance.ts`, `ui/settingsPanel.ts`, `ui/guidedWorkflow.ts`, `utils/session.ts` all disappear. Run `npm run test -- bootstrap/commands` if it exists.

**Risk:** Low. The actions are still bound to the command palette and only fire on user invocation. The static imports do pull these modules into the main bundle, but they are already there via `app/shell.ts`.

### Task 5: Fix `ui/pageNavigation.ts` dynamic import of `settingsPanel.ts`

**File:** `frontend/src/ui/pageNavigation.ts`

- The dynamic import is on line 33 inside the `showPage` function: `const { openSettingsModal } = await import('./settingsPanel.js');`
- Add a top-level static import: `import { openSettingsModal } from './settingsPanel.js';`
- Replace the dynamic call with `openSettingsModal();`.

**Verification:** Run `npm run build`; confirm the second part of the `ui/settingsPanel.ts` warning disappears. Open the settings page in the running app and confirm the modal still opens.

**Risk:** Low. The static import matches what `app/shell.ts` already does at boot.

### Task 6: Confirm no new warnings and verify test suite passes

**Files:** (no edits)

- Run `npm run build` and confirm the 7 warnings are gone.
- Run `npm run test` and confirm all tests pass.
- Run `npm run check-frontend` (or the equivalent architecture check) and confirm no new boundary violations.

## Files Touched (Summary)

- `frontend/src/scatter/runtime.ts`
- `frontend/src/scatter/export.ts`
- `frontend/src/ui/upload.ts`
- `frontend/src/bootstrap/commands.ts`
- `frontend/src/ui/pageNavigation.ts`

## Out Of Scope

- Adding new lazy chunks via `manualChunks` in `vite.config.ts`.
- Refactoring `scatter/state.ts` to remove its re-export role.
- Changing the command palette to use truly lazy action loading (this would require removing the static imports in `app/shell.ts` and `bootstrap/sessionBootstrap.ts` first; that's a separate refactor).

## Verification

After all 6 tasks:

1. `npm run build` should produce no `(plugin vite:reporter)` warnings about dynamic vs. static imports.
2. `npm run test` should pass.
3. The dev server (`npm run dev`) should start cleanly.
4. Manual smoke test of the affected flows:
   - Timeseries page loads (uses `DataChart.ts` and `webgpuGuard.ts` → `platform.ts`)
   - Scatter page loads (uses `scatterPage.ts` → `platform.ts`)
   - Scatter export PNG/CSV/JSON buttons (uses `scatter/export.ts` → `state.ts`)
   - Upload page database connect/disconnect (uses `ui/upload.ts` → `databaseSource.ts`)
   - Command palette opens with Ctrl+K, and session-save / session-load / provenance / settings / workflow commands all fire
   - Sidebar nav "Settings" still opens the settings modal

## Notes

- This plan does **not** change runtime behavior, module semantics, or the public TypeScript signatures. Every replacement is 1:1.
- The fix deliberately keeps the existing bundle layout. The next refactor (per the staged design) can revisit true lazy loading for command palette actions and modal panels.
