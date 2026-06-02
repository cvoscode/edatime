# Frontend Vision Alignment Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the live frontend with the architecture in `ai/frontend/Vision.md` by finishing the remaining ownership splits in `app/*`, `pages/*`, `features/*`, `ui/*`, CSS, and architectural guardrails without changing the Rust/TypeScript contract.

**Architecture:** Preserve the existing DOM-first/Vite frontend and current transport contract, but tighten the composition root, keep page controllers as runtime owners, push workflow policy into feature entrypoints, and make shared UI/CSS layers reflect the exact ownership model described in the vision. The refactor should be landed in small waves that preserve page ids, route names, export hooks, and `services/api/*` as the only transport boundary.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, ECharts, ChartGPU fallback path, modular CSS, Node-based architecture validation.

---

## Audit Status

Audit date: `2026-06-02`

Verification run during plan creation:

- `npm run validate`
  - Result: PASS
- `npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/ui/upload.test.ts frontend/src/causal/causalPage.test.ts frontend/src/drift/driftPage.test.ts`
  - Result: `5` files passed, `28` tests passed

Current hotspot evidence from the live codebase:

- `frontend/src/app.ts` is still `522` lines and remains too heavy for a pure composition root.
- `frontend/src/ui/upload.ts` is still `555` lines and still imports transport/state concerns that belong in `features/upload/*`.
- `frontend/src/drift/driftPage.ts` is still `956` lines and remains the largest mixed-responsibility page owner.
- `frontend/src/causal/causalPage.ts` is still `335` lines and still combines workflow, export, and runtime orchestration.
- `frontend/src/pages/timeseriesPage.ts` and `frontend/src/features/timeseries/*` are close to the target shape, but `app.ts` still owns too much chart bootstrap/session logic.
- `frontend/css/style.css` has a good module stack, but the four-layer ownership model from `ai/frontend/Vision.md` is not yet enforced; page-scoped styles are still only partially separated and lazy page-style loading only covers `home` and `drift`.

## Relationship To Existing Refactor Docs

This plan supersedes the remaining actionable parts of:

- `docs/superpowers/plans/2026-06-02-frontend-feature-first-consolidation.md`
- `docs/superpowers/plans/2026-06-02-frontend-shared-ui-consolidation.md`
- `docs/superpowers/specs/2026-06-02-frontend-feature-first-consolidation-design.md`

Those documents were useful intermediate plans. The live code now reflects many of their earlier waves. This document is the current execution plan for the gaps that still separate the codebase from `ai/frontend/Vision.md`.

## Contract Fence

Treat the following as fixed during implementation:

- `ai/contract.md`
- `frontend/src/services/api/*`
- current route names, page ids, export ids, modal ids, and upload control ids
- current `window.__edatime` compatibility hooks unless replaced by equivalent behavior

Only `frontend/src/services/api/*` may:

- call `fetch(...)`
- inspect transport headers
- normalize raw HTTP/Arrow/JSON response details

No part of this refactor should move transport work into `app/*`, `pages/*`, `features/*`, `ui/*`, or CSS.

## File Map

### Composition root and Timeseries boundary

- **Modify:** `frontend/src/app.ts`
- **Modify:** `frontend/src/app/runtime.ts`
- **Modify:** `frontend/src/app/bootstrap/ensureTimeseriesReady.ts`
- **Modify:** `frontend/src/app/pageModules.ts`
- **Modify:** `frontend/src/pages/timeseriesPage.ts`
- **Modify:** `frontend/src/features/timeseries/entrypoint.ts`
- **Modify:** `frontend/src/app/runtime.test.ts`
- **Modify:** `frontend/src/app/shell.test.ts`
- **Modify:** `frontend/src/features/timeseries/entrypoint.test.ts`

### Upload feature/UI split

- **Modify:** `frontend/src/ui/upload.ts`
- **Modify:** `frontend/src/features/upload/entrypoint.ts`
- **Modify:** `frontend/src/features/upload/fileSource.ts`
- **Modify:** `frontend/src/features/upload/databaseSource.ts`
- **Modify:** `frontend/src/features/upload/preview.ts`
- **Modify:** `frontend/src/features/upload/partialLoadControls.ts`
- **Modify:** `frontend/src/ui/upload.test.ts`
- **Create:** `frontend/src/features/upload/fileSource.test.ts`
- **Create:** `frontend/src/features/upload/databaseSource.test.ts`

### Drift decomposition

- **Modify:** `frontend/src/drift/driftPage.ts`
- **Modify:** `frontend/src/drift/runtime.ts`
- **Modify:** `frontend/src/drift/viewModels.ts`
- **Modify:** `frontend/src/drift/controls.ts`
- **Create:** `frontend/src/drift/selection.ts`
- **Create:** `frontend/src/drift/timelineView.ts`
- **Create:** `frontend/src/drift/detailView.ts`
- **Modify:** `frontend/src/drift/driftPage.test.ts`
- **Modify:** `frontend/src/drift/runtime.test.ts`
- **Create:** `frontend/src/drift/selection.test.ts`

### Causal decomposition

- **Modify:** `frontend/src/causal/causalPage.ts`
- **Modify:** `frontend/src/features/causal/entrypoint.ts`
- **Create:** `frontend/src/causal/runtime.ts`
- **Create:** `frontend/src/causal/export.ts`
- **Create:** `frontend/src/causal/workflow.ts`
- **Modify:** `frontend/src/causal/causalPage.test.ts`
- **Create:** `frontend/src/causal/export.test.ts`
- **Create:** `frontend/src/causal/workflow.test.ts`
- **Modify:** `frontend/src/features/causal/entrypoint.test.ts`

### CSS ownership and guardrails

- **Modify:** `frontend/css/style.css`
- **Modify:** `frontend/css/modules/layout.css`
- **Modify:** `frontend/css/modules/toolbar.css`
- **Modify:** `frontend/css/modules/upload.css`
- **Modify:** `frontend/css/modules/scatter.css`
- **Modify:** `frontend/css/modules/drift.css`
- **Modify:** `frontend/css/modules/home.css`
- **Modify:** `frontend/css/modules/workflow.css`
- **Modify:** `frontend/css/modules/a11y.css`
- **Modify:** `frontend/css/modules/loading-indicator.css`
- **Modify:** `frontend/src/utils/pageStyles.ts`
- **Modify:** `frontend/src/utils/pageStyles.test.ts`
- **Modify:** `scripts/check-frontend-architecture.mjs`
- **Modify:** `package.json`

## Non-Goals

Do not use this plan to:

- rewrite the frontend into React, Solid, or another framework
- change backend route shapes or move transport work outside `services/api/*`
- rename stable DOM ids just to match new abstractions
- replace working page-local logic with generic helpers that do not reduce real duplication
- split files mechanically when the split does not clarify ownership

### Task 1: Freeze The Remaining Vision Gaps With Targeted Tests

**Files:**

- Modify: `frontend/src/app/runtime.test.ts`
- Modify: `frontend/src/app/shell.test.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`
- Modify: `frontend/src/ui/upload.test.ts`
- Modify: `frontend/src/drift/driftPage.test.ts`
- Modify: `frontend/src/causal/causalPage.test.ts`
- Modify: `frontend/src/utils/pageStyles.test.ts`

- [ ] **Step 1: Lock the current user-visible boundaries before moving more logic**

Add or expand tests that prove:

- `app.ts` composes Timeseries and upload dependencies but does not need to own upload submission or drift/causal page internals
- `createTimeseriesEntrypoint(...)` remains the public owner of Timeseries control init/rebuild behavior
- `ui/upload.ts` still preserves the current DOM ids and interaction flow while delegating workflow actions
- drift and causal pages still render, compute, export, and recover empty-state/status behavior through their page entrypoints
- lazy page-style loading only injects explicitly owned page modules

- [ ] **Step 2: Run the focused baseline before implementation**

Run:

```bash
npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/ui/upload.test.ts frontend/src/drift/driftPage.test.ts frontend/src/causal/causalPage.test.ts frontend/src/utils/pageStyles.test.ts
```

Expected:

- PASS on existing behavior
- any new failures should describe the ownership seam being migrated, not broad app regressions

- [ ] **Step 3: Keep the baseline green after every later task**

Re-run the same command after each task that changes these ownership boundaries.

### Task 2: Finish `app/*` As A Thin Composition Root

**Files:**

- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/app/runtime.ts`
- Modify: `frontend/src/app/bootstrap/ensureTimeseriesReady.ts`
- Modify: `frontend/src/app/pageModules.ts`
- Modify: `frontend/src/pages/timeseriesPage.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.ts`
- Modify: `frontend/src/app/runtime.test.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`

- [ ] **Step 1: Freeze the target composition boundary**

Keep `app.ts` responsible only for:

- app startup order
- shell/bootstrap registration
- composing page controllers and feature entrypoints
- global lifecycle cleanup

Keep `pages/timeseriesPage.ts` responsible only for:

- fetch/render/viewport orchestration
- page-local loading and status transitions
- chart-facing updates for Timeseries

Keep `features/timeseries/entrypoint.ts` responsible only for:

- chip/filter/range/search workflow wiring
- explicit `init()`, `rebuildColumns()`, and `buildRangeControls()` hooks

- [ ] **Step 2: Push chart bootstrap/session logic behind the existing bootstrap seam**

Expand `createTimeseriesBootstrap(...)` in `frontend/src/app/bootstrap/ensureTimeseriesReady.ts` so the `app.ts` call site stops inlining:

- chart instance creation
- WebGPU fallback switching
- initial chart binding
- session restore after chart readiness

The target `app.ts` flow should read like:

```ts
const timeseriesBootstrap = createTimeseriesBootstrap({...});
await timeseriesBootstrap.ensureReady();
```

not like a second page controller.

- [ ] **Step 3: Narrow the Timeseries entrypoint contract instead of adding new top-level glue**

Prefer a public surface like:

```ts
export interface TimeseriesFeatureDeps {
    fetchAndRender: () => Promise<void>;
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    registerCleanup: (cleanup: () => void) => void;
}
```

If another concern still needs to be passed from `app.ts`, move it into the page controller or bootstrap seam first.

- [ ] **Step 4: Verify the composition-root migration**

Run:

```bash
npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app.ts frontend/src/app/runtime.ts frontend/src/app/bootstrap/ensureTimeseriesReady.ts frontend/src/app/pageModules.ts frontend/src/pages/timeseriesPage.ts frontend/src/features/timeseries/entrypoint.ts frontend/src/app/runtime.test.ts frontend/src/features/timeseries/entrypoint.test.ts
git commit -m "refactor: finish frontend composition root split"
```

### Task 3: Complete The Upload Feature/UI Separation

**Files:**

- Modify: `frontend/src/ui/upload.ts`
- Modify: `frontend/src/features/upload/entrypoint.ts`
- Modify: `frontend/src/features/upload/fileSource.ts`
- Modify: `frontend/src/features/upload/databaseSource.ts`
- Modify: `frontend/src/features/upload/preview.ts`
- Modify: `frontend/src/features/upload/partialLoadControls.ts`
- Modify: `frontend/src/ui/upload.test.ts`
- Create: `frontend/src/features/upload/fileSource.test.ts`
- Create: `frontend/src/features/upload/databaseSource.test.ts`

- [ ] **Step 1: Freeze upload behavior around the actual seams that still drift**

Lock tests around:

- file choose and drag/drop preview
- partial-load validation and time-range sync
- upload submission success/error behavior
- database connect/load/disconnect/status sync
- dataset refresh after upload/database load

- [ ] **Step 2: Remove transport ownership from `ui/upload.ts`**

`ui/upload.ts` should stop importing:

- `connectDatabase`
- `deleteDatabaseConnection`
- `fetchDatabaseStatus`
- `fetchDatabaseTables`
- `previewUpload`
- `uploadDataset`

After this task, `ui/upload.ts` should be limited to:

- DOM lookups
- event binding
- delegating to `features/upload/*`
- rendering local status/progress state from callbacks

- [ ] **Step 3: Move the remaining workflow logic into the already-existing feature modules**

Use the current modules as the canonical owners:

- `fileSource.ts` for file selection, validation, upload submission, and dataset refresh
- `databaseSource.ts` for connect/load/disconnect/table refresh
- `preview.ts` for preview request lifecycle and preview-mode state
- `partialLoadControls.ts` for range/row form state and payload building

Avoid creating a second parallel upload abstraction inside `ui/*`.

- [ ] **Step 4: Keep the public app boundary unchanged**

`createUploadEntrypoint(...)` should remain the only app-facing upload initializer. `app.ts` should not regain upload flow ownership just because `ui/upload.ts` becomes thinner.

- [ ] **Step 5: Verify upload behavior**

Run:

```bash
npm test -- frontend/src/ui/upload.test.ts frontend/src/features/upload/fileSource.test.ts frontend/src/features/upload/databaseSource.test.ts frontend/src/features/upload/entrypoint.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/upload.ts frontend/src/features/upload/entrypoint.ts frontend/src/features/upload/fileSource.ts frontend/src/features/upload/databaseSource.ts frontend/src/features/upload/preview.ts frontend/src/features/upload/partialLoadControls.ts frontend/src/ui/upload.test.ts frontend/src/features/upload/fileSource.test.ts frontend/src/features/upload/databaseSource.test.ts
git commit -m "refactor: finish upload feature ownership"
```

### Task 4: Split Drift Into Focused Page-Local Modules

**Files:**

- Modify: `frontend/src/drift/driftPage.ts`
- Modify: `frontend/src/drift/runtime.ts`
- Modify: `frontend/src/drift/viewModels.ts`
- Modify: `frontend/src/drift/controls.ts`
- Create: `frontend/src/drift/selection.ts`
- Create: `frontend/src/drift/timelineView.ts`
- Create: `frontend/src/drift/detailView.ts`
- Modify: `frontend/src/drift/driftPage.test.ts`
- Modify: `frontend/src/drift/runtime.test.ts`
- Create: `frontend/src/drift/selection.test.ts`

- [ ] **Step 1: Freeze the drift behaviors that cannot regress during extraction**

Lock tests around:

- multi-column compute flow
- active detail-column switching
- window sorting and selection
- empty-state transitions
- timeline/detail export availability

- [ ] **Step 2: Extract selection and sorting state out of `driftPage.ts` first**

Create `selection.ts` as the canonical owner of:

- `responsesByColumn`
- `activeDetailColumn`
- `selectedWindowIdx`
- window-sort mode
- sorted-window index calculation

That module should expose a narrow state API and pure helpers, for example:

```ts
export interface DriftSelectionState {
    activeDetailColumn: string | null;
    selectedWindowIdx: number | null;
    windowSort: string;
}
```

- [ ] **Step 3: Extract the chart renderers into page-local view modules**

Create:

- `timelineView.ts` for timeline option building, chart click handling, and timeline rendering
- `detailView.ts` for detail-chart rendering, detail stats, and window-list rendering

Keep these modules page-local under `drift/*`; do not promote them to `ui/*` because they still encode drift-specific policy.

- [ ] **Step 4: Reduce `driftPage.ts` to assembly plus compute orchestration**

After extraction, `initDriftPage(...)` should mainly:

- look up DOM nodes
- initialize runtime and charts
- wire controls
- call `fetchDriftStats(...)`
- delegate selection/view rendering to the new modules

It should stop owning most of the detail/timeline rendering internals directly.

- [ ] **Step 5: Verify the drift split**

Run:

```bash
npm test -- frontend/src/drift/driftPage.test.ts frontend/src/drift/runtime.test.ts frontend/src/drift/selection.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/drift/driftPage.ts frontend/src/drift/runtime.ts frontend/src/drift/viewModels.ts frontend/src/drift/controls.ts frontend/src/drift/selection.ts frontend/src/drift/timelineView.ts frontend/src/drift/detailView.ts frontend/src/drift/driftPage.test.ts frontend/src/drift/runtime.test.ts frontend/src/drift/selection.test.ts
git commit -m "refactor: split drift page ownership"
```

### Task 5: Split Causal Runtime, Export, And Workflow Ownership

**Files:**

- Modify: `frontend/src/causal/causalPage.ts`
- Modify: `frontend/src/features/causal/entrypoint.ts`
- Create: `frontend/src/causal/runtime.ts`
- Create: `frontend/src/causal/export.ts`
- Create: `frontend/src/causal/workflow.ts`
- Modify: `frontend/src/causal/causalPage.test.ts`
- Create: `frontend/src/causal/export.test.ts`
- Create: `frontend/src/causal/workflow.test.ts`
- Modify: `frontend/src/features/causal/entrypoint.test.ts`

- [ ] **Step 1: Freeze the current causal workflow surface**

Lock tests around:

- initial column-chip render and empty-state sync
- method control enable/disable logic
- compute action lifecycle and status updates
- export menu behavior and payload shape
- add-edge mode cancellation and edit-panel interactions

- [ ] **Step 2: Extract runtime-only behavior from `causalPage.ts`**

Create `runtime.ts` as the owner of:

- page lifecycle registration through `createAnalysisPageRuntime(...)`
- empty-state sync wrapper
- status/progress wiring that is page-shell related rather than compute-policy related

- [ ] **Step 3: Extract export logic into a pure page-local module**

Create `export.ts` for:

- `exportJSON()`
- `exportGLM()`
- `exportTorchGeometric()`
- `handleExport(fmt)`

That module should depend on explicit state readers or data passed in, not hidden globals outside the causal page domain.

- [ ] **Step 4: Extract compute and control-policy logic into `workflow.ts`**

Move from `causalPage.ts` into `workflow.ts`:

- method-control enable/disable rules
- compute-button request/response flow
- add-edge mode action wiring
- export-menu toggle wiring

Keep `causalPage.ts` as the page assembly layer that binds DOM nodes, initializes child surfaces, and passes dependencies down.

- [ ] **Step 5: Keep the feature entrypoint thin**

`features/causal/entrypoint.ts` should remain a dynamic-import seam and dependency adapter. It should not absorb page workflow just because the page file is shrinking.

- [ ] **Step 6: Verify the causal split**

Run:

```bash
npm test -- frontend/src/causal/causalPage.test.ts frontend/src/causal/export.test.ts frontend/src/causal/workflow.test.ts frontend/src/features/causal/entrypoint.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/causal/causalPage.ts frontend/src/features/causal/entrypoint.ts frontend/src/causal/runtime.ts frontend/src/causal/export.ts frontend/src/causal/workflow.ts frontend/src/causal/causalPage.test.ts frontend/src/causal/export.test.ts frontend/src/causal/workflow.test.ts frontend/src/features/causal/entrypoint.test.ts
git commit -m "refactor: split causal page ownership"
```

### Task 6: Formalize CSS Ownership And Lazy Page Styles

**Files:**

- Modify: `frontend/css/style.css`
- Modify: `frontend/css/modules/layout.css`
- Modify: `frontend/css/modules/toolbar.css`
- Modify: `frontend/css/modules/upload.css`
- Modify: `frontend/css/modules/scatter.css`
- Modify: `frontend/css/modules/drift.css`
- Modify: `frontend/css/modules/home.css`
- Modify: `frontend/css/modules/workflow.css`
- Modify: `frontend/css/modules/a11y.css`
- Modify: `frontend/css/modules/loading-indicator.css`
- Modify: `frontend/src/utils/pageStyles.ts`
- Modify: `frontend/src/utils/pageStyles.test.ts`

- [ ] **Step 1: Freeze CSS loading and page-style ownership behavior**

Keep tests around:

- which routes inject lazy page CSS
- deduplication of injected `<link>` tags
- zero accidental lazy-load for pages that still rely on the shared bundle

- [ ] **Step 2: Reframe `style.css` into the four explicit layers from `Vision.md`**

Use the existing modules, but make the ownership order explicit:

1. foundation
2. primitive/component
3. shell/layout
4. feature/page

The final `style.css` should be an import manifest only. Remove ad hoc page-specific selectors from the tail of `style.css` and move them into owned modules such as `drift.css`, `home.css`, or `workflow.css`.

- [ ] **Step 3: Expand lazy page-style ownership only where there is a real page-only stylesheet**

Update `frontend/src/utils/pageStyles.ts` so page-owned CSS modules are explicit. At minimum, evaluate whether these should remain shared-bundle styles or become page-owned lazy modules:

- `home.css`
- `workflow.css`
- `drift.css`

Do not lazy-load shared shell modules such as `layout.css` or `toolbar.css`.

- [ ] **Step 4: Move page-only selectors into their owned modules**

Examples to fix during this pass:

- causal or drift-specific selectors that still live in the global entrypoint tail
- upload workflow selectors that belong in `upload.css`
- page-only overlay/empty-state variants that do not belong in shell modules

- [ ] **Step 5: Verify CSS behavior**

Run:

```bash
npm test -- frontend/src/utils/pageStyles.test.ts frontend/src/scatter/toolbarCss.test.ts frontend/src/scatter/responsiveCss.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/css/style.css frontend/css/modules/layout.css frontend/css/modules/toolbar.css frontend/css/modules/upload.css frontend/css/modules/scatter.css frontend/css/modules/drift.css frontend/css/modules/home.css frontend/css/modules/workflow.css frontend/css/modules/a11y.css frontend/css/modules/loading-indicator.css frontend/src/utils/pageStyles.ts frontend/src/utils/pageStyles.test.ts
git commit -m "refactor: align frontend css ownership"
```

### Task 7: Tighten The Architectural Guardrails

**Files:**

- Modify: `scripts/check-frontend-architecture.mjs`
- Modify: `package.json`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/ui/upload.ts`
- Modify: `frontend/src/features/shared/featureContract.ts`

- [ ] **Step 1: Enforce the post-refactor boundaries in automation**

Extend `scripts/check-frontend-architecture.mjs` to reject at least these violations once earlier tasks land:

- `frontend/src/ui/*` importing from `services/api/*`
- `frontend/src/app/*` importing from `services/api/*` except approved bootstrap helpers, if any remain
- live files importing from deprecated legacy/component surfaces already replaced by `ui/*` or `features/*`

- [ ] **Step 2: Wire the stricter check into the normal validation path**

Keep `npm run validate` as the single command engineers use before claiming success. If a second script is needed, add it under `validate` in `package.json` rather than creating an undocumented optional check.

- [ ] **Step 3: Keep the feature contract explicit in code**

Use `frontend/src/features/shared/featureContract.ts` to document or codify the expected shape:

```ts
export interface FeatureEntrypoint {
    init(): void | Promise<void>;
}
```

If a feature needs extra hooks, add them explicitly and narrowly rather than letting `app.ts` or page modules reach into feature internals ad hoc.

- [ ] **Step 4: Run the final validation sweep**

Run:

```bash
npm run validate
npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/ui/upload.test.ts frontend/src/drift/driftPage.test.ts frontend/src/causal/causalPage.test.ts frontend/src/utils/pageStyles.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/check-frontend-architecture.mjs package.json frontend/src/app.ts frontend/src/ui/upload.ts frontend/src/features/shared/featureContract.ts
git commit -m "chore: enforce frontend architecture guardrails"
```

## Success Criteria

- `frontend/src/app.ts` reads as composition and startup order, not page logic.
- `frontend/src/ui/upload.ts` becomes a rendering/binding surface rather than a transport/workflow owner.
- `frontend/src/drift/driftPage.ts` and `frontend/src/causal/causalPage.ts` shrink into assembly layers with page-local helpers below them.
- CSS ownership maps cleanly to foundation, shared UI, shell, and feature/page layers.
- `npm run validate` enforces the architectural rules from `ai/frontend/Vision.md` instead of depending on reviewer memory.
- `ai/contract.md` and `frontend/src/services/api/*` remain unchanged from a transport-boundary perspective.
