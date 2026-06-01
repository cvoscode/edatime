# Frontend Analysis And Selection Unification Design

> Continues the architecture direction from `2026-05-30-broad-frontend-consolidation.md` and `2026-05-30-frontend-canonicalization-plan.md`. This design does not introduce a new frontend architecture. It strengthens the existing canonical surfaces.

## Goal

Standardize analysis-page runtime behavior and unify selection-control composition so duplicated UI wiring moves into shared owners while page-specific rendering and feature-specific logic remain local.

## Scope

This design covers:

- analysis pages: `fftPage.ts`, `heatmapPage.ts`, `spectrogramPage.ts`
- shared analysis shell: `pages/shared/analysisPageRuntime.ts`
- selection controls for timeseries and any future consumers
- shared chip/control surfaces in `ui/*` and `features/timeseries/*`
- small backend cleanups only where they reduce contract-adjacent duplication for analysis surfaces

This design does not cover:

- a generic page framework for the entire application
- causal-page redesign beyond reuse opportunities that naturally follow from shared controls
- store replacement or state model redesign
- route or payload contract changes
- legacy-surface revival

## Constraints

- Preserve current page ids, control ids, export button ids, and export filenames.
- Preserve current API routes, response shapes, and transport parsing behavior.
- Keep `frontend/src/pages/shared/*` as canonical shared page-shell ownership.
- Keep `frontend/src/ui/*` as canonical shared control ownership.
- Keep `frontend/src/features/*` and `frontend/src/pages/*` as consumers of shared surfaces, not alternate owners.
- Backend refactoring stays behavior-preserving and secondary to frontend standardization.

## Current Problems

### 1. Analysis pages share patterns but not one complete runtime contract

`fftPage.ts`, `heatmapPage.ts`, and `spectrogramPage.ts` already use `analysisPageRuntime.ts`, but they still differ in how they bind exports, synchronize empty state, and structure page-lifecycle wiring. The current shared runtime is useful but too thin, so repeated shell behavior still leaks into each page.

### 2. Selection controls are partially standardized but still assembled ad hoc

`seriesChipList.ts` is the canonical low-level chip renderer, but `columnsController.ts` still mixes:

- column-selection rendering
- color-by control insertion
- adaptive-target interaction rules
- range-control rendering
- metadata bar updates
- collapse and keyboard interaction glue

This makes one file the effective owner of multiple UI surfaces, and it prevents selection controls from becoming a reusable pattern outside timeseries.

### 3. Shared UI concerns and domain concerns are still mixed

The current control flow puts reusable DOM behavior and feature-specific policy in the same module. That increases the chance of duplicated event wiring and makes tests broader than they need to be.

### 4. Backend analytics handlers are large, but frontend standardization should not depend on a route rewrite

`crates/edatime-service/src/handlers/routes/analytics.rs` is still large. Some helper extraction is justified if frontend standardization reveals repeated request normalization or response shaping patterns, but the backend should remain a supporting refactor in this wave, not the driver.

## Recommended Approach

Strengthen the existing shared seams instead of creating a new framework.

This means:

- make `analysisPageRuntime.ts` the canonical analysis-shell owner
- make shared selection-control modules the canonical owner of chip/control composition
- keep chart rendering, analysis-specific transforms, and feature-specific compute logic local to each page or feature

This is the lowest-risk option because it continues the current canonicalization direction instead of replacing it.

## Target Architecture

### A. Canonical analysis-page shell

`frontend/src/pages/shared/analysisPageRuntime.ts` should become the single owner for shared analysis-page shell behavior:

- page lifecycle registration
- lazy empty-state controller creation
- consistent empty-state update entry point
- standard export binding lifecycle
- optional shared status/update hooks that do not own chart logic

It should not absorb:

- FFT chart rendering
- heatmap rendering
- spectrogram chart initialization details
- page-specific compute orchestration

The shared runtime should own shell behavior only.

### B. Canonical selection-control composition

Selection controls should be split into layers:

1. `ui/seriesChipList.ts`
   - low-level chip-list rendering and interaction primitives
2. `ui/composites/*` and/or a focused shared selection-control module
   - reusable UI composition primitives for control rows, slots, and chip groups
3. `features/timeseries/*`
   - domain-aware selection policies such as adaptive-target rules, selected-column sanitization, and color-column store updates

The key change is that `columnsController.ts` should stop being the de facto owner of all selection control concerns.

### C. Timeseries as first canonical consumer

Timeseries should become the first full consumer of the canonical selection-control pattern because it currently has the most complete control surface:

- series chips
- color-by control
- range chips
- adaptive-target semantics
- metadata bar synchronization

Once this is decomposed cleanly, the same pattern can be reused by other pages without copying timeseries-specific policy.

### D. Backend support only where it helps the frontend seams

Backend work should be limited to contract-adjacent helper extraction, for example:

- shared analytics query normalization
- helper extraction for repeated JSON response shaping
- DTO placement improvements when a frontend-consumed payload is defined or normalized in multiple places

Routes, status codes, and payloads remain unchanged.

## Proposed Module Boundaries

### Analysis pages

Keep these responsibilities local:

- `fftPage.ts`: FFT trace fetching, chart mode/log-scale state, trace rendering
- `heatmapPage.ts`: matrix rendering, metric switching, click-to-scatter navigation
- `spectrogramPage.ts`: ECharts lifecycle, drag-to-zoom, chart formatting

Move or standardize these responsibilities into `analysisPageRuntime.ts`:

- export binding lifecycle policy
- empty-state controller lifecycle
- shared page mount/visible hooks shape
- common runtime return shape and update API

### Selection controls

Extract `columnsController.ts` into smaller owners:

- metadata display owner
- chip-list composition owner
- color-by control owner
- range-control owner
- orchestration entrypoint that composes the above

Keep domain rules in feature-owned modules:

- `sanitizeSelectedColumns()`
- `ensureAdaptiveTargetStillValid()`
- adaptive-target state decisions

Keep generic DOM rendering in shared modules:

- chip rendering
- control slot rendering
- shared keyboard and click interaction helpers

## Data Flow

### Analysis pages

1. Page module initializes its own page-specific state.
2. Page module creates `analysisPageRuntime(...)`.
3. Shared runtime binds lifecycle, empty-state controller, and exports.
4. Page module performs compute/fetch/render work through service functions.
5. Page module reports shell-level state through runtime update methods rather than re-owning shell wiring.

### Selection controls

1. Feature orchestrator reads current metadata and store state.
2. Domain helpers sanitize selected columns and validate adaptive-target state.
3. Shared selection-control composer turns state into renderable control items.
4. Shared renderers draw chips/controls and attach generic DOM interactions.
5. Feature callbacks handle store writes, fetches, and page refresh behavior.

This keeps pure state-to-view mapping and DOM mechanics separate from feature policy.

## Error Handling

- Shared runtime should not swallow page errors. Page modules remain responsible for page-specific fetch/render errors.
- Shared selection modules should not own toast policy or store mutation policy. They should call feature-provided callbacks.
- Backend helper extraction must preserve current `AppError` behavior and handler status semantics.

## Testing Strategy

### Frontend

Add or strengthen focused tests around:

- `analysisPageRuntime.test.ts`
  - export binding occurs once
  - empty-state controller is lazy
  - visible hook behavior remains intact
- page tests
  - FFT, heatmap, and spectrogram still wire through the same shared runtime path
- selection-control tests
  - chip rendering and updates remain stable
  - color-by control composition remains correct
  - range-control rendering remains correct
  - adaptive-target behavior remains feature-owned and unchanged

### Backend

Only add tests if helper extraction occurs. Prefer narrow unit or handler-level tests that prove no response-shape changes.

## Migration Sequence

### Phase 1: Standardize the analysis runtime

- tighten `analysisPageRuntime.ts` into the full shared shell owner
- move repeated export and empty-state patterns out of individual analysis pages
- update page tests first, then page implementations

### Phase 2: Standardize selection-control composition

- split `columnsController.ts` into smaller modules
- keep policy helpers in `features/timeseries/*`
- move generic rendering/composition into shared control owners

### Phase 3: Apply the pattern consistently

- finish migrating analysis pages onto the same runtime contract
- make timeseries the first canonical consumer of the unified selection controls
- identify any obvious reuse opportunities for other features without forcing migration

### Phase 4: Backend cleanup only if justified

- extract shared analytics-route helpers only if the frontend refactor exposes duplicated contract glue
- stop once frontend standardization is no longer blocked

## Risks And Mitigations

### Risk: shared runtime grows into a framework

Mitigation:
- restrict `analysisPageRuntime.ts` to shell concerns only
- keep chart logic and compute orchestration in page modules

### Risk: selection controls become too generic and lose clarity

Mitigation:
- keep domain policy in feature modules
- share rendering and composition, not business rules

### Risk: backend cleanup expands scope

Mitigation:
- treat backend work as optional and contract-adjacent
- require that every backend extraction directly supports a frontend seam or removes obvious duplication

## Success Criteria

This design succeeds when:

- analysis pages use one consistent runtime pattern
- export and empty-state wiring are no longer reimplemented per analysis page
- selection controls have one canonical composition path
- `columnsController.ts` is no longer the owner of multiple unrelated UI concerns
- no deprecated frontend surfaces are reintroduced
- backend contracts remain unchanged

## Design Summary

The next refactor wave should continue the existing canonicalization strategy, not replace it. The two canonical surfaces for this wave are:

- `pages/shared/analysisPageRuntime.ts` for analysis-page shell behavior
- shared selection-control modules built on top of `ui/seriesChipList.ts` and existing composites

Everything else should either stay local to the page/feature or be extracted only when it clearly belongs to one of those shared owners.
