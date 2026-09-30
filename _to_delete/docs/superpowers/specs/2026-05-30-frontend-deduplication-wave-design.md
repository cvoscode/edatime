# Frontend Deduplication Wave Design

## Goal

Remove the last duplicate frontend surfaces and consolidate repeated analysis-page orchestration without changing user-visible behavior.

## Current State

The frontend is already mostly on the canonical architecture described in `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md`:

- `frontend/src/ui/` is the real shared UI implementation surface.
- `frontend/src/components/` is no longer used by live runtime modules.
- `frontend/src/pages/shared/analysisPageRuntime.ts` already exists and is used by FFT, heatmap, and spectrogram pages.
- `frontend/src/ui/seriesChipList.ts` already centralizes part of chip rendering behavior.

The remaining duplication is narrower and more concrete than the previous consolidation wave:

1. `frontend/src/components/` still exists in the live source tree even though it is only a deprecated wrapper surface.
2. Analysis pages still repeat shell logic around export binding, empty-state synchronization, metadata-driven control hydration, and page activation wiring.
3. Chip-list consumers still reimplement orchestration details on top of `renderSeriesChipList(...)`, especially in `frontend/src/pages/fftPage.ts`, `frontend/src/features/timeseries/columnsController.ts`, and `frontend/src/causal/causalPage.ts`.
4. `frontend/src/pages/spectrogramPage.ts` currently binds exports twice, which is unnecessary duplication and a maintenance hazard even if behavior appears unchanged.

## Constraints

- Preserve page routes, DOM ids, element semantics, export filenames, and existing user flows.
- Allow internal API cleanup when it reduces duplication, but do not create visible UX changes.
- Keep refactors incremental and locally verifiable.
- Avoid a broad app-shell or store rewrite in this wave.

## Problems To Solve

### 1. The Repository Still Looks Like It Has Two UI Component Systems

Even though imports are already on `ui/`, the presence of `frontend/src/components/` keeps the duplicate surface visible in the live tree. That slows code navigation, weakens architectural clarity, and invites future drift.

### 2. Shared Helpers Still Stop Short Of The Remaining Duplication

`analysisPageRuntime.ts` and `seriesChipList.ts` exist, but callers still carry repeated glue code:

- one-off empty-state adapter functions
- repeated `bindExportButtons(...)` setup blocks
- metadata option hydration on visibility
- DOM state preservation around chip rerenders
- repeated accessibility patch-up after chip rendering

The duplication is no longer at the chart or page level. It is in orchestration just above the current helpers.

### 3. The Current Orchestration Is Inconsistent Across Pages

FFT, heatmap, spectrogram, causal, and timeseries-adjacent modules follow similar patterns with slightly different local conventions. That makes maintenance harder and hides issues like the duplicate spectrogram export binding.

## Design Principles

- One canonical shared UI surface.
- Delete dead compatibility layers once the import graph is clean.
- Shared helpers should own orchestration, not feature behavior.
- Prefer extending an existing good module over introducing a new helper pile.
- Extract only patterns that already exist in at least two live modules.

## Module Design

### A. Remove The Live `components/` Compatibility Surface

`frontend/src/components/` should no longer remain in the live source tree.

The architecture check already blocks live imports from that surface, and `frontend/src/legacy/components/` already preserves archived wrappers for reference. The clean end state is:

- no `frontend/src/components/` directory in the live tree
- `frontend/src/ui/` remains the only canonical shared UI surface
- architecture validation continues to fail any new `components/` import

This is a cleanup step, not a migration step. The migration has already effectively completed.

### B. Keep `analysisPageRuntime.ts` Small, But Make It The Full Page-Shell Owner

`frontend/src/pages/shared/analysisPageRuntime.ts` should remain the shared owner of page-shell composition for analytics pages.

It should own:

- lifecycle registration through `createPageLifecycle(...)`
- lazy empty-state controller creation
- one-time shell initialization hooks
- page visibility callbacks

It may gain small convenience affordances if they remove repeated glue, but it should not absorb:

- FFT trace state
- heatmap matrix rendering
- spectrogram ECharts configuration
- causal graph logic
- data fetching semantics

The design goal is to make page modules thinner without turning the runtime helper into a generic framework.

### C. Consolidate Repeated Export Wiring As A Shared Page-Shell Concern

Export binding is currently repeated in each analysis page even though the pattern is structurally the same:

- bind a page key
- declare PNG/SVG/HTML handlers
- optionally attach CSV behavior and a data-availability guard

This wave should move the repeated binding pattern behind one shared boundary. The preferred implementation is to extend the existing analysis-page scaffold rather than adding another unrelated utility module.

The important outcome is:

- one export-binding path per page
- no duplicate bindings
- page modules declare export behavior, but do not manually reassemble the shell

### D. Make `ui/seriesChipList.ts` The Canonical Chip-Orchestration Layer

`frontend/src/ui/seriesChipList.ts` already owns part of the shared behavior. It should become the canonical place for remaining repeated chip-list orchestration that is currently reimplemented in callers.

It should absorb the shared mechanics that are now duplicated across FFT, causal, and timeseries-adjacent flows:

- stable keyed updates where full rerendering is unnecessary
- keyboard activation and base accessibility behavior
- optional post-render class and attribute application
- preserving transient chip state during updates when needed

Callers should continue to own:

- which columns appear
- fetch behavior
- status text
- adaptive filter semantics
- domain-specific callbacks

This lets `fftPage.ts` stop manually restoring loading classes and button semantics after rerenders, while keeping feature logic local.

## Target Ownership After Refactor

### `frontend/src/ui/`

- the only live shared component surface
- the canonical chip-list orchestration owner

### `frontend/src/pages/shared/analysisPageRuntime.ts`

- the only shared analysis-page shell owner
- responsible for lifecycle, empty state, and export shell composition

### `frontend/src/pages/fftPage.ts`

Keeps:

- trace selection
- FFT mode and log-scale behavior
- spectral filter preview logic
- FFT-specific CSV payload shaping

Loses:

- duplicate export-binding assembly
- manual chip rerender repair work that belongs in `seriesChipList.ts`

### `frontend/src/pages/spectrogramPage.ts`

Keeps:

- ECharts initialization and rendering
- drag-to-zoom behavior
- spectrogram request/response handling

Loses:

- duplicate export-binding calls
- repeated shell glue that can live in the runtime helper

### `frontend/src/pages/heatmapPage.ts`

Keeps:

- matrix fetch policy
- correlation coloring
- HTML grid rendering
- scatter drill-down behavior

Loses:

- repeated export-binding shell assembly

### `frontend/src/features/timeseries/columnsController.ts`

Keeps:

- selected-column semantics
- adaptive filter targeting
- range modal integration

Loses:

- chip-list orchestration details that belong in `ui/seriesChipList.ts`

### `frontend/src/causal/causalPage.ts`

Keeps:

- causal graph data and interaction logic

Loses:

- local chip-list plumbing that can be expressed through the shared chip-list layer

## Migration Strategy

### Wave 1: Remove Dead UI Surface

- confirm `frontend/src/components/` has no live consumers
- remove the live `frontend/src/components/` directory
- keep `frontend/src/legacy/components/` as the only archived reference copy
- retain architecture checks that block `components/` imports

### Wave 2: Finish The Analysis Page Shell Boundary

- refactor FFT, heatmap, and spectrogram so export binding only flows through the shared runtime
- remove duplicate shell code, including the extra spectrogram export binding
- keep page-specific render and fetch logic in place

### Wave 3: Promote `seriesChipList.ts` From Renderer To Orchestration Primitive

- extend the shared chip-list helper with the common update/accessibility/state-preservation behavior currently duplicated in callers
- migrate FFT first, then timeseries column controls, then causal chip usage if the same abstraction fits cleanly
- stop once the remaining duplication is only domain-specific logic

## Validation Strategy

- `npm run validate`
- targeted Vitest coverage for `frontend/src/pages/shared/analysisPageRuntime.test.ts`
- targeted Vitest coverage for `frontend/src/ui/seriesChipList.test.ts`
- targeted regression runs for:
  - `frontend/src/pages/fftPage.test.ts`
  - `frontend/src/pages/heatmapPage.test.ts`
  - `frontend/src/pages/spectrogramPage.test.ts`
  - `frontend/src/features/timeseries/columnsController.test.ts`
- smoke verification that FFT, heatmap, and spectrogram still initialize, export, and show empty states correctly

## Out Of Scope

- rewriting `frontend/src/app.ts`
- changing store architecture
- changing page markup structure beyond what shared-shell cleanup requires
- merging all analysis pages into one generic page module
- changing user-facing copy unless needed to preserve existing empty-state behavior

## Why This Design

The previous consolidation wave already established the right architecture. This wave should finish it instead of starting over.

The clean path is:

- remove the last dead wrapper surface
- strengthen the existing shared page scaffold instead of replacing it
- move chip-list orchestration into the helper that already partly owns it

That produces a frontend that is easier to navigate, harder to regress, and simpler to extend without changing how the product behaves for users.
