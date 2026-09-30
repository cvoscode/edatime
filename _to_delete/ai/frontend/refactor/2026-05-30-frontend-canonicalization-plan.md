# Frontend Canonicalization And Deduplication Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate duplicated frontend logic behind existing shared boundaries, split oversized orchestration modules into focused owners, and preserve the current backend/frontend contract, routes, DOM ids, export filenames, and page behavior.

**Architecture:** Use a shared-boundary-first approach. Stabilize `frontend/src/services/api/*`, `frontend/src/pages/shared/analysisPageRuntime.ts`, `frontend/src/ui/seriesChipList.ts`, and `frontend/src/store/*` first, then drain orchestration out of `frontend/src/app.ts`, `frontend/src/features/timeseries/columnsController.ts`, and `frontend/src/causal/causalPage.ts` into small modules that match the existing repo structure.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, vanilla DOM rendering, ECharts, ChartGPU, Axum backend, Arrow IPC for timeseries transport.

---

## Scope And Invariants

This plan covers both:

1. shared UI and page-shell deduplication
2. broader app-shell, timeseries, and causal decomposition

This plan does **not** authorize:

- changing backend routes or DTO semantics
- changing visible page ids or section ids
- changing export button ids or export filenames
- rewriting the store architecture
- changing the current SPA navigation model
- merging feature pages into one generic framework

## Backend/Frontend Contract Fence

Treat the following as fixed contract surfaces throughout the refactor:

### API ownership rules

- Only `frontend/src/services/api/*` may call `fetch(...)`.
- Only `frontend/src/services/api/*` may build API URLs or inspect API headers.
- Feature, page, UI, and chart modules consume typed service functions only.
- Transport-specific parsing stays inside the API layer.

### Live route contracts to preserve

- `GET /api/metadata` -> `DatasetMetadata`
- `GET /api/data` -> Arrow IPC decoded into `DataObject`
- `GET|POST /api/scatter/points` -> `ScatterPointsResponse`
- `GET /api/scatter/correlations/matrix` -> correlation matrix payload
- `GET /api/analytics/fft` -> `FftResponse`
- `GET /api/analytics/spectrogram` -> `SpectrogramResponse`
- `POST /api/analytics/causal` -> `CausalGraphResponse`
- `GET /api/analytics/spectral-filter` -> `SpectralFilterResponse`

### Header and payload semantics to preserve

- `x-edatime-downsampled`
- `x-edatime-returned-rows`
- `x-edatime-target-points`
- `x-edatime-time-column`
- `DatasetMetadata`, `DataObject`, `ScatterPointsResponse`, `FftResponse`, `SpectrogramResponse`, and `CausalGraphResponse` shapes in [frontend/src/types.ts](/home/crispy/edatime/frontend/src/types.ts:1)

## Current Hotspots

- [frontend/src/app.ts](/home/crispy/edatime/frontend/src/app.ts:1): mixed bootstrap, keyboard shortcuts, chart initialization, metadata flow, and page orchestration
- [frontend/src/features/timeseries/columnsController.ts](/home/crispy/edatime/frontend/src/features/timeseries/columnsController.ts:1): meta bar rendering, chip rendering, color-by control, adaptive filter targeting, and range controls mixed together
- [frontend/src/causal/causalPage.ts](/home/crispy/edatime/frontend/src/causal/causalPage.ts:1): selection state, graph rendering, edit flows, status/progress, and layout state all in one file
- [frontend/src/pages/shared/analysisPageRuntime.ts](/home/crispy/edatime/frontend/src/pages/shared/analysisPageRuntime.ts:1): good shared seam, but still too thin
- [frontend/src/ui/seriesChipList.ts](/home/crispy/edatime/frontend/src/ui/seriesChipList.ts:1): good shared seam, but callers still own too much orchestration
- [frontend/src/state.ts](/home/crispy/edatime/frontend/src/state.ts:1) and related compatibility surfaces: still present in the live tree and still referenced by tests

## Target Ownership Model

### Stable long-term owners

- `frontend/src/services/api/*`: backend contract boundary
- `frontend/src/store/*`: shared state and setters
- `frontend/src/app/*`: app runtime, bootstrap helpers, lifecycle wiring
- `frontend/src/features/*`: feature-specific orchestration
- `frontend/src/pages/*`: page behavior and page-specific rendering
- `frontend/src/pages/shared/*`: shared page-shell composition only
- `frontend/src/ui/primitives/*`: low-level controls
- `frontend/src/ui/composites/*`: reusable composed UI
- `frontend/src/ui/seriesChipList.ts`: canonical shared chip orchestration

### Files to drain, slim, or archive

- `frontend/src/app.ts`
- `frontend/src/features/timeseries/columnsController.ts`
- `frontend/src/causal/causalPage.ts`
- `frontend/src/state.ts`
- `frontend/src/ui/columns.ts`
- `frontend/src/bootstrap/appShell.ts`
- `frontend/src/bootstrap/pageLoaders.ts`
- `frontend/src/bootstrap/timeseriesBootstrap.ts`

## Implementation Sequence

Balanced delivery means six waves:

1. contract and guardrails
2. shared analysis-page shell
3. shared chip and timeseries control split
4. app orchestrator decomposition
5. causal page decomposition
6. compatibility cleanup and docs alignment

Each wave should land independently and keep the app runnable.

### Task 1: Lock The Contract And Architecture Guardrails

**Files:**
- Modify: `frontend/src/services/api/index.ts`
- Modify: `frontend/src/services/api/http.ts`
- Modify: `frontend/src/services/api/timeseries.ts`
- Modify: `frontend/src/types/api.ts`
- Modify: `scripts/check-frontend-architecture.mjs`
- Modify: `frontend/src/dataClient.test.ts`
- Modify: `frontend/src/utils/bindExportButtons.test.ts`

- [ ] **Step 1: Confirm the API layer remains a barrel, not a logic sink**

Keep [frontend/src/services/api/index.ts](/home/crispy/edatime/frontend/src/services/api/index.ts:1) as a pure export surface. If any new helper logic is needed, place it in `http.ts` or the matching route-family file instead of adding implementation back to `index.ts`.

Expected public surface:

```ts
export { getJsonForApi as getJson, postJsonForApi as postJson } from './http.js';
export { fetchMetadata, fetchSampleDataset } from './metadata.js';
export { fetchData } from './timeseries.js';
export { fetchScatterPoints, fetchScatterCorrelations } from './scatter.js';
export { fetchCorrelationMatrix } from './scatter-matrix.js';
export { fetchFft, fetchSpectrogram, fetchCausalGraph, fetchSpectralFilter } from './analytics.js';
```

- [ ] **Step 2: Add or tighten architecture checks**

Ensure `scripts/check-frontend-architecture.mjs` enforces:

- no `fetch(` outside `frontend/src/services/api/`
- no imports from `frontend/src/legacy/` in live modules
- no new imports from deprecated bootstrap surfaces

Representative rule targets:

```txt
frontend/src/**            allowed: services/api/**
frontend/src/pages/**      blocked: fetch(
frontend/src/features/**   blocked: fetch(
frontend/src/ui/**         blocked: fetch(
frontend/src/chart/**      blocked: fetch(
```

- [ ] **Step 3: Keep timeseries transport parsing internal to the API layer**

Do not move any of this logic out of [frontend/src/services/api/timeseries.ts](/home/crispy/edatime/frontend/src/services/api/timeseries.ts:1):

- `ensureArrowParser()`
- `resolveTimestampColumnName(...)`
- `toEpochMs(...)`
- downsample header interpretation

If tests are missing, add focused coverage around:

```ts
expect(data._meta.downsampleKnown).toBe(true);
expect(data._meta.returnedRows).toBe(512);
expect(data.color_column).toBe('some_column');
```

- [ ] **Step 4: Verify the contract fence**

Run:

```bash
npm run validate
npm run test -- frontend/src/dataClient.test.ts frontend/src/utils/bindExportButtons.test.ts
```

Expected result:

- architecture check passes
- API surface remains stable
- no consumer import churn beyond route-family modules already in place

### Task 2: Make `analysisPageRuntime.ts` The Full Shared Analysis Shell Owner

**Files:**
- Modify: `frontend/src/pages/shared/analysisPageRuntime.ts`
- Modify: `frontend/src/pages/shared/analysisPageRuntime.test.ts`
- Modify: `frontend/src/pages/fftPage.ts`
- Modify: `frontend/src/pages/fftPage.test.ts`
- Modify: `frontend/src/pages/heatmapPage.ts`
- Modify: `frontend/src/pages/heatmapPage.test.ts`
- Modify: `frontend/src/pages/spectrogramPage.ts`
- Modify: `frontend/src/pages/spectrogramPage.test.ts`
- Modify: `frontend/src/ui/emptyState.ts`

- [ ] **Step 1: Expand the shared runtime without turning it into a framework**

Extend `AnalysisPageRuntimeOptions` only for shell concerns already duplicated in multiple pages:

```ts
export interface AnalysisPageRuntimeOptions {
    page: string;
    emptyStateRootId: string;
    exportConfig?: ExportConfig;
    init?: () => void | (() => void);
    onVisible?: () => void;
    onEveryPageChange?: () => void;
    syncEmptyState?: () => EmptyStateViewModel;
    bindExportsOnInit?: boolean;
}
```

Do not move FFT math, heatmap rendering, or spectrogram chart configuration into the shared runtime.

- [ ] **Step 2: Remove per-page export duplication**

Refactor FFT, heatmap, and spectrogram page modules so export binding flows only through `createAnalysisPageRuntime(...)`.

Preserve:

- page key strings
- export button ids
- filenames
- empty-state root ids

Regression to remove explicitly:

- duplicate spectrogram export binding

- [ ] **Step 3: Centralize empty-state synchronization**

Use one pattern for empty-state updates across the analysis pages:

```ts
runtime.updateEmptyState({
    visible: !hasData,
    reason: hasSelection ? 'no-data' : 'no-columns-selected',
    title: hasSelection ? 'No results' : 'Select one or more columns',
});
```

Keep page-specific text local when it differs. Only centralize the controller lifecycle and call pattern.

- [ ] **Step 4: Add focused runtime tests before and after the extraction**

Add or update tests to prove:

- exports bind once
- empty-state controller is lazy
- `onVisible` still fires
- page mount/unmount behavior remains intact

Run:

```bash
npm run test -- frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/pages/fftPage.test.ts frontend/src/pages/heatmapPage.test.ts frontend/src/pages/spectrogramPage.test.ts
```

### Task 3: Split Timeseries Column Controls Around Shared Chip And Range Primitives

**Files:**
- Create: `frontend/src/features/timeseries/metaBar.ts`
- Create: `frontend/src/features/timeseries/colorByControl.ts`
- Create: `frontend/src/features/timeseries/columnSelection.ts`
- Create: `frontend/src/features/timeseries/rangeControls.ts`
- Modify: `frontend/src/features/timeseries/columnsController.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.ts`
- Modify: `frontend/src/features/timeseries/columnsController.test.ts`
- Modify: `frontend/src/ui/seriesChipList.ts`
- Modify: `frontend/src/ui/seriesChipList.test.ts`
- Modify: `frontend/src/ui/metaBar.ts`

- [ ] **Step 1: Move timeseries-only helpers out of `columnsController.ts`**

Extract the following responsibilities into feature-local modules:

- `buildMetaBar(...)` -> `features/timeseries/metaBar.ts`
- color-by select creation and binding -> `features/timeseries/colorByControl.ts`
- selected-column sanitization and adaptive-target fallback -> `features/timeseries/columnSelection.ts`
- range-control construction helpers -> `features/timeseries/rangeControls.ts`

Target public surfaces:

```ts
export function buildTimeseriesMetaBar(metadata: { total_rows?: number } | null): void;
export function renderColorByControl(options: ColorByControlOptions): void;
export function sanitizeSelectedColumnsAgainstMetadata(): void;
export function ensureAdaptiveTargetStillValid(): void;
export function buildRangeControls(): void;
```

- [ ] **Step 2: Promote `seriesChipList.ts` from renderer to orchestration primitive**

Use [frontend/src/ui/seriesChipList.ts](/home/crispy/edatime/frontend/src/ui/seriesChipList.ts:1) to own:

- stable update path via `updateSeriesChipList(...)`
- keyboard activation
- post-render class/attribute wiring
- preserve-existing behavior for transient loading state

Extend only if at least two live callers need the behavior. Expected callers:

- `frontend/src/pages/fftPage.ts`
- `frontend/src/features/timeseries/columnsController.ts`
- `frontend/src/causal/causalPage.ts`

- [ ] **Step 3: Simplify `columnsController.ts` into orchestration only**

After extraction, `columnsController.ts` should mostly:

- derive visible numeric columns
- build `SeriesChipListItem[]`
- connect item callbacks to store setters and feature hooks
- call `renderSeriesChipList(...)`

Target shape:

```ts
export function buildColumnToggles(
    fetchAndRender: () => void,
    buildRangeControlsFn: () => void,
    renderCurrentDataFn?: (() => void) | null,
): void;
```

Keep the public function name stable to minimize blast radius.

- [ ] **Step 4: Move tests with the new ownership**

Cover:

- column sanitization removes blocked or missing columns
- adaptive filter target falls back when selection changes
- color-by control renders metadata columns and updates state
- chip rerender preserves loading state when requested

Run:

```bash
npm run test -- frontend/src/features/timeseries/columnsController.test.ts frontend/src/ui/seriesChipList.test.ts frontend/src/features/timeseries/entrypoint.test.ts
```

### Task 4: Decompose `app.ts` Into Boot, Chart, Metadata, And Shortcut Owners

**Files:**
- Create: `frontend/src/app/chartRuntime.ts`
- Create: `frontend/src/app/metadataBootstrap.ts`
- Create: `frontend/src/app/keyboardShortcuts.ts`
- Create: `frontend/src/app/timeseriesBootstrap.ts`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/app/runtime.ts`
- Modify: `frontend/src/app/pageRegistry.ts`
- Modify: `frontend/src/app/shell.ts`
- Modify: `frontend/src/bootstrap/analyticsOverlay.ts`
- Modify: `frontend/src/bootstrap/sessionBootstrap.ts`
- Modify: `frontend/src/app/shell.test.ts`
- Modify: `frontend/src/app/runtime.test.ts`

- [ ] **Step 1: Extract chart initialization from `app.ts`**

Move `ensureTimeseriesReady()` and related chart startup concerns into `frontend/src/app/chartRuntime.ts`.

Expected owner responsibilities:

- create chart instance
- fallback from ChartGPU to fallback chart
- bind chart events
- restore chart text
- hand off to timeseries page fetch/render after chart init

Representative surface:

```ts
export interface ChartRuntimeDeps {
    onZoomRangeChange: (start: number, end: number, sourceKind?: string) => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    fetchAndRenderTimeseries: () => Promise<void>;
    renderCurrentData: () => void;
}

export function createChartRuntime(deps: ChartRuntimeDeps): {
    ensureReady(): Promise<void>;
};
```

- [ ] **Step 2: Extract metadata bootstrap flow**

Move metadata load, numeric-column defaults, and initial page bootstrap decisions into `frontend/src/app/metadataBootstrap.ts`.

Expected owner responsibilities:

- fetch metadata
- push metadata into the store
- derive default selected columns
- hydrate meta bar and profile grid
- decide whether a page needs dataset bootstrap

- [ ] **Step 3: Extract keyboard shortcuts from `app.ts`**

Move inline shortcut logic into `frontend/src/app/keyboardShortcuts.ts`.

Preserve exact shortcuts already supported by the live app:

- `Alt+1..0` page navigation
- `Shift+R`, `Shift+Z`, `Shift+C`
- `Shift+P`, `Shift+E`

Target surface:

```ts
export function initKeyboardShortcuts(options: KeyboardShortcutOptions): void;
```

- [ ] **Step 4: Keep `app.ts` as composition root only**

After extraction, [frontend/src/app.ts](/home/crispy/edatime/frontend/src/app.ts:1) should primarily:

- wire dependencies
- create controller instances
- register cleanup
- start initialization in order

It should stop owning long imperative blocks for:

- keyboard shortcut definitions
- chart fallback setup
- metadata boot flow
- mixed feature boot logic

- [ ] **Step 5: Verify app startup behavior**

Run:

```bash
npm run test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/utils/pageBootstrap.test.ts frontend/src/utils/router.test.ts
```

Smoke-check manually:

- upload page still opens first
- timeseries initializes after metadata exists
- chart fallback still activates on chart failure
- page navigation and keyboard shortcuts still work

### Task 5: Decompose `causalPage.ts` By Responsibility, Not By Widget

**Files:**
- Create: `frontend/src/causal/selectionState.ts`
- Create: `frontend/src/causal/chipPanel.ts`
- Create: `frontend/src/causal/graphView.ts`
- Create: `frontend/src/causal/editPanel.ts`
- Create: `frontend/src/causal/statusView.ts`
- Modify: `frontend/src/causal/causalPage.ts`
- Modify: `frontend/src/causal/causalPage.test.ts`
- Modify: `frontend/src/causal/causalComparison.ts`
- Modify: `frontend/src/ui/seriesChipList.ts`

- [ ] **Step 1: Extract selection and metadata state helpers**

Move stateful helpers that do not need DOM ownership into `selectionState.ts`:

- metadata normalization
- numeric-column checks
- chip color defaults
- current selection bookkeeping
- pair/group derivation helpers

Representative surface:

```ts
export interface CausalSelectionState {
    currentColumns: string[];
    selectedColumns: Set<string>;
    chipColors: Map<string, string>;
}

export function ensureNodeMetadata(
    column: string,
    metadata: CausalMetadata | null,
    deps: CausalDeps,
): void;
export function listPairGroups(links: CausalLink[], columns: string[]): PairEdgeGroup[];
```

- [ ] **Step 2: Extract chip rendering and chip interactions**

Move chip-list rendering and chip event plumbing into `chipPanel.ts`, reusing `renderSeriesChipList(...)` instead of maintaining causal-specific DOM orchestration in the page file.

The page should pass data and callbacks, not construct chips inline.

- [ ] **Step 3: Extract graph view ownership**

Move ECharts instance lifecycle, resize observer setup, and render/update behavior into `graphView.ts`.

Keep `causalPage.ts` responsible for:

- when to fetch
- when to re-render
- how edits mutate domain state

Keep `graphView.ts` responsible for:

- chart init
- chart disposal
- resize observation
- option generation and event binding

- [ ] **Step 4: Extract edit-panel and status/progress concerns**

Move these into focused modules:

- node and edge edit UI -> `editPanel.ts`
- status text and progress UI -> `statusView.ts`

Representative surface:

```ts
export function setCausalStatus(text: string): void;
export function setCausalProgress(percent: number, label?: string): void;
export function hideCausalProgress(): void;
```

- [ ] **Step 5: Keep `causalPage.ts` as page orchestration**

After extraction, `causalPage.ts` should be the single page coordinator for:

- collecting params
- calling `fetchCausalGraph(...)`
- reconciling API results with local state
- delegating rendering and editing to helpers

It should stop being the owner of raw DOM construction for every concern on the page.

- [ ] **Step 6: Verify the causal workflow end to end**

Run:

```bash
npm run test -- frontend/src/causal/causalPage.test.ts
```

Manual smoke checks:

- chip selection works
- progress/status updates still display
- graph renders and resizes
- node/edge edits still apply
- comparison/update events still fire

### Task 6: Finish Compatibility Cleanup, Docs Alignment, And Residual Hotspots

**Files:**
- Modify: `frontend/src/state.ts`
- Modify: `frontend/src/store/index.ts`
- Modify: `frontend/src/ui/columns.ts`
- Modify: `frontend/src/bootstrap/appShell.ts`
- Modify: `frontend/src/bootstrap/pageLoaders.ts`
- Modify: `frontend/src/bootstrap/timeseriesBootstrap.ts`
- Modify: `docs/developer/frontend.md`
- Modify: `ai/README.md`
- Modify: `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md`

- [ ] **Step 1: Decide the final policy for compatibility files**

Use one of these end states and document it clearly:

- `state.ts` remains a deliberate test-only compatibility shim
- or `state.ts` is archived after test imports are migrated

Do not leave the repo in an ambiguous middle state.

- [ ] **Step 2: Update comments and docs to match the live architecture**

Align:

- [docs/developer/frontend.md](/home/crispy/edatime/docs/developer/frontend.md:1)
- [ai/README.md](/home/crispy/edatime/ai/README.md:1)
- [frontend/src/store/index.ts](/home/crispy/edatime/frontend/src/store/index.ts:1)

with the actual post-refactor ownership model.

- [ ] **Step 3: Triage residual large-module cleanup**

Do a final pass on these files and extract only if duplication remains concrete after Waves 1-5:

- `frontend/src/scatter/rendering.ts`
- `frontend/src/scatter/scatterPage.ts`
- `frontend/src/ui/profile.ts`

Rule:

- extract only proven repeated logic
- do not start a second architecture program inside this one

- [ ] **Step 4: Run the final verification sweep**

Run:

```bash
npm run validate
npm run test -- frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/ui/seriesChipList.test.ts frontend/src/features/timeseries/columnsController.test.ts frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/causal/causalPage.test.ts
```

Then smoke-check:

- upload
- timeseries
- FFT
- heatmap
- spectrogram
- scatter
- causal

## File Map Summary

### New files expected

- `frontend/src/features/timeseries/metaBar.ts`
- `frontend/src/features/timeseries/colorByControl.ts`
- `frontend/src/features/timeseries/columnSelection.ts`
- `frontend/src/features/timeseries/rangeControls.ts`
- `frontend/src/app/chartRuntime.ts`
- `frontend/src/app/metadataBootstrap.ts`
- `frontend/src/app/keyboardShortcuts.ts`
- `frontend/src/app/timeseriesBootstrap.ts`
- `frontend/src/causal/selectionState.ts`
- `frontend/src/causal/chipPanel.ts`
- `frontend/src/causal/graphView.ts`
- `frontend/src/causal/editPanel.ts`
- `frontend/src/causal/statusView.ts`

### Existing files expected to slim down materially

- `frontend/src/app.ts`
- `frontend/src/features/timeseries/columnsController.ts`
- `frontend/src/causal/causalPage.ts`
- `frontend/src/pages/shared/analysisPageRuntime.ts`
- `frontend/src/ui/seriesChipList.ts`

## Review Checklist

Before implementation starts, confirm each wave still satisfies all of the following:

- behavior preserved
- API routes and payloads unchanged
- no new fetch logic outside `services/api/*`
- extraction follows existing folders and naming patterns
- each wave has focused tests
- compatibility surfaces end in a clearly documented state

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6

Stop after each task and run its targeted tests before continuing.
