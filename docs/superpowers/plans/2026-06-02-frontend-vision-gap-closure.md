# Frontend Vision Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining architectural gaps between the live frontend and `ai/frontend/Vision.md` now that most of the earlier refactor has landed.

**Architecture:** Keep the existing feature-first structure and preserve the transport contract, but finish the last inconsistencies: transport leaking into `ui/*`, a still-heavy root `app.ts`, a mismatched feature-entrypoint contract, and duplicated/misowned workflow CSS. This is a cleanup and standardization pass, not a new architecture wave.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, modular CSS, Node-based architecture validation.

---

## Audit Status

Audit date: `2026-06-02`

Verified during this audit:

- `npm run validate`
  - Result: PASS
- `npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/ui/upload.test.ts frontend/src/drift/driftPage.test.ts frontend/src/drift/runtime.test.ts frontend/src/causal/causalPage.test.ts frontend/src/causal/export.test.ts frontend/src/causal/workflow.test.ts frontend/src/utils/pageStyles.test.ts`
  - Result: `8` files passed, `64` tests passed, `5` skipped

## What Is Already Done

The repo is materially closer to the vision than the original broad plan assumed:

- `frontend/src/app/bootstrap/ensureTimeseriesReady.ts` exists and `frontend/src/app.ts` uses `createTimeseriesBootstrap(...)`.
- `frontend/src/ui/upload.ts` no longer imports `services/api/*` directly; upload workflow mostly lives in `features/upload/*`.
- `frontend/src/drift/selection.ts`, `timelineView.ts`, and `detailView.ts` exist.
- `frontend/src/causal/export.ts`, `workflow.ts`, and `runtime.ts` exist.
- `frontend/css/style.css` is now layered as foundation/component/shell/feature.
- `scripts/check-frontend-architecture.mjs` already contains explicit `ui/*` and `app/*` transport rules.

## Remaining Gaps

These are the current blockers to calling the vision complete:

1. `ui/*` still owns transport in live code:
   - `frontend/src/ui/exportControls.ts`
   - `frontend/src/ui/dataMutationModals.ts`
2. The transport guardrail is incomplete because `scripts/check-frontend-architecture.mjs` only matches `services/api/...` and misses relative imports like `../services/api/index.js`.
3. `frontend/src/app.ts` is smaller, but it still owns dataset bootstrap, analytics fetch wiring, and shell helpers that should live in focused bootstrap/runtime modules.
4. The feature-entrypoint contract is inconsistent:
   - `frontend/src/features/shared/featureContract.ts` says `init(): void`
   - `frontend/src/features/causal/entrypoint.ts` and `frontend/src/features/drift/entrypoint.ts` expose async `init()`
5. Workflow CSS ownership is inconsistent:
   - `frontend/css/style.css` claims `workflow.css` is page-owned and lazy-loaded
   - `frontend/src/utils/pageStyles.ts` does not load it
   - `frontend/css/modules/toolbar.css` already contains `workflow-panel` rules, so ownership is duplicated

## File Map

### Transport leak cleanup

- **Modify:** `frontend/src/ui/exportControls.ts`
- **Modify:** `frontend/src/ui/dataMutationModals.ts`
- **Create:** `frontend/src/features/export/entrypoint.ts`
- **Create:** `frontend/src/features/dataMutation/entrypoint.ts`
- **Create:** `frontend/src/features/export/entrypoint.test.ts`
- **Create:** `frontend/src/features/dataMutation/entrypoint.test.ts`

### Guardrail hardening

- **Modify:** `scripts/check-frontend-architecture.mjs`
- **Modify:** `package.json`

### `app.ts` gap closure

- **Modify:** `frontend/src/app.ts`
- **Create:** `frontend/src/app/bootstrap/datasetBootstrap.ts`
- **Create:** `frontend/src/app/bootstrap/analyticsRefresh.ts`
- **Modify:** `frontend/src/app/runtime.test.ts`
- **Modify:** `frontend/src/app/shell.test.ts`

### Feature contract alignment

- **Modify:** `frontend/src/features/shared/featureContract.ts`
- **Modify:** `frontend/src/app/pageModules.ts`
- **Modify:** `frontend/src/features/causal/entrypoint.ts`
- **Modify:** `frontend/src/features/drift/entrypoint.ts`
- **Modify:** `frontend/src/features/scatter/entrypoint.ts`
- **Modify:** `frontend/src/features/fft/entrypoint.ts`
- **Modify:** `frontend/src/features/heatmap/entrypoint.ts`
- **Modify:** `frontend/src/features/spectrogram/entrypoint.ts`

### Workflow CSS ownership cleanup

- **Modify:** `frontend/css/style.css`
- **Modify:** `frontend/css/modules/toolbar.css`
- **Modify:** `frontend/css/modules/workflow.css`
- **Modify:** `frontend/src/utils/pageStyles.ts`
- **Modify:** `frontend/src/utils/pageStyles.test.ts`

## Non-Goals

Do not use this plan to:

- reopen the drift or causal page splits unless a test proves a real regression
- move page-level fetch orchestration out of page owners that already match the vision
- redesign the visual language
- change backend routes, payload shapes, or `ai/contract.md`

### Task 1: Remove The Remaining `ui/*` Transport Leaks

**Files:**

- Modify: `frontend/src/ui/exportControls.ts`
- Modify: `frontend/src/ui/dataMutationModals.ts`
- Create: `frontend/src/features/export/entrypoint.ts`
- Create: `frontend/src/features/dataMutation/entrypoint.ts`
- Create: `frontend/src/features/export/entrypoint.test.ts`
- Create: `frontend/src/features/dataMutation/entrypoint.test.ts`

- [ ] **Step 1: Freeze the current UI behavior**

Add focused tests that prove:

- export modal wiring still triggers CSV/JSON/Parquet actions
- transform modal still validates, submits, and refreshes the dataset
- outlier modal still validates, submits, and refreshes the dataset

- [ ] **Step 2: Introduce feature-owned callbacks for export and mutation workflows**

Move transport calls behind feature entrypoints so `ui/*` only binds DOM and calls injected actions.

Use narrow surfaces such as:

```ts
export interface ExportActions {
    exportFilteredCsv: () => boolean;
    exportFilteredJson: () => boolean;
    exportFilteredParquet: () => Promise<boolean>;
}
```

```ts
export interface DataMutationActions {
    runTransform: (expression: string, outputName: string) => Promise<void>;
    removeOutliers: (input: RemoveOutliersInput) => Promise<RemoveOutliersResult>;
}
```

- [ ] **Step 3: Remove `services/api/*` imports from `ui/*`**

After the refactor:

- `frontend/src/ui/exportControls.ts` must not import `exportParquet`
- `frontend/src/ui/dataMutationModals.ts` must not dynamically import `postTransform` or `postRemoveOutliers`

- [ ] **Step 4: Verify the transport leak cleanup**

Run:

```bash
npm test -- frontend/src/ui/upload.test.ts frontend/src/features/export/entrypoint.test.ts frontend/src/features/dataMutation/entrypoint.test.ts
npm run validate
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/exportControls.ts frontend/src/ui/dataMutationModals.ts frontend/src/features/export/entrypoint.ts frontend/src/features/dataMutation/entrypoint.ts frontend/src/features/export/entrypoint.test.ts frontend/src/features/dataMutation/entrypoint.test.ts
git commit -m "refactor: remove ui transport leaks"
```

### Task 2: Harden The Architecture Checker Against Relative Imports

**Files:**

- Modify: `scripts/check-frontend-architecture.mjs`
- Modify: `package.json`

- [ ] **Step 1: Freeze the checker behavior with a targeted regression**

Add or extend tests, or add a fixture-driven local verification path, so the checker fails when a `ui/*` file imports any of these forms:

```ts
import { x } from '../services/api/index.js';
const m = await import('../services/api/index.js');
```

- [ ] **Step 2: Update the checker to normalize relative imports**

Instead of checking only:

```js
src.startsWith('services/api/')
```

resolve relative paths against the importing file and then test whether the target lives under `frontend/src/services/api/`.

- [ ] **Step 3: Verify the checker catches the patterns it previously missed**

Run:

```bash
npm run validate
```

Expected:

- FAIL before Task 1 lands if `ui/*` still imports transport relatively
- PASS after Task 1 lands and the checker is fixed

- [ ] **Step 4: Commit**

```bash
git add scripts/check-frontend-architecture.mjs package.json
git commit -m "chore: harden frontend architecture checks"
```

### Task 3: Finish Thinning `app.ts`

**Files:**

- Modify: `frontend/src/app.ts`
- Create: `frontend/src/app/bootstrap/datasetBootstrap.ts`
- Create: `frontend/src/app/bootstrap/analyticsRefresh.ts`
- Modify: `frontend/src/app/runtime.test.ts`
- Modify: `frontend/src/app/shell.test.ts`

- [ ] **Step 1: Freeze the remaining `app.ts` composition boundary**

Lock tests around:

- initial dataset bootstrap
- metadata-ready initialization
- analytics refresh wiring
- global shortcut initialization
- `window.__edatime.ensureDatasetReady`

- [ ] **Step 2: Extract dataset bootstrap orchestration**

Move these responsibilities out of `frontend/src/app.ts`:

- metadata fetch and storage
- numeric-column/default-column initialization
- dataset UI hydration
- initial viewport setup

Target seam:

```ts
const datasetBootstrap = createDatasetBootstrap({...});
await datasetBootstrap.ensureReady(initialPage);
```

- [ ] **Step 3: Extract analytics refresh wiring**

Move the `edatime:analytics-change` listener and overlay refresh logic into `frontend/src/app/bootstrap/analyticsRefresh.ts`.

That module should own:

- recomputing rolling bands
- triggering overlay rerender
- kicking off analytics fetch refresh

`app.ts` should only register it.

- [ ] **Step 4: Remove now-redundant app-local shell helpers**

Eliminate any dead or duplicate root-level shell logic after extraction, including unused local keyboard-shortcut helpers if they are no longer part of the boot path.

- [ ] **Step 5: Verify the root stays stable**

Run:

```bash
npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts
npm run typecheck
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app.ts frontend/src/app/bootstrap/datasetBootstrap.ts frontend/src/app/bootstrap/analyticsRefresh.ts frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts
git commit -m "refactor: finish thinning app root"
```

### Task 4: Make The Feature Entrypoint Contract True In Code

**Files:**

- Modify: `frontend/src/features/shared/featureContract.ts`
- Modify: `frontend/src/app/pageModules.ts`
- Modify: `frontend/src/features/causal/entrypoint.ts`
- Modify: `frontend/src/features/drift/entrypoint.ts`
- Modify: `frontend/src/features/scatter/entrypoint.ts`
- Modify: `frontend/src/features/fft/entrypoint.ts`
- Modify: `frontend/src/features/heatmap/entrypoint.ts`
- Modify: `frontend/src/features/spectrogram/entrypoint.ts`

- [ ] **Step 1: Choose one contract and apply it consistently**

Either:

- make all feature `init()` methods synchronous

or:

- make the canonical contract `init(): void | Promise<void>`

Given the current lazy-loading entrypoints, the second option is the lower-risk fit.

- [ ] **Step 2: Replace ad hoc entrypoint typing in loaders**

`frontend/src/app/pageModules.ts` should consume the shared contract instead of defining a local one-off type.

- [ ] **Step 3: Verify entrypoint implementations conform**

Ensure every live feature entrypoint exposes the same base shape and only adds explicit extra hooks where needed.

- [ ] **Step 4: Verify the contract alignment**

Run:

```bash
npm run typecheck
npm test -- frontend/src/app/runtime.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/causal/entrypoint.test.ts frontend/src/features/drift/entrypoint.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/shared/featureContract.ts frontend/src/app/pageModules.ts frontend/src/features/causal/entrypoint.ts frontend/src/features/drift/entrypoint.ts frontend/src/features/scatter/entrypoint.ts frontend/src/features/fft/entrypoint.ts frontend/src/features/heatmap/entrypoint.ts frontend/src/features/spectrogram/entrypoint.ts
git commit -m "refactor: align feature entrypoint contract"
```

### Task 5: Reconcile Workflow CSS Ownership

**Files:**

- Modify: `frontend/css/style.css`
- Modify: `frontend/css/modules/toolbar.css`
- Modify: `frontend/css/modules/workflow.css`
- Modify: `frontend/src/utils/pageStyles.ts`
- Modify: `frontend/src/utils/pageStyles.test.ts`

- [ ] **Step 1: Freeze the intended ownership model**

Guided workflow is shell-level UI, not page-local UI. Lock tests and comments around that intended ownership before moving CSS.

- [ ] **Step 2: Choose one canonical owner for workflow styles**

Pick one:

- keep workflow styles in `toolbar.css` or another shell module and delete the duplicate page-owned version

or:

- move all workflow styles to `workflow.css` and register it correctly if it is truly page-owned

Based on `Vision.md`, the shell-layer option is the better fit.

- [ ] **Step 3: Make `style.css` and `pageStyles.ts` agree**

After this task:

- `frontend/css/style.css` comments must describe the real loading model
- `frontend/src/utils/pageStyles.ts` must match the actual lazy-loaded CSS modules
- there must be no dead `workflow.css` ownership path

- [ ] **Step 4: Verify CSS loading behavior**

Run:

```bash
npm test -- frontend/src/utils/pageStyles.test.ts frontend/src/scatter/toolbarCss.test.ts frontend/src/scatter/responsiveCss.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/css/style.css frontend/css/modules/toolbar.css frontend/css/modules/workflow.css frontend/src/utils/pageStyles.ts frontend/src/utils/pageStyles.test.ts
git commit -m "refactor: reconcile workflow css ownership"
```

## Success Criteria

- No live `ui/*` file imports or dynamically imports `services/api/*`.
- `npm run validate` can actually detect relative-path transport leaks.
- `frontend/src/app.ts` reads as composition/bootstrap registration rather than dataset/analytics orchestration.
- The shared feature-entrypoint contract matches what the live feature entrypoints actually expose.
- Workflow CSS has one clear owner and `style.css` no longer claims a lazy-loading path that does not exist.
