# Frontend Feature-First Consolidation Design

> Refactor the live frontend into clearer app, page, feature, shared-runtime, and UI ownership layers while preserving the current Rust/TypeScript contract in `ai/contract.md`.

## Implementation Audit

Audit date: `2026-06-02`

Verified against the current codebase and targeted test suite:

- `frontend/src/pages/shared/pageRuntime.ts` and `analysisPageRuntime.ts` are implemented and verified.
- `frontend/src/pages/shared/requestTask.ts` is implemented and verified.
- `frontend/src/features/upload/*` exists and is wired through `createUploadEntrypoint(...)`.
- `frontend/src/scatter/runtime.ts` and `scatter/correlationsPanel.ts` exist and are active.
- `frontend/src/drift/runtime.ts` and `drift/viewModels.ts` exist and are active.
- `frontend/src/app/bootstrap/chartBootstrap.ts` and the split `app/shell/*` modules exist and are active.

Remaining architectural gaps after verification:

- `frontend/src/app.ts` is slimmer than before, but still heavier than the target composition-root end state.
- `frontend/src/scatter/scatterPage.ts`, `frontend/src/drift/driftPage.ts`, and `frontend/src/causal/causalPage.ts` remain large orchestration files even after helper extraction.
- `frontend/src/ui/upload.ts` is now a rendering surface plus facade, but still contains substantial DOM wiring.

This document now serves as an audited target-state record rather than a purely forward-looking design.

## Goal

Make the frontend easier to read, test, and extend by removing duplicate page wiring, shrinking mixed-responsibility files, and standardizing how pages own lifecycle, loading, empty states, and async work.

## Scope

This design covers:

- `frontend/src/app.ts` and the live `frontend/src/app/*` shell/bootstrap/runtime graph
- page controllers under `frontend/src/pages/*`, `frontend/src/scatter/*`, `frontend/src/drift/*`, and `frontend/src/causal/*`
- feature entrypoints under `frontend/src/features/*`
- shared runtime and UI seams under `frontend/src/pages/shared/*` and `frontend/src/ui/*`
- shared async/page helpers when they reduce repeated logic without changing behavior

This design does not cover:

- route changes
- DOM id renames
- export filename changes
- backend handler rewrites
- transport shape changes in `frontend/src/services/api/*`
- replacing the current DOM-driven frontend with a framework rewrite

## Constraints

- Preserve the frontend/backend contract documented in `ai/contract.md`.
- Keep `frontend/src/services/api/*` as the only transport owner.
- Preserve current user-visible workflows, page names, control ids, and export ids.
- Prefer extraction and ownership clarification over sweeping rewrites.
- Land the refactor in waves that can be tested independently.

## Contract Fence

The current Rust/TypeScript contract is not the problem.

The frontend should continue to treat the following as stable:

- `GET /api/metadata`
- `GET /api/data`
- `GET /api/analytics/*`
- `GET|POST /api/scatter/*`
- `POST /api/transform`
- `POST /api/analytics/remove_outliers`
- `POST /api/analytics/causal`
- `POST /api/drift/stats`
- upload and database routes documented in `ai/contract.md`

Ownership rule:

- `frontend/src/services/api/*` owns URL construction, fetch calls, headers, and payload parsing.
- `frontend/src/pages/*` owns render/fetch orchestration.
- `frontend/src/features/*` owns workflow and DOM wiring.
- `frontend/src/ui/*` and `frontend/src/pages/shared/*` own shared rendering and runtime behavior.

No part of this refactor should move fetch logic into `app/*`, `features/*`, or `ui/*`.

## Current Problems

### 1. `frontend/src/app.ts` still acts as both bootstrap and feature owner

It currently mixes:

- chart bootstrap and fallback behavior
- dataset lifecycle work
- timeseries controller composition
- global keyboard shortcuts
- analytics refresh coupling
- top-level page loading

That makes the composition root too large and forces page behavior to leak upward.

### 2. Shared page runtime behavior exists, but it is incomplete

`frontend/src/pages/shared/analysisPageRuntime.ts` already captures part of the repeated shell behavior, but pages still hand-roll or duplicate:

- loading visibility
- status updates
- empty-state coordination
- abortable request ownership
- page lifecycle conventions

The abstraction is useful, but it is not yet the canonical owner.

### 3. Timeseries is close to the right shape but still has scattered ownership

The current Timeseries split is better than the rest of the app, but there is still duplicated logic between:

- `frontend/src/app.ts`
- `frontend/src/pages/timeseriesPage.ts`
- `frontend/src/features/timeseries/*`

The page should own chart/data orchestration, the feature should own controls and workflow wiring, and `app.ts` should only compose them.

### 4. Several large pages still mix multiple architectural layers

The most obvious hotspots are:

- `frontend/src/scatter/scatterPage.ts`
- `frontend/src/drift/driftPage.ts`
- `frontend/src/ui/upload.ts`
- `frontend/src/causal/causalPage.ts`

These files combine lifecycle setup, fetch orchestration, local DOM wiring, derived state shaping, exports, and page runtime behavior.

### 5. Async request lifecycle code repeats across pages

Repeated patterns include:

- creating and replacing `AbortController`
- toggling loading elements
- ISO conversion for viewport-driven requests
- handling page-local error/status text
- sequencing refresh after successful responses

These are real duplicates and should converge on a shared page-level helper surface.

## Recommended Approach

Use a feature-first staged consolidation.

This approach keeps the current page model and API contract, but it makes each feature/page pair own one clear surface and extracts only the shared seams that already exist in more than one place.

Why this is the best option:

- lower risk than a shell-first rewrite
- higher payoff than UI-only component unification
- lets Timeseries serve as the reference pattern without making the whole app Timeseries-shaped
- supports targeted testing after each wave

## Target Architecture

### A. `app/*` becomes a thin composition layer

`frontend/src/app.ts` should only:

- create top-level runtime dependencies
- compose page controllers and feature entrypoints
- own startup order
- register global shell/bootstrap behavior

It should stop owning page-specific behavior and request lifecycle details.

### B. `pages/*` becomes the canonical page-controller layer

Each page controller should own:

- page-visible lifecycle
- fetch/render sequencing
- page-specific loading/empty/status transitions
- local chart/view coordination

Examples:

- `frontend/src/pages/timeseriesPage.ts`
- `frontend/src/pages/fftPage.ts`
- `frontend/src/pages/heatmapPage.ts`
- `frontend/src/pages/spectrogramPage.ts`
- `frontend/src/scatter/scatterPage.ts`
- `frontend/src/drift/driftPage.ts`
- `frontend/src/causal/causalPage.ts`

### C. `features/*` becomes the canonical feature-workflow layer

Feature entrypoints should own:

- DOM/event wiring for feature controls
- selection/filter workflow policy
- explicit `init()` and narrow rebuild/update hooks

They should not:

- call transport directly
- parse response payloads
- own unrelated page runtime behavior

### D. `pages/shared/*` owns shared page shell behavior

The shared page runtime should standardize:

- page lifecycle registration
- lazy empty-state ownership
- status writes
- loading visibility
- export binding
- optional abortable task helpers

It should not become a generic application framework or absorb page-specific compute logic.

### E. `ui/*` stays a rendering/composition layer

Shared UI modules should own:

- primitives and composites
- reusable empty-state and export behavior
- common modal and selector behavior
- stable chip list rendering

They should not become alternate owners of page workflow.

## Standard Runtime Shapes

### Page runtime shape

Each page should converge on a small runtime surface:

- `mount()` or `init()`
- `onVisible()` hook when a page becomes active
- `updateEmptyState(...)`
- `updateStatus(...)`
- `setLoading(...)`
- optional export binding
- optional abortable task runner

### Feature entrypoint shape

Each feature entrypoint should converge on:

- explicit dependency input
- one public `init()` path
- optional narrow `rebuild*()` or `refresh*()` hooks
- no hidden side ownership outside the feature boundary

## Refactor Waves

### Wave 1: strengthen shared page runtime

Promote `frontend/src/pages/shared/analysisPageRuntime.ts` into the canonical shared runtime owner for analysis-style pages and introduce a small generic runtime seam where useful.

Primary goals:

- standardize lifecycle ownership
- consolidate loading/status behavior
- centralize lazy empty-state handling
- reduce repeated export binding glue

Primary consumers:

- FFT
- heatmap
- spectrogram
- scatter
- drift
- causal
- timeseries, for the page-shell portions only

### Wave 2: finish Timeseries ownership

Use Timeseries as the first clean reference implementation.

Primary goals:

- shrink `frontend/src/app.ts`
- keep `frontend/src/pages/timeseriesPage.ts` focused on fetch/render/viewport behavior
- keep `frontend/src/features/timeseries/*` as the sole owner of control wiring
- remove remaining ownership overlap between app, page, and feature layers

### Wave 3: normalize async page flows

Introduce small shared helpers for repeated request lifecycle logic without changing page-specific rendering behavior.

Primary goals:

- standardize `AbortController` replacement
- standardize loading/status toggles
- standardize page-local error handling seams
- preserve fetch ownership in `services/api/*`

### Wave 4: split oversized page and feature modules

Only after shared seams are stable, split the large files by responsibility.

Priority targets:

- `frontend/src/ui/upload.ts`
- `frontend/src/scatter/scatterPage.ts`
- `frontend/src/drift/driftPage.ts`
- `frontend/src/causal/causalPage.ts`
- `frontend/src/causal/editPanel.ts`

### Wave 5: unify remaining shared UI patterns

Consolidate shared behavior that still appears in two or more live consumers:

- exports
- empty states
- modal lifecycles
- chip rendering variants
- selector/filter composites
- status/loading surfaces

This wave should only extract real shared behavior, not introduce abstract component layers for their own sake.

## File-Level Ownership Map

### Keep and strengthen

- `frontend/src/services/api/*`
  - Stable transport boundary.
- `frontend/src/pages/shared/analysisPageRuntime.ts`
  - Shared page shell owner.
- `frontend/src/pages/timeseriesPage.ts`
  - Timeseries chart/data controller.
- `frontend/src/features/timeseries/*`
  - Timeseries control and workflow owner.

### Shrink into composition shells

- `frontend/src/app.ts`
- `frontend/src/scatter/scatterPage.ts`
- `frontend/src/drift/driftPage.ts`
- `frontend/src/ui/upload.ts`
- `frontend/src/causal/causalPage.ts`

### Likely focused modules to introduce

- `frontend/src/pages/shared/requestTask.ts`
- `frontend/src/features/upload/entrypoint.ts`
- `frontend/src/features/upload/fileSource.ts`
- `frontend/src/features/upload/databaseSource.ts`
- `frontend/src/features/upload/preview.ts`
- `frontend/src/scatter/runtime.ts`
- `frontend/src/scatter/correlationsPanel.ts`
- `frontend/src/drift/runtime.ts`
- `frontend/src/drift/viewModels.ts`

These are destination seams, not mandatory one-shot additions. `frontend/src/pages/shared/pageRuntime.ts` already exists and should be strengthened rather than recreated.

## Testing Strategy

- Prefer focused Vitest coverage around every new shared seam before migrating pages onto it.
- Preserve or expand tests around:
  - `frontend/src/pages/shared/analysisPageRuntime.test.ts`
  - `frontend/src/features/timeseries/entrypoint.test.ts`
  - `frontend/src/scatter/scatterPage.test.ts`
  - `frontend/src/drift/driftPage.test.ts`
  - upload-related tests where new module boundaries are introduced
- Run `npm run test -- <targeted files>` after each wave.
- Run `npm run typecheck` and `npm run validate` after each completed wave or major boundary change.

## Risks And Mitigations

### Risk: abstraction grows faster than duplication shrinks

Mitigation:

- only extract seams already used by multiple pages
- reject generic helpers that hide page behavior instead of clarifying it

### Risk: page lifecycle moves break page-visibility behavior

Mitigation:

- move lifecycle ownership first and test it directly
- keep page fetch/render code page-local during the runtime migration

### Risk: `app.ts` becomes a dumping ground again

Mitigation:

- force new work through feature or page entrypoints
- keep `app.ts` limited to dependency composition and startup order

### Risk: upload and scatter grow new modules that still cross boundaries

Mitigation:

- split by responsibility, not by arbitrary technical layer
- keep transport in `services/api/*`
- keep view orchestration page-local

## Success Criteria

- `frontend/src/app.ts` reads as a composition root rather than a mixed behavior owner.
- Shared page runtime behavior is consistent across analysis pages.
- Timeseries is the reference implementation for clean page/feature separation.
- Scatter, drift, upload, and causal no longer depend on large mixed-responsibility files as their only owner.
- The Rust/TypeScript contract remains unchanged from the perspective of `ai/contract.md`.
