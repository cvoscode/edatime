# Frontend Feature-First Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the live frontend into clearer app, page, feature, shared-runtime, and UI ownership boundaries without changing the Rust/TypeScript transport contract.

**Architecture:** Strengthen the shared page runtime first, then finish Timeseries ownership, then normalize repeated async request lifecycle patterns, then split the largest mixed-responsibility page and feature modules, and finally consolidate remaining shared UI behavior that has real multi-page reuse.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, DOM-first page controllers, ECharts, ChartGPU, Node-based architecture checks.

---

## Audit Status

Audit date: `2026-06-02`

Fresh verification evidence:

- `npm test -- frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/pages/shared/pageRuntime.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/upload/entrypoint.test.ts frontend/src/scatter/scatterPage.test.ts frontend/src/drift/driftPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/ui/upload.test.ts`
  - Result: `8` test files passed, `72` tests passed
- `npm run typecheck`
  - Result: exit `0`
- `npm run validate`
  - Result: exit `0`, frontend architecture checks passed

Implementation status after audit:

- Task 1: substantially implemented
- Task 2: substantially implemented, with `app.ts` still larger than the target end state
- Task 3: implemented
- Task 4: implemented
- Task 5: substantially implemented
- Task 6: partially implemented and still relevant as cleanup/guardrail work

The steps below should now be read as an implementation/cleanup checklist for remaining drift, not as a greenfield execution plan.

## Contract Fence

Treat these as fixed during implementation:

- `ai/contract.md`
- `frontend/src/services/api/*`
- current route names and page ids
- current export ids and filenames
- current DOM ids used by empty states, page switches, chart containers, and toolbar controls

Only `frontend/src/services/api/*` may own `fetch(...)`, response headers, and transport parsing.

### Task 1: Canonicalize Shared Page Runtime

**Files:**
- Modify: `frontend/src/pages/shared/pageRuntime.ts`
- Modify: `frontend/src/pages/shared/pageRuntime.test.ts`
- Modify: `frontend/src/pages/shared/analysisPageRuntime.ts`
- Modify: `frontend/src/pages/shared/analysisPageRuntime.test.ts`
- Modify: `frontend/src/pages/fftPage.ts`
- Modify: `frontend/src/pages/heatmapPage.ts`
- Modify: `frontend/src/pages/spectrogramPage.ts`
- Modify: `frontend/src/scatter/scatterPage.ts`
- Modify: `frontend/src/drift/driftPage.ts`

- [ ] **Step 1: Freeze current lifecycle behavior with focused tests**

Add tests that prove the shared runtime owns:

- one-time init
- on-visible lifecycle
- lazy empty-state creation
- status updates
- loading visibility
- export binding idempotence

Use a minimal generic surface like:

```ts
const runtime = createPageRuntime({
    page: 'fft',
    emptyStateRootId: 'fft-empty-state',
    statusElId: 'fft-status',
    loadingElId: 'fft-loading',
    init,
    onVisible,
});
```

- [ ] **Step 2: Run the runtime-focused tests before implementation**

Run:

```bash
npm test -- frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/app/pageLifecycle.test.ts
```

Expected:

- PASS, or a focused failing test that captures the runtime gap before migration

- [ ] **Step 3: Strengthen the generic runtime and reduce `analysisPageRuntime.ts` to an analysis adapter**

Create `pageRuntime.ts` with a narrow surface:

```ts
export interface PageRuntimeOptions {
    page: string;
    emptyStateRootId?: string;
    statusElId?: string;
    loadingElId?: string;
    init?: () => void | (() => void);
    onVisible?: () => void;
    onEveryPageChange?: () => void;
}
```

Expose methods for:

- `mount()`
- `updateEmptyState(...)`
- `updateStatus(...)`
- `setLoading(...)`

Keep export binding in `analysisPageRuntime.ts`, but stop re-implementing lifecycle there.

- [ ] **Step 4: Migrate analysis pages in low-risk order**

Migrate these pages onto the runtime in this order:

1. `frontend/src/pages/fftPage.ts`
2. `frontend/src/pages/heatmapPage.ts`
3. `frontend/src/pages/spectrogramPage.ts`
4. `frontend/src/scatter/scatterPage.ts`
5. `frontend/src/drift/driftPage.ts`

Keep page-specific fetch/render logic local. Move only shell ownership.

- [ ] **Step 5: Verify the runtime migration**

Run:

```bash
npm test -- frontend/src/pages/fftPage.test.ts frontend/src/pages/heatmapPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/scatter/scatterPage.test.ts frontend/src/drift/driftPage.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/shared/pageRuntime.ts frontend/src/pages/shared/pageRuntime.test.ts frontend/src/pages/shared/analysisPageRuntime.ts frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/pages/fftPage.ts frontend/src/pages/heatmapPage.ts frontend/src/pages/spectrogramPage.ts frontend/src/scatter/scatterPage.ts frontend/src/drift/driftPage.ts
git commit -m "refactor: canonicalize shared page runtime"
```

### Task 2: Finish Timeseries Ownership

**Files:**
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/pages/timeseriesPage.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.ts`
- Modify: `frontend/src/features/timeseries/actions.ts`
- Modify: `frontend/src/features/timeseries/columnsController.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`
- Modify: `frontend/src/pages/timeseriesPage.test.ts` or create one if missing

- [ ] **Step 1: Add tests that lock the page/feature/app boundary**

Add or extend tests so they prove:

- `app.ts` composes Timeseries dependencies but does not own chip/filter workflow
- `timeseriesPage.ts` owns fetch/render/viewport behavior
- `entrypoint.ts` owns control init and rebuild hooks

Use dependency seams like:

```ts
const feature = createTimeseriesEntrypoint({
    fetchAndRender,
    renderCurrentData,
    updateAnalysisYRange,
    updateAnalysisZoom,
    emitChartRangeChange,
    registerCleanup,
});
```

- [ ] **Step 2: Run focused Timeseries tests before moving logic**

Run:

```bash
npm test -- frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts
```

Expected:

- PASS, or a targeted failure that confirms the current overlap

- [ ] **Step 3: Move remaining Timeseries workflow ownership out of `app.ts`**

Keep `app.ts` responsible for:

- creating the page controller
- creating the feature entrypoint
- wiring dependencies
- startup order

Keep `timeseriesPage.ts` responsible for:

- fetch request kickoff
- loading state
- empty-state updates
- chart updates
- viewport sync

Keep `features/timeseries/*` responsible for:

- chip rendering and rebuilds
- filter/range action wiring
- search inputs
- feature-specific events

- [ ] **Step 4: Introduce small local helpers only where they remove real duplication**

Acceptable helper seams:

- viewport-to-ISO conversion
- chart width selection
- local loading/status transitions

Do not move fetch ownership out of `timeseriesPage.ts`.

- [ ] **Step 5: Verify Timeseries behavior**

Run:

```bash
npm test -- frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/shell.test.ts frontend/src/app/runtime.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app.ts frontend/src/pages/timeseriesPage.ts frontend/src/features/timeseries/entrypoint.ts frontend/src/features/timeseries/actions.ts frontend/src/features/timeseries/columnsController.ts frontend/src/features/timeseries/entrypoint.test.ts
git commit -m "refactor: finish timeseries ownership"
```

### Task 3: Normalize Abortable Page Request Flows

**Files:**
- Create: `frontend/src/pages/shared/requestTask.ts`
- Create: `frontend/src/pages/shared/requestTask.test.ts`
- Modify: `frontend/src/pages/timeseriesPage.ts`
- Modify: `frontend/src/scatter/scatterPage.ts`
- Modify: `frontend/src/drift/driftPage.ts`
- Modify: `frontend/src/pages/spectrogramChartRuntime.ts`
- Modify: `frontend/src/ui/upload.ts`

- [ ] **Step 1: Add tests around the repeated request lifecycle**

The helper should be proven to own:

- replacing old `AbortController`
- ignoring `AbortError`
- toggling loading in a predictable way
- leaving page-specific success rendering outside the helper

Target shape:

```ts
const task = createRequestTask({
    setLoading,
    onError(message) {
        runtime.updateStatus(message);
    },
});
```

- [ ] **Step 2: Run request-task tests before implementation**

Run:

```bash
npm test -- frontend/src/scatter/scatterPage.test.ts frontend/src/drift/driftPage.test.ts
```

Expected:

- PASS, or focused failures that reveal duplicated lifecycle assumptions

- [ ] **Step 3: Introduce a narrow shared helper**

The helper should:

- create and replace the current abort controller
- expose the active signal
- call `setLoading(true|false)`
- swallow `AbortError`
- forward other errors to the page

It should not:

- call transport directly
- convert ranges to ISO
- know anything about page-specific DOM

- [ ] **Step 4: Adopt the helper page by page**

Migration order:

1. `frontend/src/pages/timeseriesPage.ts`
2. `frontend/src/scatter/scatterPage.ts`
3. `frontend/src/drift/driftPage.ts`
4. `frontend/src/pages/spectrogramChartRuntime.ts`
5. `frontend/src/ui/upload.ts`

- [ ] **Step 5: Verify page-level behavior stays stable**

Run:

```bash
npm test -- frontend/src/scatter/scatterPage.test.ts frontend/src/drift/driftPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/ui/upload.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/shared/requestTask.ts frontend/src/pages/shared/requestTask.test.ts frontend/src/pages/timeseriesPage.ts frontend/src/scatter/scatterPage.ts frontend/src/drift/driftPage.ts frontend/src/pages/spectrogramChartRuntime.ts frontend/src/ui/upload.ts
git commit -m "refactor: normalize abortable page request flows"
```

### Task 4: Split Upload Into Feature-Owned Modules

**Files:**
- Create: `frontend/src/features/upload/entrypoint.ts`
- Create: `frontend/src/features/upload/fileSource.ts`
- Create: `frontend/src/features/upload/databaseSource.ts`
- Create: `frontend/src/features/upload/preview.ts`
- Create: `frontend/src/features/upload/partialLoadControls.ts`
- Create: `frontend/src/features/upload/entrypoint.test.ts`
- Modify: `frontend/src/ui/upload.ts`
- Modify: `frontend/src/ui/upload.test.ts`
- Modify: `frontend/src/app.ts`

- [ ] **Step 1: Lock current upload behavior with focused tests**

Freeze behavior around:

- file upload flow
- preview flow
- partial load controls
- database connect/load/disconnect flow
- profile mode/status text updates

- [ ] **Step 2: Run upload tests before extraction**

Run:

```bash
npm test -- frontend/src/ui/upload.test.ts
```

Expected:

- PASS

- [ ] **Step 3: Introduce a feature-owned entrypoint**

Use `entrypoint.ts` to compose:

- file source logic
- database source logic
- preview controller
- partial load controls

Keep `ui/upload.ts` as the rendering surface and thin facade during migration.

- [ ] **Step 4: Move upload-specific workflows out of `app.ts` and the monolith**

`app.ts` should only initialize the upload feature.

The new modules should own:

- event wiring
- source switching
- preview request lifecycle
- DB status transitions

Keep API ownership in `frontend/src/services/api/upload.ts`.

- [ ] **Step 5: Verify upload behavior**

Run:

```bash
npm test -- frontend/src/ui/upload.test.ts frontend/src/features/upload/entrypoint.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/upload/entrypoint.ts frontend/src/features/upload/fileSource.ts frontend/src/features/upload/databaseSource.ts frontend/src/features/upload/preview.ts frontend/src/features/upload/partialLoadControls.ts frontend/src/features/upload/entrypoint.test.ts frontend/src/ui/upload.ts frontend/src/ui/upload.test.ts frontend/src/app.ts
git commit -m "refactor: split upload feature ownership"
```

### Task 5: Split Scatter And Drift Into Focused Page Modules

**Files:**
- Create: `frontend/src/scatter/runtime.ts`
- Create: `frontend/src/scatter/correlationsPanel.ts`
- Create: `frontend/src/scatter/runtime.test.ts`
- Create: `frontend/src/drift/runtime.ts`
- Create: `frontend/src/drift/viewModels.ts`
- Create: `frontend/src/drift/runtime.test.ts`
- Modify: `frontend/src/scatter/scatterPage.ts`
- Modify: `frontend/src/scatter/controls.ts`
- Modify: `frontend/src/scatter/scatterPage.test.ts`
- Modify: `frontend/src/drift/driftPage.ts`
- Modify: `frontend/src/drift/controls.ts`
- Modify: `frontend/src/drift/driftPage.test.ts`

- [ ] **Step 1: Add tests that cover the seams you intend to split**

Freeze:

- scatter empty-state and view switching behavior
- correlation suggestion refresh behavior
- drift response caching and detail-panel selection behavior
- export availability behavior

- [ ] **Step 2: Run focused tests before extraction**

Run:

```bash
npm test -- frontend/src/scatter/scatterPage.test.ts frontend/src/drift/driftPage.test.ts
```

Expected:

- PASS

- [ ] **Step 3: Extract page-local coordinators without changing page ownership**

Scatter target split:

- `runtime.ts` for page runtime and loading/status seams
- `correlationsPanel.ts` for suggestion rendering and correlation refresh

Drift target split:

- `runtime.ts` for lifecycle/loading/export ownership
- `viewModels.ts` for derived response shaping and formatting helpers

Keep `scatterPage.ts` and `driftPage.ts` as public page entrypoints.

- [ ] **Step 4: Keep controls local unless they become genuinely shared**

`controls.ts` modules may stay page-local, but they should depend on explicit callbacks instead of reaching into broad page state.

- [ ] **Step 5: Verify the page splits**

Run:

```bash
npm test -- frontend/src/scatter/scatterPage.test.ts frontend/src/scatter/runtime.test.ts frontend/src/drift/driftPage.test.ts frontend/src/drift/runtime.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/scatter/runtime.ts frontend/src/scatter/correlationsPanel.ts frontend/src/scatter/runtime.test.ts frontend/src/drift/runtime.ts frontend/src/drift/viewModels.ts frontend/src/drift/runtime.test.ts frontend/src/scatter/scatterPage.ts frontend/src/scatter/controls.ts frontend/src/scatter/scatterPage.test.ts frontend/src/drift/driftPage.ts frontend/src/drift/controls.ts frontend/src/drift/driftPage.test.ts
git commit -m "refactor: split scatter and drift page modules"
```

### Task 6: Consolidate Remaining Shared UI And Guardrails

**Files:**
- Modify: `frontend/src/ui/emptyState.ts`
- Modify: `frontend/src/ui/emptyState.test.ts`
- Modify: `frontend/src/utils/bindExportButtons.ts`
- Modify: `frontend/src/utils/bindExportButtons.test.ts`
- Modify: `frontend/src/ui/seriesChipList.ts`
- Modify: `frontend/src/ui/seriesChipList.test.ts`
- Modify: `scripts/check-frontend-architecture.mjs`
- Modify: `ai/README.md`

- [ ] **Step 1: Add tests around the shared UI behavior that still duplicates**

Freeze behavior for:

- empty-state reset/clear actions
- export binding idempotence
- chip-list state preservation and color updates

- [ ] **Step 2: Run the shared UI tests before consolidation**

Run:

```bash
npm test -- frontend/src/ui/emptyState.test.ts frontend/src/utils/bindExportButtons.test.ts frontend/src/ui/seriesChipList.test.ts
```

Expected:

- PASS

- [ ] **Step 3: Consolidate only the UI seams with real multi-page consumers**

Allowable extractions:

- empty-state variants that differ only in config
- export binding helpers used by multiple pages
- chip-list behavior duplicated between Timeseries and other analysis flows

Do not introduce broad generic UI abstractions with a single consumer.

- [ ] **Step 4: Add architecture guardrails**

Update `scripts/check-frontend-architecture.mjs` so it reinforces:

- transport ownership in `services/api/*`
- page runtime ownership in `pages/shared/*`
- feature-entrypoint ownership for complex feature wiring

- [ ] **Step 5: Run final verification**

Run:

```bash
npm run test
npm run typecheck
npm run validate
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/emptyState.ts frontend/src/ui/emptyState.test.ts frontend/src/utils/bindExportButtons.ts frontend/src/utils/bindExportButtons.test.ts frontend/src/ui/seriesChipList.ts frontend/src/ui/seriesChipList.test.ts scripts/check-frontend-architecture.mjs ai/README.md
git commit -m "refactor: consolidate shared frontend UI guardrails"
```

## Review Checklist

- Every moved responsibility still has one clear owner.
- `frontend/src/services/api/*` remains the only transport boundary.
- `frontend/src/app.ts` gets smaller after every wave instead of regrowing.
- Timeseries remains the reference implementation for page/feature separation.
- Large files shrink only after shared seams are proven by tests.
