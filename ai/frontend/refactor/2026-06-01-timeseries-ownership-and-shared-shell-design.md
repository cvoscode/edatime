# Timeseries Ownership And Shared Shell Design

> Continues the canonical frontend direction already documented in `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md` and `ai/frontend/refactor/2026-05-31-analysis-selection-unification-design.md`. This design does not replace the current architecture. It makes the existing boundaries real owners.

## Goal

Make Timeseries the first fully-owned feature entrypoint, promote the shared analysis shell and shared chip orchestration to real canonical owners, and remove duplicate frontend wiring without changing visible behavior or the frontend/backend contract.

## Scope

This design covers:

- the Timeseries feature runtime and control wiring
- the shared analysis shell used by FFT, heatmap, and spectrogram
- shared chip-list orchestration used by Timeseries and FFT, with room for causal reuse later
- the frontend/backend contract seam for Timeseries transport and analytics page usage

This design does not cover:

- route changes
- payload shape changes
- a store rewrite
- a new page framework
- a broad causal-page refactor
- backend handler rewrites except for small contract-adjacent helper extraction if it becomes justified during implementation

## Constraints

- Preserve current routes, page ids, DOM ids, export button ids, and export filenames.
- Preserve current user-visible behavior. Small internal cleanup is welcome, but the user should not notice a behavior change.
- Preserve the current backend/frontend contract described in `ai/contract.md`.
- Keep `frontend/src/services/api/*` as the only transport owner.
- Keep `frontend/src/pages/shared/*` as the shared page-shell owner.
- Keep `frontend/src/ui/*` as the shared rendering/composition owner.
- Keep `frontend/src/features/*` and `frontend/src/pages/*` as consumers of those shared surfaces, not alternate owners.

## Current Problems

### 1. Timeseries ownership is split across too many files

The Timeseries flow is currently spread across:

- `frontend/src/app.ts`
- `frontend/src/pages/timeseriesPage.ts`
- `frontend/src/features/timeseries/columnsController.ts`
- `frontend/src/features/timeseries/actions.ts`
- `frontend/src/features/timeseries/entrypoint.ts`

This causes duplicate wiring of:

- `buildColumnToggles(...)`
- `buildRangeControls()`
- dataset search initialization
- filter-reset and range-reset event listeners
- page bootstrap sequencing

The feature already has an entrypoint module, but that entrypoint is not yet the single owner.

### 2. `columnsController.ts` is an oversized mixed-responsibility module

`frontend/src/features/timeseries/columnsController.ts` currently mixes:

- chip rendering orchestration
- modal lifecycle wiring
- range-chip rendering delegation
- color-by control composition
- metadata bar updates
- collapse and keyboard glue

This makes one file the de facto owner of several separate UI surfaces.

### 3. Shared helpers still stop short of the real repeated glue

Two shared seams already exist:

- `frontend/src/pages/shared/analysisPageRuntime.ts`
- `frontend/src/ui/seriesChipList.ts`

Both are useful, but callers still carry duplicated orchestration:

- per-page export wiring conventions
- per-page empty-state synchronization patterns
- chip rerender repair and transient state preservation
- repetitive post-render DOM patch-up

### 4. Page modules still know too much about transport-adjacent details

The external contract is already acceptable, but page/controller modules still participate in:

- ISO date conversion decisions
- chart width selection for `/api/data`
- analytics follow-up sequencing after render

Those concerns should stay behaviorally unchanged, but their ownership should be made clearer.

## Backend/Frontend Contract

The public contract remains unchanged.

### Stable API surface

Timeseries continues to consume:

- `GET /api/data`
- `GET /api/metadata`
- analytics endpoints already used by FFT and spectrogram-related flows

The request/response semantics described in `ai/contract.md` remain fixed, especially:

- `start` and `end` query parameters as ISO datetimes for `/api/data`
- Arrow IPC transport and timestamp-column resolution
- headers such as `x-edatime-time-column`, `x-edatime-downsampled`, `x-edatime-returned-rows`, and `x-edatime-target-points`

### Ownership rule

- `frontend/src/services/api/*` owns URL building, `fetch(...)`, header inspection, Arrow parsing, and transport normalization.
- `frontend/src/pages/*` owns page-specific render/fetch orchestration.
- `frontend/src/features/*` owns UI policy and feature wiring.
- `frontend/src/ui/*` owns shared DOM rendering and interaction patterns.

The refactor should move page and feature code away from transport details, not alter the transport contract.

## Recommended Approach

Use a Timeseries-first seam extraction.

This means:

- make `frontend/src/features/timeseries/entrypoint.ts` the single public Timeseries wiring surface
- keep `frontend/src/pages/timeseriesPage.ts` as the chart/data controller
- split `columnsController.ts` into focused Timeseries modules
- strengthen `analysisPageRuntime.ts` into the real shared analysis-page shell owner
- strengthen `seriesChipList.ts` into the real shared chip-orchestration owner

This is the best balance of payoff and risk because it fixes the biggest hotspot while only extracting shared layers that already have live consumers.

## Target Architecture

### A. Timeseries controller stays page-owned

`frontend/src/pages/timeseriesPage.ts` remains responsible for:

- `fetchAndRender()`
- `renderCurrentData()`
- `onZoomRangeChange()`
- data-driven empty-state decisions
- chart range sync
- analytics follow-up after successful Timeseries render

It should not own:

- search-input wiring
- filter modal bootstrapping
- reset/clear event registration
- chip-list composition mechanics

### B. Timeseries entrypoint becomes the single feature owner

`frontend/src/features/timeseries/entrypoint.ts` should become the only public feature wiring surface for Timeseries controls.

It should own:

- control initialization
- composition of child Timeseries control modules
- public rebuild hooks for column chips and range chips
- registration of feature-scoped DOM/event listeners

`frontend/src/app.ts` should depend on the entrypoint, not on internal Timeseries control modules directly.

### C. Split Timeseries control responsibilities into focused modules

The current `columnsController.ts` should stop being the effective owner of every Timeseries control concern.

Target module split:

- `columnsController.ts`
  - thin composition facade only
- `filterModalController.ts`
  - column filter modal lifecycle and apply/clear logic
- `rangeControls.ts`
  - render-only owner of selected-column and adaptive-filter range chips
- `chipComposition.ts`
  - state-to-item composition and feature callbacks
- `columnSelection.ts`
  - selection sanitization and adaptive-target validity rules
- `colorByControl.ts`
  - color-by UI ownership

If a small extra renderer module is needed during implementation, it is acceptable, but the end state should keep responsibilities narrow.

### D. Shared analysis shell becomes the real owner

`frontend/src/pages/shared/analysisPageRuntime.ts` should own:

- lifecycle registration
- lazy empty-state controller creation
- standard export binding lifecycle
- shared status update helpers
- optional common empty-state synchronization hooks where they remove real duplication

It should not own:

- FFT trace state
- heatmap rendering
- spectrogram chart setup
- page-specific fetch logic

### E. Shared chip orchestration becomes the real owner

`frontend/src/ui/seriesChipList.ts` should own:

- stable chip rendering
- keyboard interaction
- optional preservation of transient chip DOM state
- post-render chip attribute/class application
- shared color-update plumbing

FFT and Timeseries should rely on that behavior instead of manually capturing and restoring chip DOM state.

## Data Flow

### Timeseries

1. `app.ts` creates the Timeseries page controller and the Timeseries feature entrypoint.
2. Metadata bootstrap hands control initialization to the entrypoint.
3. Feature modules sanitize state and compose renderable chip/control items.
4. Shared renderers paint chips and controls.
5. Feature callbacks update store state and trigger controller work.
6. The page controller fetches and renders chart data through `services/api/timeseries.ts`.

### Analysis pages

1. Page module creates `analysisPageRuntime(...)`.
2. Shared runtime binds lifecycle, exports, and empty-state ownership.
3. Page module retains compute/fetch/render logic.
4. Page module reports shell state through runtime update methods.

## Error Handling

- Feature modules should not swallow controller or fetch errors.
- Shared UI helpers should not own toast policy or business policy.
- Shared runtime should not absorb page-specific error semantics.
- Backend helper extraction, if any, must preserve current `AppError` and response semantics.

## Testing Strategy

### Frontend

Strengthen focused coverage around:

- `frontend/src/pages/shared/analysisPageRuntime.test.ts`
  - export binding occurs once
  - empty-state controller stays lazy
  - status updates remain stable
- `frontend/src/ui/seriesChipList.test.ts`
  - preserved chip state works without caller patch-up
  - keyboard and color-update behavior remain intact
- `frontend/src/features/timeseries/entrypoint.test.ts`
  - entrypoint becomes the single public control-wiring surface
- `frontend/src/features/timeseries/columnsController.test.ts`
  - facade behavior remains stable while responsibilities move behind it
- `frontend/src/pages/fftPage.test.ts`
  - chip loading state no longer depends on local manual restoration
- `frontend/src/pages/heatmapPage.test.ts`
- `frontend/src/pages/spectrogramPage.test.ts`
  - shared runtime integration remains behavior-preserving

### Backend

No backend work is required for the first implementation wave. If implementation reveals repeated analytics query normalization worth extracting, keep tests narrow and contract-focused.

## Migration Sequence

### Phase 1: Strengthen shared analysis shell

- make `analysisPageRuntime.ts` the real shared owner for page shell concerns
- remove duplicated export/empty-state shell glue from FFT, heatmap, and spectrogram

### Phase 2: Strengthen shared chip orchestration

- make `seriesChipList.ts` own preserved chip-state behavior that FFT and Timeseries both need
- remove manual DOM repair logic from consumers

### Phase 3: Make Timeseries entrypoint the real owner

- move direct control wiring out of `app.ts`
- keep `timeseriesPage.ts` as controller
- split `columnsController.ts` into focused control owners behind a thin facade

### Phase 4: Drain top-level duplicate wiring

- route all Timeseries-specific control initialization through the feature entrypoint
- keep `app.ts` as a thinner application bootstrapper

### Phase 5: Contract-adjacent cleanup only if needed

- extract helper logic only if implementation exposes repeated transport-adjacent glue
- do not change routes or payload semantics

## Risks

- Timeseries has a large implicit dependency graph through `window` events and shared store state, so changes must land in small steps.
- `columnsController.ts` currently hides several side effects behind a single import surface, so tests must be improved before aggressive movement.
- `app.ts` still coordinates many boot-time behaviors, so the entrypoint handoff needs to be incremental.

## Validation

For the implementation wave, prefer:

- `npm run validate`
- targeted Vitest runs for shared shell, shared chip list, and Timeseries feature modules
- smoke checks for Timeseries, FFT, heatmap, and spectrogram page activation

The end state should preserve behavior while making ownership obvious from the import graph.
