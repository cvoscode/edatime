# Timeseries Vision Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish and stabilize the current Timeseries architecture refactor so the frontend actually satisfies `ai/frontend/Vision.md` at runtime without changing user-visible behavior.

**Architecture:** Keep the new `timeseriesModule` / `timeseriesRuntime` / `datasetBootstrap` seams, but replace all placeholder wiring with real dependencies, add integration coverage for the real app bootstrap path, and verify that `app.ts` stays a thin composition root while `pages/*` own runtime behavior. This is not a fresh redesign; it is completion and hardening of the partially landed Vision implementation.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, DOM-first page controllers, shared page runtime helpers, modular store slices.

---

## Why This Plan Is Needed

Yes, there is still required refactoring for `Vision.md`.

The current code has the right target seams, but the implementation is incomplete:

- `frontend/src/pages/timeseriesModule.ts` still contains placeholder/no-op deps:
  - `fetchMetadata: () => { throw new Error('fetchMetadata not wired'); }`
  - `getSelectedCols: () => []`
  - `sanitizeSelectedColumns: () => {}`
  - `clearLoadedPageModules: () => {}`
  - `ensureSessionPersistenceStarted: () => {}`
- `frontend/src/app/bootstrap/datasetBootstrap.ts` imports and performs global work internally instead of consistently using the deps passed to it.
- Current tests prove the module surfaces exist, but they do **not** prove the real app bootstrap path works with the actual dependencies wired together.

So the answer is:

- the broad Vision refactor is mostly done
- but the Timeseries bootstrap/lifecycle path is **not fully implemented yet**
- therefore a focused implementation plan is still needed

## Current Evidence

Verified against the live codebase:

- `frontend/src/app.ts` is now only `188` lines and consumes `createTimeseriesModule(...)`
- `frontend/src/pages/timeseriesRuntime.ts` exists and uses `createPageRuntime(...)`
- `frontend/src/app/bootstrap/datasetBootstrap.ts` exists
- `npm run validate` passes
- `npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/bootstrap/datasetBootstrap.test.ts frontend/src/pages/timeseriesRuntime.test.ts frontend/src/pages/timeseriesModule.test.ts` passes

However, the passing tests are too indirect to prove completion because they miss the incomplete wiring listed above.

## Scope

This plan covers:

- wiring the new Timeseries abstractions with real runtime dependencies
- moving `datasetBootstrap.ts` to a true dependency-driven owner
- adding tests that exercise the actual bootstrap path instead of only mocked surfaces
- preserving current user-visible behavior

This plan does not cover:

- drift/causal/upload refactors
- CSS ownership changes
- backend contract changes

## File Map

### Core Timeseries wiring

- **Modify:** `frontend/src/pages/timeseriesModule.ts`
  - Replace placeholder deps with real inputs and stable composition.
- **Modify:** `frontend/src/app/bootstrap/datasetBootstrap.ts`
  - Make it fully dependency-driven and remove hidden global ownership where possible.
- **Modify:** `frontend/src/app.ts`
  - Pass real deps into the Timeseries module and keep root-level composition only.
- **Modify:** `frontend/src/pages/timeseriesRuntime.ts`
  - Only if needed for real lifecycle cleanup/ownership.
- **Modify:** `frontend/src/pages/timeseriesPage.ts`
  - Only if needed to clarify page-controller vs runtime responsibilities.

### Tests to harden the real path

- **Modify:** `frontend/src/pages/timeseriesModule.test.ts`
  - Stop accepting placeholder wiring as success.
- **Modify:** `frontend/src/app/bootstrap/datasetBootstrap.test.ts`
  - Test the real exported API rather than a mocked surrogate contract.
- **Create:** `frontend/src/app/timeseriesBootstrap.integration.test.ts`
  - App-level integration test for bootstrap wiring.
- **Modify:** `frontend/src/app/runtime.test.ts`
  - Ensure the thinner root still exposes the required cleanup/runtime behavior.
- **Modify:** `frontend/src/app/shell.test.ts`
  - Verify shell integration still works when Timeseries bootstrap is fully wired.

## Non-Goals

Do not use this plan to:

- replace the new module/runtime/bootstrap split with another abstraction
- move Timeseries fetch/render ownership out of `frontend/src/pages/timeseriesPage.ts`
- change user-facing interactions, page ids, control ids, or backend calls
- clean up every unrelated unused import in the repo

### Task 1: Write Failing Tests For The Real Missing Wiring

**Files:**

- Modify: `frontend/src/pages/timeseriesModule.test.ts`
- Modify: `frontend/src/app/bootstrap/datasetBootstrap.test.ts`
- Create: `frontend/src/app/timeseriesBootstrap.integration.test.ts`

- [ ] **Step 1: Add a failing unit test proving `timeseriesModule` requires real `fetchMetadata` wiring**

Replace the current mock-only acceptance test with a test that asserts the module forwards a real `fetchMetadata` dependency into `createDatasetBootstrap(...)`.

Target assertion shape:

```ts
expect(mockCreateDatasetBootstrap).toHaveBeenCalledWith(expect.objectContaining({
    fetchMetadata,
    sanitizeSelectedColumns,
    clearLoadedPageModules,
    getSelectedCols,
    setSelectedCols,
}));
```

- [ ] **Step 2: Run the focused module test and verify RED**

Run:

```bash
npm test -- frontend/src/pages/timeseriesModule.test.ts
```

Expected:

- FAIL because the current implementation still passes placeholders/no-ops

- [ ] **Step 3: Add a failing dataset bootstrap test proving it uses injected deps, not hidden imports, for state changes**

Write a test that constructs the real `createDatasetBootstrap(...)` and verifies:

- injected `storeFetchedMetadata` is called
- injected `markMetadataReady` is called
- injected `buildMetaBar` is called
- injected `setMetaText` is used on missing time range

Do not rely only on global store mocks; assert dependency callbacks are the ones invoked.

- [ ] **Step 4: Run the bootstrap test and verify RED**

Run:

```bash
npm test -- frontend/src/app/bootstrap/datasetBootstrap.test.ts
```

Expected:

- FAIL because the current implementation still performs part of the work internally

- [ ] **Step 5: Add a failing app-level integration test for Timeseries dataset readiness**

Create `frontend/src/app/timeseriesBootstrap.integration.test.ts` that covers this real flow:

1. app boot creates `timeseriesModule`
2. initial page requires dataset bootstrap
3. `window.__edatime.ensureDatasetReady()` resolves
4. metadata setup triggers Timeseries UI hydration
5. no placeholder dependency throws

Minimal skeleton:

```ts
it('boots timeseries dataset readiness through the real module wiring', async () => {
  const ensureDatasetReady = await bootAppAndGetEnsureDatasetReady();
  await expect(ensureDatasetReady()).resolves.toBeUndefined();
});
```

- [ ] **Step 6: Run the integration test and verify RED**

Run:

```bash
npm test -- frontend/src/app/timeseriesBootstrap.integration.test.ts
```

Expected:

- FAIL, most likely with `fetchMetadata not wired`

### Task 2: Wire `timeseriesModule` With Real Dependencies

**Files:**

- Modify: `frontend/src/pages/timeseriesModule.ts`
- Modify: `frontend/src/app.ts`

- [ ] **Step 1: Expand the module deps so the composition root passes the real Timeseries bootstrap inputs**

Update `TimeseriesModuleDeps` to accept the real bootstrap collaborators currently faked or omitted:

```ts
export interface TimeseriesModuleDeps {
    fetchData: ...;
    fetchMetadata: () => Promise<DatasetMetadata>;
    sanitizeSelectedColumns: () => void;
    clearLoadedPageModules: () => void;
    ensureSessionPersistenceStarted: () => void;
    getSelectedCols: () => string[];
    setSelectedCols: (cols: string[]) => void;
    setNumericCols: (cols: string[]) => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    setViewport: (start: number, end: number) => void;
    ...
}
```

- [ ] **Step 2: Remove all placeholder/no-op dependency bodies from `timeseriesModule.ts`**

Eliminate these current anti-patterns:

```ts
fetchMetadata: () => { throw new Error('fetchMetadata not wired'); }
getSelectedCols: () => []
sanitizeSelectedColumns: () => {}
clearLoadedPageModules: () => {}
ensureSessionPersistenceStarted: () => {}
```

All of them must be replaced by real closures from `app.ts`.

- [ ] **Step 3: Keep `app.ts` as a composition root while passing the real deps**

`app.ts` should wire the real callbacks, not reclaim the bootstrap logic. Pass existing root-owned capabilities in, for example:

```ts
timeseriesModule = createTimeseriesModule({
    fetchMetadata: () => fetchMetadata!(),
    sanitizeSelectedColumns,
    clearLoadedPageModules,
    ensureSessionPersistenceStarted,
    getSelectedCols: () => appState.selectedCols,
    setSelectedCols,
    setNumericCols,
    setAdaptiveFilterColumn,
    setViewport,
    ...
});
```

- [ ] **Step 4: Run the module and integration tests**

Run:

```bash
npm test -- frontend/src/pages/timeseriesModule.test.ts frontend/src/app/timeseriesBootstrap.integration.test.ts
```

Expected:

- PASS

### Task 3: Make `datasetBootstrap.ts` Fully Dependency-Driven

**Files:**

- Modify: `frontend/src/app/bootstrap/datasetBootstrap.ts`
- Modify: `frontend/src/app/bootstrap/datasetBootstrap.test.ts`

- [ ] **Step 1: Stop shadowing injected callbacks with internal implementations**

Right now the file accepts callbacks like `storeFetchedMetadata`, `markMetadataReady`, and `initializeDatasetUi`, but also defines internal behavior for the same concerns. Collapse this into one clear ownership model: injected dependency callbacks are authoritative.

If helper logic is useful, expose pure local helpers and call them from the injected callbacks rather than bypassing the deps.

- [ ] **Step 2: Split the hidden local work into explicit injected responsibilities**

Recommended dependency surface:

```ts
export interface DatasetBootstrapDeps {
    ensureChartModules: () => Promise<void>;
    fetchMetadata: () => Promise<DatasetMetadata>;
    storeFetchedMetadata: (metadata: DatasetMetadata) => void;
    markMetadataReady: () => void;
    initializeDatasetUi: (metadata: DatasetMetadata) => void;
    initializeSelectedColumns: (metadata: DatasetMetadata) => void;
    sanitizeSelectedColumns: () => void;
    refreshVisibleData: () => Promise<void>;
    clearLoadedPageModules: () => void;
    onMissingTimeRange: () => void;
}
```

Where:

- `initializeSelectedColumns(...)` owns numeric/default/adaptive column setup
- `initializeDatasetUi(...)` owns profile grid, meta bar, time range UI, workflow refresh, viewport sync
- `onMissingTimeRange()` owns the user-visible empty/error messaging

- [ ] **Step 3: Make refresh reuse the same explicit ownership**

`refreshAfterMutation(...)` should call the injected dependencies in order rather than reimplementing partial state logic locally.

- [ ] **Step 4: Run the bootstrap tests**

Run:

```bash
npm test -- frontend/src/app/bootstrap/datasetBootstrap.test.ts
```

Expected:

- PASS

### Task 4: Verify Runtime Ownership Still Lives In `pages/*`

**Files:**

- Modify: `frontend/src/pages/timeseriesRuntime.ts`
- Modify: `frontend/src/pages/timeseriesPage.ts`
- Modify: `frontend/src/app/timeseriesBootstrap.integration.test.ts`

- [ ] **Step 1: Confirm `timeseriesRuntime.ts` only owns lifecycle and activation**

Its contract should stay narrow:

```ts
export function createTimeseriesRuntime(deps: {
    initFeature: () => void;
    ensureReady: () => Promise<void>;
})
```

Do not move fetch/render/bootstrap logic into the runtime.

- [ ] **Step 2: Verify `timeseriesPage.ts` remains the page controller**

Keep these responsibilities in `timeseriesPage.ts`:

- fetch/render sequencing
- chart data updates
- page-local loading and empty-state behavior
- zoom/refetch orchestration

Only adjust this file if the integration tests show the controller/runtime boundary is still blurred.

- [ ] **Step 3: Add one integration assertion for page visibility activation**

Extend the app-level integration test to prove:

```ts
dispatchPageChange('timeseries');
await waitFor(...ensureReady called...);
```

and verify a non-timeseries page does not trigger the same path.

- [ ] **Step 4: Run the runtime-focused tests**

Run:

```bash
npm test -- frontend/src/pages/timeseriesRuntime.test.ts frontend/src/app/timeseriesBootstrap.integration.test.ts
```

Expected:

- PASS

### Task 5: Final Verification And Cleanup

**Files:**

- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/pages/timeseriesModule.ts`
- Modify: `frontend/src/app/bootstrap/datasetBootstrap.ts`

- [ ] **Step 1: Remove any now-dead placeholder comments and temporary compatibility code**

Delete comments like:

```ts
// placeholder — app.ts will provide via closure
// no-op: chart modules loaded before this module is created
```

once the real wiring is present.

- [ ] **Step 2: Keep the root thin**

Before finishing, inspect `frontend/src/app.ts` and confirm it still only:

- loads modules
- wires dependencies
- mounts runtimes
- registers global shell/bootstrap behavior

If implementation logic has drifted back into `app.ts`, move it back down before claiming success.

- [ ] **Step 3: Run the full focused verification**

Run:

```bash
npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/bootstrap/datasetBootstrap.test.ts frontend/src/pages/timeseriesRuntime.test.ts frontend/src/pages/timeseriesModule.test.ts frontend/src/app/timeseriesBootstrap.integration.test.ts
npm run validate
```

Expected:

- PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app.ts frontend/src/pages/timeseriesModule.ts frontend/src/app/bootstrap/datasetBootstrap.ts frontend/src/pages/timeseriesRuntime.ts frontend/src/pages/timeseriesPage.ts frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/app/bootstrap/datasetBootstrap.test.ts frontend/src/pages/timeseriesRuntime.test.ts frontend/src/pages/timeseriesModule.test.ts frontend/src/app/timeseriesBootstrap.integration.test.ts
git commit -m "refactor: finish timeseries vision wiring"
```

## Success Criteria

- `window.__edatime.ensureDatasetReady()` works through the real Timeseries module wiring without placeholder failures.
- `timeseriesModule.ts` contains no fake/no-op bootstrap dependencies.
- `datasetBootstrap.ts` is genuinely dependency-driven rather than partially hardcoded.
- `app.ts` remains a composition root instead of regaining bootstrap logic.
- Timeseries lifecycle is owned by `pages/timeseriesRuntime.ts`, while fetch/render remains owned by `pages/timeseriesPage.ts`.
- The user should not see a behavioral difference, but the internal ownership must match `ai/frontend/Vision.md`.
