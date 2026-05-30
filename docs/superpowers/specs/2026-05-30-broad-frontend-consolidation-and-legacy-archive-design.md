# Broad Frontend Consolidation And Legacy Archive Design

## Goal

Refactor the frontend so the live application has one canonical architecture, duplicate shared UI surfaces are removed from active use, repeated orchestration is consolidated into focused modules, and old implementations are preserved under an explicit archive tree that is not part of normal validation.

## Context

The current frontend is already mid-migration:

- `frontend/src/ui/` is the canonical shared UI implementation surface.
- `frontend/src/components/` is a deprecated facade that re-exports from `ui/`.
- `frontend/src/app/` contains the newer runtime, shell, lifecycle, and page-registry primitives.
- `frontend/src/features/*` exists, but Timeseries ownership is still split across `ui/columns.ts`, `bootstrap/timeseriesBootstrap.ts`, `pages/timeseriesPage.ts`, and `app.ts`.
- `frontend/src/state.ts` still acts as a broad compatibility surface for many modules even though state ownership has already been decomposed into `frontend/src/store/*`.

The repository also contains an `ai/` mirror used as architecture context. That mirror should be updated as part of the refactor planning so implementation work has a durable written target.

## Constraints

- Preserve runtime behavior, routes, DOM ids, events, and export semantics.
- Keep changes incremental and testable.
- Preserve old code for reference, but keep archived code out of the live import graph.
- Do not treat the archive as a second supported architecture.
- Do not require archived code to typecheck or pass tests.

## Problems To Solve

### 1. The Live Frontend Still Exposes Multiple “Correct” Import Surfaces

The codebase still contains these overlapping surfaces:

- `frontend/src/components/*` vs `frontend/src/ui/*`
- `frontend/src/state.ts` vs `frontend/src/store/*`
- `frontend/src/ui/columns.ts` vs `frontend/src/features/timeseries/columnsController.ts`
- `frontend/src/bootstrap/appShell.ts` and `frontend/src/bootstrap/pageLoaders.ts` vs `frontend/src/app/*`
- `frontend/src/bootstrap/timeseriesBootstrap.ts` vs `frontend/src/features/timeseries/*`

Most of these legacy surfaces are now wrappers, facades, or mixed-responsibility modules rather than true owners. They slow down navigation, hide the intended design, and make future refactors riskier.

### 2. State And UI Helpers Are Still Coupled Through `state.ts`

`frontend/src/state.ts` mixes multiple concerns:

- backward-compatible composite app state access
- series-color helpers
- metadata DOM helpers
- selection sanitization
- filtering helpers re-exported from canonical services
- debug window exposure

That makes the file a dependency magnet. It also encourages new code to use a broad compatibility layer instead of importing from the real owning module.

### 3. Timeseries Ownership Is Still Spread Across Legacy Locations

Timeseries behavior is currently split across:

- `frontend/src/features/timeseries/entrypoint.ts`
- `frontend/src/features/timeseries/columnsController.ts`
- `frontend/src/bootstrap/timeseriesBootstrap.ts`
- `frontend/src/ui/columns.ts`
- `frontend/src/pages/timeseriesPage.ts`
- `frontend/src/app.ts`

The feature entrypoint exists, but it does not yet own all feature-level setup. This leaves duplicate mental models in the codebase.

### 4. The Archive Policy Is Implicit Instead Of Enforced

The team wants to preserve old implementations as a repair/reference base. Right now there is no explicit archive namespace, no validation exclusion, and no architecture rule blocking accidental imports from archived code.

## Design Principles

- One canonical live surface per responsibility.
- Archive old code explicitly instead of leaving “backup” files in-place.
- Keep compatibility narrow and named when it is still needed.
- Prefer extraction and redirection over large rewrites.
- Add guardrails so the architecture cannot regress silently.

## Target Live Architecture

### Canonical Shared UI

Active shared UI lives in:

- `frontend/src/ui/primitives/*`
- `frontend/src/ui/composites/*`
- `frontend/src/ui/index.ts`

`frontend/src/components/*` is not part of the target live architecture.

### Canonical App Shell And Page Wiring

Active shell and page boot logic lives in:

- `frontend/src/app/runtime.ts`
- `frontend/src/app/shell.ts`
- `frontend/src/app/pageRegistry.ts`
- `frontend/src/app/pageLifecycle.ts`
- `frontend/src/pages/shared/analysisPageRuntime.ts`

The old bootstrap adapters are not part of the target live architecture once call sites are migrated.

### Canonical State Access

Active state ownership lives in:

- `frontend/src/store/*` for state containers and setters
- `frontend/src/services/timeseries/filtering.ts` for filtering/query helpers
- `frontend/src/utils/format.ts` and `frontend/src/utils/seriesColors.ts` for pure helpers
- a small explicit compatibility module only if a composite `appState` surface still needs to exist temporarily

`frontend/src/state.ts` is not part of the target live architecture once its helpers are redistributed.

### Canonical Timeseries Feature Ownership

Active Timeseries coordination lives in:

- `frontend/src/features/timeseries/entrypoint.ts`
- `frontend/src/features/timeseries/columnsController.ts`
- optionally new focused modules under `frontend/src/features/timeseries/` for actions, search wiring, or DOM adapters
- `frontend/src/pages/timeseriesPage.ts` for chart/page behavior only

`frontend/src/ui/columns.ts` and `frontend/src/bootstrap/timeseriesBootstrap.ts` are not part of the target live architecture.

## Archive Design

Old implementations should move under:

- `frontend/src/legacy/`

Expected archive contents for this refactor wave:

- `frontend/src/legacy/components/*`
- `frontend/src/legacy/state.ts`
- `frontend/src/legacy/ui/columns.ts`
- `frontend/src/legacy/bootstrap/appShell.ts`
- `frontend/src/legacy/bootstrap/pageLoaders.ts`
- `frontend/src/legacy/bootstrap/timeseriesBootstrap.ts`

Rules for the archive:

- no runtime module may import from `frontend/src/legacy/`
- `tsconfig.json` excludes `frontend/src/legacy/**`
- `scripts/check-frontend-architecture.mjs` skips scanning archived files and fails if active code imports from `legacy/`
- the archive is documentation/reference only, not a supported execution path

## Migration Strategy

### Wave 1: Establish The Archive Boundary

- create `frontend/src/legacy/README.md`
- copy or move agreed legacy files into `frontend/src/legacy/`
- exclude the archive from TypeScript validation
- add architecture rules blocking imports from `legacy/`
- add an `ai/` planning document that explains the target and the archive policy

### Wave 2: Remove Live Dependence On Compatibility Surfaces

- migrate remaining internal imports off `components/`
- migrate `app.ts` off `bootstrap/appShell.ts` and `bootstrap/pageLoaders.ts`
- migrate Timeseries setup off `ui/columns.ts` and `bootstrap/timeseriesBootstrap.ts`
- migrate modules off `state.ts` onto canonical store/helper modules

### Wave 3: Extract Small Canonical Modules From `state.ts`

Split the mixed responsibilities into named owners, for example:

- `frontend/src/store/appStateCompat.ts`
- `frontend/src/ui/metaBar.ts`
- `frontend/src/utils/seriesColors.ts`
- direct imports from `frontend/src/services/timeseries/filtering.ts`

The point is not to invent more abstractions; it is to stop using one mixed module as the default dependency for unrelated concerns.

### Wave 4: Simplify Top-Level App Assembly

After migration, `frontend/src/app.ts` should import only canonical modules:

- `app/*`
- `features/*`
- `pages/*`
- `store/*`
- `services/*`
- `ui/*`
- `utils/*`

No deprecated compatibility surface should remain in the live app boot path.

## Validation Strategy

- `npm run check:frontend`
- `npm run validate`
- focused Vitest runs for:
  - `frontend/src/features/timeseries/entrypoint.test.ts`
  - `frontend/src/pages/shared/analysisPageRuntime.test.ts`
  - `frontend/src/pages/fftPage.test.ts`
  - `frontend/src/pages/heatmapPage.test.ts`
  - `frontend/src/pages/spectrogramPage.test.ts`
  - `frontend/src/store/store.test.ts`
- grep-based smoke checks that no active file imports from:
  - `components/`
  - `legacy/`
  - `state.ts`
  - `ui/columns.ts`
  - `bootstrap/appShell.ts`
  - `bootstrap/pageLoaders.ts`
  - `bootstrap/timeseriesBootstrap.ts`

## AI Folder Update

The `ai/` mirror should be updated with a planning document that records:

- the canonical live frontend surfaces
- the legacy archive boundary
- the intended migration order
- the fact that `legacy/` is excluded from normal validation

This update should be descriptive and forward-looking. It must not pretend the code has already been migrated.

## Why This Design

This is the safest broad refactor because it treats “legacy” as a boundary problem, not a cosmetic rename:

- the live architecture becomes unambiguous
- old code remains available for reference
- repeated logic is consolidated by responsibility
- future contributors have explicit guardrails against reintroducing deprecated surfaces

