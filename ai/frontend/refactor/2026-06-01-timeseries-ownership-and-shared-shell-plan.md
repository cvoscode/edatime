# Timeseries Ownership And Shared Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Timeseries the first fully-owned feature entrypoint, promote the shared analysis shell and shared chip orchestration to real canonical owners, and remove duplicate wiring without changing visible behavior or the frontend/backend contract.

**Architecture:** Keep `frontend/src/services/api/*` as the only transport boundary, keep `frontend/src/pages/timeseriesPage.ts` as the Timeseries chart/data controller, move Timeseries control bootstrapping behind `frontend/src/features/timeseries/entrypoint.ts`, and strengthen `frontend/src/pages/shared/analysisPageRuntime.ts` plus `frontend/src/ui/seriesChipList.ts` so shared shell/chip behavior stops leaking into page modules.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, vanilla DOM rendering, ECharts, ChartGPU, Axum backend, Arrow IPC transport.

---

## File Map

- **Modify:** `frontend/src/pages/shared/analysisPageRuntime.ts`
  - Shared analysis-page shell owner.
- **Modify:** `frontend/src/pages/shared/analysisPageRuntime.test.ts`
  - Regression coverage for lifecycle, export binding, lazy empty-state, and status helpers.
- **Modify:** `frontend/src/pages/fftPage.ts`
- **Modify:** `frontend/src/pages/fftPage.test.ts`
- **Modify:** `frontend/src/pages/heatmapPage.ts`
- **Modify:** `frontend/src/pages/heatmapPage.test.ts`
- **Modify:** `frontend/src/pages/spectrogramPage.ts`
- **Modify:** `frontend/src/pages/spectrogramPage.test.ts`
  - Adopt the strengthened shared analysis runtime.
- **Modify:** `frontend/src/ui/seriesChipList.ts`
- **Modify:** `frontend/src/ui/seriesChipList.test.ts`
  - Canonical chip orchestration owner with preserved transient state.
- **Modify:** `frontend/src/features/timeseries/entrypoint.ts`
- **Modify:** `frontend/src/features/timeseries/entrypoint.test.ts`
  - Single public Timeseries wiring surface.
- **Modify:** `frontend/src/features/timeseries/columnsController.ts`
- **Modify:** `frontend/src/features/timeseries/columnsController.test.ts`
  - Reduce to thin composition/facade behavior.
- **Create:** `frontend/src/features/timeseries/filterModalController.ts`
  - Column filter modal lifecycle owner.
- **Modify:** `frontend/src/features/timeseries/rangeControls.ts`
  - Render-only owner for selected-range and adaptive-filter chips.
- **Modify:** `frontend/src/features/timeseries/chipComposition.ts`
  - Keep state-to-chip composition behavior explicit and testable.
- **Modify:** `frontend/src/app.ts`
  - Drain direct Timeseries control wiring in favor of the feature entrypoint.
- **Modify:** `frontend/src/app/shell.ts`
  - Remove Timeseries-specific control bootstrapping that belongs to the feature entrypoint.
- **Modify:** `ai/frontend/refactor/2026-06-01-timeseries-ownership-and-shared-shell-design.md`
  - Update migration notes only if implementation decisions differ from the approved design.

## Contract Fence

Treat the following as fixed during implementation:

- `ai/contract.md`
- `frontend/src/services/api/timeseries.ts`
- `/api/data` request semantics
- Arrow timestamp resolution and response header interpretation
- existing page ids, DOM ids, export ids, and export filenames

Only `frontend/src/services/api/*` may:

- call `fetch(...)`
- inspect response headers
- convert transport payloads into frontend objects

No implementation step in this plan should move transport parsing into page, feature, or UI modules.

### Task 1: Lock The Shared Analysis Shell Boundary

**Files:**
- Modify: `frontend/src/pages/shared/analysisPageRuntime.ts`
- Modify: `frontend/src/pages/shared/analysisPageRuntime.test.ts`
- Modify: `frontend/src/pages/fftPage.ts`
- Modify: `frontend/src/pages/fftPage.test.ts`
- Modify: `frontend/src/pages/heatmapPage.ts`
- Modify: `frontend/src/pages/heatmapPage.test.ts`
- Modify: `frontend/src/pages/spectrogramPage.ts`
- Modify: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] **Step 1: Strengthen the runtime test before touching runtime behavior**

Add or update focused assertions in `frontend/src/pages/shared/analysisPageRuntime.test.ts` for:

- export binding happens once per page init
- empty-state controller is lazy and reused
- `updateStatus(...)` remains a no-op when no status element is configured
- `onVisible` and `onEveryPageChange` keep their current semantics

Target command:

```bash
npm test -- frontend/src/pages/shared/analysisPageRuntime.test.ts
```

Expected result:

- PASS on current behavior or a clear focused failure showing the next runtime change needed

- [ ] **Step 2: Keep the runtime narrow, but make it the actual shell owner**

Refactor `frontend/src/pages/shared/analysisPageRuntime.ts` only around shared shell concerns. The end-state surface should stay close to:

```ts
export interface AnalysisPageRuntimeOptions {
    page: string;
    emptyStateRootId: string;
    statusElId?: string;
    exportConfig?: ExportConfig;
    bindExportsOnInit?: boolean;
    init?: () => void | (() => void);
    onVisible?: () => void;
    onEveryPageChange?: () => void;
}
```

Do not move:

- FFT trace state
- heatmap rendering
- spectrogram chart setup

into the shared runtime.

- [ ] **Step 3: Remove analysis-page shell duplication**

Update `fftPage.ts`, `heatmapPage.ts`, and `spectrogramPage.ts` so export binding and empty-state shell behavior flow through `createAnalysisPageRuntime(...)` instead of page-local variations.

Preserve:

- page keys
- export filenames
- empty-state root ids
- current visible behavior

Specific regression to remove:

- manual or duplicate export-binding paths that the runtime can now own

- [ ] **Step 4: Re-run focused page tests**

Run:

```bash
npm test -- frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/pages/fftPage.test.ts frontend/src/pages/heatmapPage.test.ts frontend/src/pages/spectrogramPage.test.ts
```

Expected result:

- PASS

### Task 2: Make `seriesChipList.ts` The Canonical Chip-Orchestration Owner

**Files:**
- Modify: `frontend/src/ui/seriesChipList.ts`
- Modify: `frontend/src/ui/seriesChipList.test.ts`
- Modify: `frontend/src/pages/fftPage.ts`

- [ ] **Step 1: Extend shared chip tests before changing callers**

Add a focused test in `frontend/src/ui/seriesChipList.test.ts` proving preserved chip behavior across rerenders. Cover at least:

- a chip with a loading class survives an update when `preserveExisting` is enabled
- keyboard toggle behavior still works
- color updates still flow through both per-item and shared callbacks

Target command:

```bash
npm test -- frontend/src/ui/seriesChipList.test.ts
```

Expected result:

- PASS on current assertions
- new preservation assertion either fails first or documents the behavior gap

- [ ] **Step 2: Make preservation behavior explicit in the shared owner**

Keep `frontend/src/ui/seriesChipList.ts` as the sole place that understands transient chip preservation. The shared interface should remain declarative:

```ts
renderSeriesChipList({
    container,
    items,
    chipClass: 'fft-trace-chip',
    preserveExisting: true,
});
```

Callers should not need to capture and restore chip DOM state themselves after this step.

- [ ] **Step 3: Drain FFT’s manual chip repair**

Update `frontend/src/pages/fftPage.ts` so `renderChips()` relies on `renderSeriesChipList(...)` and shared preservation behavior instead of capturing and restoring loading chips in page-local DOM code.

Keep FFT page ownership of:

- trace selection
- fetch sequencing
- status text
- chart rendering

Do not move FFT domain behavior into the shared chip layer.

- [ ] **Step 4: Re-run focused chip and FFT tests**

Run:

```bash
npm test -- frontend/src/ui/seriesChipList.test.ts frontend/src/pages/fftPage.test.ts
```

Expected result:

- PASS

### Task 3: Split Timeseries Control Ownership Into Focused Modules

**Files:**
- Create: `frontend/src/features/timeseries/filterModalController.ts`
- Modify: `frontend/src/features/timeseries/columnsController.ts`
- Modify: `frontend/src/features/timeseries/rangeControls.ts`
- Modify: `frontend/src/features/timeseries/chipComposition.ts`
- Modify: `frontend/src/features/timeseries/columnsController.test.ts`

- [ ] **Step 1: Freeze the current facade behavior with tests**

Before splitting logic, add or tighten assertions in `frontend/src/features/timeseries/columnsController.test.ts` around:

- selected chip rerender after toggle
- adaptive-target behavior remains intact
- range-control rebuild still happens when selection changes

Target command:

```bash
npm test -- frontend/src/features/timeseries/columnsController.test.ts
```

Expected result:

- PASS or focused failure that captures the current contract before the split

- [ ] **Step 2: Extract the filter modal lifecycle owner**

Move modal-specific logic out of `columnsController.ts` into:

```ts
// frontend/src/features/timeseries/filterModalController.ts
export interface FilterModalControllerDeps {
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, source: string) => void;
}

export function initFilterModalController(deps: FilterModalControllerDeps): void
```

This module should own:

- modal element lookup
- min/max input syncing
- apply and clear behavior
- `edatime:column-filters-change` emission

It should not own:

- page bootstrap
- Timeseries fetch orchestration

- [ ] **Step 3: Keep range controls render-only**

Retain `frontend/src/features/timeseries/rangeControls.ts` as a render-focused owner for:

- selected column range chips
- adaptive filter chips
- clear-adaptive chip

It should not absorb modal logic or selection sanitization.

- [ ] **Step 4: Reduce `columnsController.ts` to a composition facade**

The facade should compose:

- chip-list rendering
- color-by control insertion
- range control rebuild hookup
- filter modal controller initialization

The end-state public surface should stay close to the current import contract:

```ts
export function buildColumnToggles(
    fetchAndRender: () => void,
    buildRangeControlsFn: () => void,
    renderCurrentDataFn?: (() => void) | null,
): void;

export function initColumnFilterModal(
    renderCurrentData: () => void,
    updateAnalysisYRange: (min: number, max: number, source: string) => void,
): void;
```

If implementation keeps `initColumnFilterModal(...)` as a compatibility wrapper that delegates to `filterModalController.ts`, that is acceptable for this wave.

- [ ] **Step 5: Re-run focused Timeseries control tests**

Run:

```bash
npm test -- frontend/src/features/timeseries/columnsController.test.ts
```

Expected result:

- PASS

### Task 4: Make `entrypoint.ts` The Single Public Timeseries Wiring Surface

**Files:**
- Modify: `frontend/src/features/timeseries/entrypoint.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/app/shell.ts`

- [ ] **Step 1: Tighten the entrypoint contract in tests**

Update `frontend/src/features/timeseries/entrypoint.test.ts` so it asserts the feature returns one coherent surface for Timeseries control wiring:

```ts
expect(feature.init).toBeTypeOf('function');
expect(feature.rebuildColumns).toBeTypeOf('function');
expect(feature.buildRangeControls).toBeTypeOf('function');
```

Add one stronger assertion: `init()` delegates search/filter/reset setup through this feature surface, not through callers reaching into child modules directly.

Target command:

```bash
npm test -- frontend/src/features/timeseries/entrypoint.test.ts
```

Expected result:

- PASS or focused failure that captures missing delegation

- [ ] **Step 2: Promote the entrypoint into the real owner**

Refactor `frontend/src/features/timeseries/entrypoint.ts` so it becomes the only feature-level owner for:

- `initDatasetSearchInputs(...)`
- Timeseries action wiring
- column chip rebuild composition
- filter modal controller initialization

Keep the public API small:

```ts
export function createTimeseriesEntrypoint(deps: TimeseriesFeatureDeps) {
    return {
        init,
        rebuildColumns,
        buildRangeControls,
    };
}
```

- [ ] **Step 3: Drain direct Timeseries control wiring from `app.ts`**

Update `frontend/src/app.ts` so metadata bootstrap and initial page setup use the entrypoint instead of calling:

- `buildColumnToggles(...)`
- `initDatasetSearchInputs(...)`
- `initTimeseriesActions(...)`
- `initColumnFilterModal(...)`

directly from the app layer.

`app.ts` should still own:

- controller creation
- chart bootstrap
- dataset bootstrap sequencing
- top-level app lifecycle

- [ ] **Step 4: Drain Timeseries-specific control boot from `app/shell.ts`**

Remove Timeseries-only control bootstrapping from `frontend/src/app/shell.ts` where that work belongs to the feature entrypoint.

Preserve shell ownership of app-wide concerns such as:

- page navigation
- settings
- command palette
- guided workflow

- [ ] **Step 5: Re-run focused entrypoint and shell tests**

Run:

```bash
npm test -- frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/shell.test.ts
```

Expected result:

- PASS

### Task 5: Verify The Timeseries Controller Boundary Still Holds

**Files:**
- Modify: `frontend/src/pages/timeseriesPage.ts`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.ts`

- [ ] **Step 1: Keep `timeseriesPage.ts` focused on chart/data behavior**

Audit `frontend/src/pages/timeseriesPage.ts` after the entrypoint split. It should still own:

- `fetchAndRender()`
- `renderCurrentData()`
- `onZoomRangeChange()`
- data-driven empty-state behavior
- analytics follow-up after successful render

It should not take back ownership of search/filter/reset DOM bootstrapping.

- [ ] **Step 2: Confirm the app layer only composes controller + feature**

After refactoring, the important top-level flow in `frontend/src/app.ts` should read conceptually like:

```ts
const timeseriesPage = createTimeseriesPageController(...);
const timeseriesFeature = createTimeseriesEntrypoint(...);
```

The app layer can still decide when initialization happens, but should not know child-module wiring details.

- [ ] **Step 3: Run Timeseries-focused regression checks**

Run:

```bash
npm test -- frontend/src/features/timeseries/columnsController.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/ui/seriesChipList.test.ts
```

Expected result:

- PASS

### Task 6: Final Verification And Smoke Validation

**Files:**
- Modify: `ai/frontend/refactor/2026-06-01-timeseries-ownership-and-shared-shell-design.md`
  - Only if implementation reveals a boundary adjustment worth recording.

- [ ] **Step 1: Run typecheck and architecture validation**

Run:

```bash
npm run validate
```

Expected result:

- PASS

- [ ] **Step 2: Run the focused regression suite for this refactor**

Run:

```bash
npm test -- frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/ui/seriesChipList.test.ts frontend/src/pages/fftPage.test.ts frontend/src/pages/heatmapPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/features/timeseries/columnsController.test.ts frontend/src/features/timeseries/entrypoint.test.ts
```

Expected result:

- PASS

- [ ] **Step 3: Perform a manual smoke check**

Verify in the running app:

- Timeseries page still loads and renders default columns
- Timeseries search, selection, range chips, and filter modal still work
- FFT chips still show loading behavior while traces compute
- Heatmap still loads matrix data and exports
- Spectrogram still computes, zooms, and exports

- [ ] **Step 4: Stop if backend contract changes are required**

If any implementation step appears to require:

- route changes
- DTO shape changes
- response header changes
- transport parsing relocation outside `services/api/*`

stop and create a follow-up design note instead of changing the contract inside this refactor wave.
