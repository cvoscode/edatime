# Timeseries Lifecycle And Bootstrap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining Timeseries/bootstrap architecture work required by `ai/frontend/Vision.md` so `app.ts` becomes a true composition root and Timeseries lifecycle ownership moves into page-owned runtime modules.

**Architecture:** Keep the current transport contract and most of the landed refactor intact. Extract dataset bootstrap and dataset-refresh orchestration out of `app.ts`, introduce a real Timeseries runtime owner that uses the shared page runtime vocabulary, and remove the remaining per-page control/lifecycle glue from the composition root. Treat unused imports as cleanup only after the architectural seams are in place.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, DOM-first page controllers, shared page runtime helpers, modular store slices.

---

## Why This Is Needed

This work is needed for the vision.

`ai/frontend/Vision.md` sets three relevant requirements:

- `app/*` is only the composition root
- `pages/*` own page runtime behavior
- shared runtime helpers are canonical owners, not optional conveniences

The current frontend is close, but it still falls short specifically in the Timeseries path:

- `frontend/src/app.ts` still owns dataset bootstrap and dataset-refresh orchestration
- `frontend/src/app.ts` still owns Timeseries activation and page-change wiring
- `frontend/src/app.ts` still exposes Timeseries control trampolines that are page-specific
- `frontend/src/pages/timeseriesPage.ts` owns fetch/render behavior but does not yet own page lifecycle through `pages/shared/pageRuntime.ts`

The unused imports and dead flags are not, by themselves, vision blockers. They are cleanup symptoms. The actual vision blockers are ownership and lifecycle.

## Audit Status

Audit date: `2026-06-02`

Verified live status during plan creation:

- `frontend/src/app.ts` still contains:
  - `storeFetchedMetadata(...)`
  - `initializeDatasetUi(...)`
  - `ensureDatasetReady(...)`
  - `refreshDatasetAfterMutation(...)`
  - `rebuildTimeseriesColumns` / `rebuildTimeseriesRanges`
  - direct `window.addEventListener('edatime:page-change', ...)` wiring for Timeseries
- `frontend/src/pages/timeseriesPage.ts` still exports only the fetch/render controller surface:
  - `emitChartRangeChange`
  - `fetchAndRender`
  - `onZoomRangeChange`
  - `renderCurrentData`
- `frontend/src/app/bootstrap/ensureTimeseriesReady.ts` already contains the chart/bootstrap logic that used to be inline, so that part should be preserved and reused rather than rewritten.
- `frontend/src/pages/shared/pageRuntime.ts` and `frontend/src/pages/shared/analysisPageRuntime.ts` are live and tested, but Timeseries is not yet using them for lifecycle ownership.

## Scope

This plan is intentionally narrow.

It covers:

- Timeseries dataset bootstrap ownership
- Timeseries lifecycle ownership
- removal of Timeseries per-page trampolines from `app.ts`
- final cleanup of dead app-local flags/imports made obsolete by the ownership move

It does not cover:

- drift/causal/upload refactors already landed
- transport boundary changes
- CSS cleanup unrelated to the Timeseries lifecycle seam

## File Map

### New runtime/bootstrap seams

- **Create:** `frontend/src/app/bootstrap/datasetBootstrap.ts`
  - Dataset metadata bootstrap and post-mutation refresh owner.
- **Create:** `frontend/src/app/bootstrap/datasetBootstrap.test.ts`
  - Focused tests for bootstrap sequencing and refresh behavior.
- **Create:** `frontend/src/pages/timeseriesRuntime.ts`
  - Canonical Timeseries page lifecycle owner using shared runtime vocabulary.
- **Create:** `frontend/src/pages/timeseriesRuntime.test.ts`
  - Focused tests for Timeseries page activation/init behavior.
- **Create:** `frontend/src/pages/timeseriesModule.ts`
  - Local composition seam for Timeseries page + feature + runtime callbacks.
- **Create:** `frontend/src/pages/timeseriesModule.test.ts`
  - Locks down the internal page/feature/runtime boundary.

### Existing files to modify

- **Modify:** `frontend/src/app.ts`
  - Reduce to top-level composition and bootstrap registration only.
- **Modify:** `frontend/src/pages/timeseriesPage.ts`
  - Keep fetch/render/chart behavior page-local, but stop treating it as the lifecycle owner.
- **Modify:** `frontend/src/features/timeseries/entrypoint.ts`
  - Keep the public feature surface, but let the Timeseries module hold the stable handles instead of `app.ts`.
- **Modify:** `frontend/src/app/runtime.test.ts`
  - Add coverage for the thinner root.
- **Modify:** `frontend/src/app/shell.test.ts`
  - Ensure shell setup remains stable while ownership moves.
- **Modify:** `frontend/src/features/timeseries/entrypoint.test.ts`
  - Ensure the feature surface remains the same.

## Non-Goals

Do not use this plan to:

- rewrite Timeseries into a framework
- move fetch ownership out of `frontend/src/pages/timeseriesPage.ts`
- move feature workflow out of `frontend/src/features/timeseries/*`
- refactor unrelated unused imports before the ownership split lands

### Task 1: Freeze The Current Timeseries Bootstrap And Lifecycle Behavior

**Files:**

- Modify: `frontend/src/app/runtime.test.ts`
- Modify: `frontend/src/app/shell.test.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`
- Create: `frontend/src/app/bootstrap/datasetBootstrap.test.ts`
- Create: `frontend/src/pages/timeseriesRuntime.test.ts`
- Create: `frontend/src/pages/timeseriesModule.test.ts`

- [ ] **Step 1: Add a failing test for dataset bootstrap sequencing**

Lock the existing order:

1. chart modules become available
2. metadata is fetched
3. metadata is stored and marked ready
4. selected/numeric columns are normalized
5. UI hydration runs
6. Timeseries feature init happens once

Target API to test:

```ts
const bootstrap = createDatasetBootstrap({
    ensureChartModules,
    fetchMetadata,
    storeFetchedMetadata,
    initializeDatasetUi,
    markMetadataReady,
    setNumericColumns,
    setDefaultSelectedColumns,
    sanitizeSelectedColumns,
});
```

- [ ] **Step 2: Add a failing test for post-mutation refresh behavior**

Lock the existing refresh order:

1. clear loaded page modules
2. fetch fresh metadata
3. store metadata and mark ready
4. update numeric/selected columns
5. rebuild Timeseries UI
6. re-fetch visible data

- [ ] **Step 3: Add a failing test for Timeseries lifecycle ownership**

Create a focused test that proves the Timeseries runtime:

- initializes its feature once
- calls `ensureReady()` when the `timeseries` page becomes visible
- does not initialize on other page activations
- uses page-runtime-style activation instead of app-local page listeners

Target surface:

```ts
const runtime = createTimeseriesRuntime({
    initFeature,
    ensureReady,
    onVisible,
});
```

- [ ] **Step 4: Add a failing test for internal Timeseries composition**

Create a test for the planned `createTimeseriesModule(...)` seam that proves:

- page controller and feature entrypoint are composed together once
- `buildColumnToggles` and `buildRangeControls` are exposed from the module, not from app-local trampolines
- app callers use the module surface instead of reaching into page/feature internals separately

- [ ] **Step 5: Run the focused baseline**

Run:

```bash
npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/bootstrap/datasetBootstrap.test.ts frontend/src/pages/timeseriesRuntime.test.ts frontend/src/pages/timeseriesModule.test.ts
```

Expected:

- existing tests PASS
- new tests fail only for the missing seams being introduced

### Task 2: Extract Dataset Bootstrap Out Of `app.ts`

**Files:**

- Create: `frontend/src/app/bootstrap/datasetBootstrap.ts`
- Create: `frontend/src/app/bootstrap/datasetBootstrap.test.ts`
- Modify: `frontend/src/app.ts`

- [ ] **Step 1: Introduce a dedicated bootstrap owner for dataset readiness**

Create `createDatasetBootstrap(...)` to absorb logic currently embedded in:

- `storeFetchedMetadata(...)`
- `initializeDatasetUi(...)`
- `ensureDatasetReady(...)`
- `refreshDatasetAfterMutation(...)`

Suggested contract:

```ts
export interface DatasetBootstrapDeps {
    ensureChartModules: () => Promise<void>;
    fetchMetadata: () => Promise<DatasetMetadata>;
    markMetadataReady: () => void;
    clearLoadedPageModules: () => void;
    storeFetchedMetadata: (metadata: DatasetMetadata) => void;
    initializeDatasetUi: (metadata: DatasetMetadata) => void;
    initializeSelectedColumns: (metadata: DatasetMetadata) => void;
    sanitizeSelectedColumns: () => void;
    refreshVisibleData: () => Promise<void>;
    onMetadataReady?: () => void;
}
```

- [ ] **Step 2: Keep mutation refresh in the same owner**

The dataset bootstrap module should also expose:

```ts
refreshAfterMutation(options?: { selectedColumn?: string }): Promise<void>
```

This keeps dataset refresh ownership in one place instead of splitting bootstrap and refresh across `app.ts`.

- [ ] **Step 3: Leave only metadata-independent wrappers in `app.ts`**

After extraction, `app.ts` should only:

- construct the bootstrap object
- register `window.__edatime.ensureDatasetReady`
- pass the refresh callback to shell/bootstrap consumers

It should no longer contain the full metadata bootstrap algorithm inline.

- [ ] **Step 4: Run the bootstrap-focused tests**

Run:

```bash
npm test -- frontend/src/app/bootstrap/datasetBootstrap.test.ts frontend/src/app/runtime.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/bootstrap/datasetBootstrap.ts frontend/src/app/bootstrap/datasetBootstrap.test.ts frontend/src/app.ts frontend/src/app/runtime.test.ts
git commit -m "refactor: extract dataset bootstrap from app root"
```

### Task 3: Introduce A Canonical Timeseries Runtime Owner

**Files:**

- Create: `frontend/src/pages/timeseriesRuntime.ts`
- Create: `frontend/src/pages/timeseriesRuntime.test.ts`
- Modify: `frontend/src/app.ts`

- [ ] **Step 1: Build a Timeseries runtime on top of `createPageRuntime(...)`**

Do not invent a new lifecycle system. Use the existing shared runtime vocabulary.

Target shape:

```ts
export interface TimeseriesRuntimeDeps {
    initFeature: () => void;
    ensureReady: () => Promise<void>;
}

export function createTimeseriesRuntime(deps: TimeseriesRuntimeDeps) {
    return createPageRuntime({
        page: 'timeseries',
        emptyStateRootId: 'timeseries-empty-state',
        init: () => deps.initFeature(),
        onVisible: () => {
            void deps.ensureReady();
        },
    });
}
```

- [ ] **Step 2: Remove app-local page-change wiring for Timeseries**

Delete the inline listener currently added from `initializeDatasetUi(...)`:

```ts
window.addEventListener('edatime:page-change', ...)
```

That behavior should now be owned by the runtime’s `mount()` call.

- [ ] **Step 3: Mount the runtime from app composition**

`app.ts` should compose the runtime and register its cleanup through `createAppRuntime()`, but it should not directly implement page activation behavior.

- [ ] **Step 4: Verify the runtime migration**

Run:

```bash
npm test -- frontend/src/pages/timeseriesRuntime.test.ts frontend/src/app/shell.test.ts frontend/src/app/runtime.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/timeseriesRuntime.ts frontend/src/pages/timeseriesRuntime.test.ts frontend/src/app.ts frontend/src/app/shell.test.ts frontend/src/app/runtime.test.ts
git commit -m "refactor: move timeseries lifecycle into page runtime"
```

### Task 4: Remove The Timeseries Trampolines From `app.ts`

**Files:**

- Create: `frontend/src/pages/timeseriesModule.ts`
- Create: `frontend/src/pages/timeseriesModule.test.ts`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/pages/timeseriesPage.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`

- [ ] **Step 1: Introduce a Timeseries local composition seam**

Create `createTimeseriesModule(...)` as the page-local composition owner for:

- `createTimeseriesPageController(...)`
- `createTimeseriesEntrypoint(...)`
- `createTimeseriesRuntime(...)`
- `createTimeseriesBootstrap(...)`

This module should provide a stable surface to `app.ts`, for example:

```ts
export interface TimeseriesModule {
    mount(): () => void;
    ensureDatasetReady: () => Promise<void>;
    ensureReady: () => Promise<void>;
    fetchAndRender: () => Promise<void>;
    renderCurrentData: () => void;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    onZoomRangeChange: (start: number, end: number, sourceKind?: string) => void;
    refreshAfterMutation: (options?: { selectedColumn?: string }) => Promise<void>;
}
```

- [ ] **Step 2: Move `rebuildTimeseriesColumns` / `rebuildTimeseriesRanges` into that module**

The composition root should stop owning:

```ts
const rebuildTimeseriesColumns = ...
const rebuildTimeseriesRanges = ...
```

Those stable callbacks belong inside the Timeseries-local composition seam, where the page controller and feature entrypoint already know each other.

- [ ] **Step 3: Keep the public feature surface stable**

Do not rewrite `createTimeseriesEntrypoint(...)` into a different API unless necessary. The goal is to move where it is composed, not to re-invent its contract.

- [ ] **Step 4: Shrink `app.ts` to consuming the module**

After this task, `app.ts` should talk to Timeseries through the module surface instead of separately owning:

- page controller
- feature entrypoint
- runtime listener
- bootstrap hooks
- UI rebuild trampolines

- [ ] **Step 5: Verify the module split**

Run:

```bash
npm test -- frontend/src/pages/timeseriesModule.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/runtime.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/timeseriesModule.ts frontend/src/pages/timeseriesModule.test.ts frontend/src/app.ts frontend/src/pages/timeseriesPage.ts frontend/src/features/timeseries/entrypoint.ts frontend/src/features/timeseries/entrypoint.test.ts
git commit -m "refactor: localize timeseries composition"
```

### Task 5: Do The Post-Split Hygiene Cleanup

**Files:**

- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/pages/timeseriesPage.ts`

- [ ] **Step 1: Remove now-dead flags and imports created by the old ownership model**

Only after Tasks 2-4 land, remove the unused items that no longer make sense, including stale root-level flags and imports tied to the old bootstrap/lifecycle arrangement.

- [ ] **Step 2: Do not mix speculative cleanup into the architecture tasks**

If a symbol is still needed during the refactor, leave it until the end. The goal is to keep architectural moves reviewable and low-risk.

- [ ] **Step 3: Run the full focused verification**

Run:

```bash
npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/app/pageLifecycle.test.ts frontend/src/pages/shared/pageRuntime.test.ts frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/bootstrap/datasetBootstrap.test.ts frontend/src/pages/timeseriesRuntime.test.ts frontend/src/pages/timeseriesModule.test.ts
npm run validate
```

Expected:

- PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app.ts frontend/src/pages/timeseriesPage.ts frontend/src/app/bootstrap/datasetBootstrap.ts frontend/src/pages/timeseriesRuntime.ts frontend/src/pages/timeseriesModule.ts frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/bootstrap/datasetBootstrap.test.ts frontend/src/pages/timeseriesRuntime.test.ts frontend/src/pages/timeseriesModule.test.ts
git commit -m "refactor: finish timeseries lifecycle and bootstrap ownership"
```

## Success Criteria

- `frontend/src/app.ts` no longer contains the full dataset bootstrap or Timeseries refresh algorithm inline.
- Timeseries page activation is owned by a page runtime module using the shared runtime vocabulary.
- `app.ts` no longer owns page-specific rebuild trampolines for Timeseries controls.
- `frontend/src/pages/timeseriesPage.ts` remains the page-local fetch/render/chart controller.
- `frontend/src/features/timeseries/*` remains the feature workflow owner.
- Unused imports tied to the old ownership model are removed as a final cleanup step, not treated as the primary objective.
