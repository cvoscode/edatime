# Frontend Shared UI Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate duplicated frontend control/chip/modal rendering behind the live shared UI surfaces, starting with Timeseries, while preserving the current Rust/TypeScript transport contract and existing page/control ids.

**Architecture:** Treat `renderSeriesChipList(...)` as the canonical series-chip owner, promote `ui/composites/RangeChip.ts`, `RangeControls.ts`, and `ColumnFilterModal.ts` into live reusable control surfaces, and reduce `features/timeseries/*` to state-to-view-model composition plus page-local effects instead of manual DOM construction.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, DOM-first page controllers, shared UI composites, Axum backend, Arrow/JSON transport.

---

## Audit Status

Audit date: `2026-06-02`

Verified against the current live code:

- `frontend/src/ui/seriesChipList.ts` is already the canonical live chip-list surface and is used by:
  - `frontend/src/features/timeseries/columnsController.ts`
  - `frontend/src/pages/fftPage.ts`
  - `frontend/src/causal/chipPanel.ts`
- `frontend/src/ui/composites/RangeChip.ts`, `RangeControls.ts`, and `ColumnFilterModal.ts` exist, but they are currently test/demo surfaces rather than the live Timeseries owners.
- `frontend/src/features/timeseries/rangeControls.ts` still manually constructs `.range-chip` DOM nodes that overlap with `RangeChip.ts` and `RangeControls.ts`.
- `frontend/src/features/timeseries/filterModalController.ts` still owns a large amount of modal DOM lookup and input syncing logic even though the repo already has a `ColumnFilterModal.ts` composite.
- `frontend/src/ui/composites/ColumnSelector.ts` is currently a parallel convenience abstraction that is only covered by component tests and is not a live page owner.

Decision from this audit:

- keep `renderSeriesChipList(...)` as the canonical chip implementation
- promote `RangeControls` and `ColumnFilterModal` into real live surfaces
- make `ColumnSelector.ts` a thin wrapper over canonical chip/color-by surfaces instead of a parallel implementation

## Relationship To Existing Refactor Docs

This plan is a focused follow-up to:

- `docs/superpowers/specs/2026-06-02-frontend-feature-first-consolidation-design.md`
- `docs/superpowers/plans/2026-06-02-frontend-feature-first-consolidation.md`

Those documents address broad frontend ownership. This plan narrows the next implementation wave to shared UI consolidation, which is now the highest-value low-risk refactor remaining in the live frontend.

## Contract Fence

Treat the following as fixed during implementation:

- `ai/contract.md`
- `frontend/src/services/api/*`
- existing route names, page ids, modal ids, export ids, and export filenames
- current `window.__edatime` hooks consumed by the live pages unless the replacement is behaviorally equivalent

Only `frontend/src/services/api/*` may:

- call `fetch(...)`
- inspect response headers
- parse transport payloads

This plan must not move fetch logic into `ui/*`, `features/*`, or new shared UI helpers.

## File Map

### Shared UI surfaces

- **Modify:** `frontend/src/ui/composites/RangeChip.ts`
  - Canonical single range/filter chip surface.
- **Modify:** `frontend/src/ui/composites/RangeControls.ts`
  - Canonical range/filter chip row surface.
- **Modify:** `frontend/src/ui/composites/ColumnFilterModal.ts`
  - Canonical column filter modal rendering/binding surface.
- **Modify:** `frontend/src/ui/composites/ColumnSelector.ts`
  - Reduce to a thin wrapper over `renderSeriesChipList(...)` and `ColorBySelect`.
- **Modify:** `frontend/src/ui/composites/components.test.ts`
  - Shared UI regression coverage.
- **Modify:** `frontend/src/ui/seriesChipList.ts`
  - Only if small surface additions are required by `ColumnSelector.ts`; avoid new domain logic here.
- **Modify:** `frontend/src/ui/seriesChipList.test.ts`
  - Regression coverage if `seriesChipList.ts` gains new small capabilities.

### Timeseries consumers

- **Modify:** `frontend/src/features/timeseries/rangeControls.ts`
  - Drain manual `.range-chip` DOM creation in favor of `RangeControls`.
- **Create:** `frontend/src/features/timeseries/rangeControls.test.ts`
  - State-to-item composition and event regression coverage.
- **Modify:** `frontend/src/features/timeseries/filterModalController.ts`
  - Reduce to Timeseries-specific state sync and apply/clear side effects.
- **Create:** `frontend/src/features/timeseries/filterModalController.test.ts`
  - Modal lifecycle and apply/clear behavior coverage.
- **Modify:** `frontend/src/features/timeseries/columnsController.ts`
  - Keep as a thin composition owner that wires shared chip/range/modal surfaces together.
- **Modify:** `frontend/src/features/timeseries/columnsController.test.ts`
  - Lock behavior while ownership moves into shared UI surfaces.
- **Modify:** `frontend/src/features/timeseries/entrypoint.ts`
  - Keep one public Timeseries control-init surface after the shared UI migration.
- **Modify:** `frontend/src/features/timeseries/entrypoint.test.ts`
  - Regression coverage for feature init and rebuild hooks.

### Optional low-risk adopters

- **Modify (only if justified by implementation):** `frontend/src/causal/chipPanel.ts`
  - Consider adopting a thinner selector wrapper only if it removes duplication without making causal behavior less explicit.
- **Modify (only if justified by implementation):** `frontend/src/pages/fftPage.ts`
  - Only if a small shared chip-list capability removes local glue without pushing page behavior into `ui/*`.

## Non-Goals

Do not use this plan to:

- redesign page layouts
- rewrite page controllers into a framework
- change backend routes or payloads
- fold page-specific fetch/render orchestration into shared UI helpers
- force `ColumnSelector.ts` adoption into pages that are already clearer with direct `renderSeriesChipList(...)` usage

### Task 1: Freeze Shared UI And Current Timeseries Behavior

**Files:**

- Modify: `frontend/src/ui/composites/components.test.ts`
- Modify: `frontend/src/ui/seriesChipList.test.ts`
- Modify: `frontend/src/features/timeseries/columnsController.test.ts`
- Create: `frontend/src/features/timeseries/rangeControls.test.ts`
- Create: `frontend/src/features/timeseries/filterModalController.test.ts`

- [ ] **Step 1: Lock the canonical shared UI behavior before changing implementations**

Add or expand tests that prove:

- `RangeChip` keeps keyboard activation semantics
- `RangeControls` can represent mixed static and clickable chips
- `ColumnFilterModal` can drive apply, clear, cancel, and column-change flows expected by the live Timeseries modal
- `renderSeriesChipList(...)` remains the single owner of chip keyboard, toggle, and color-update behavior
- Timeseries range controls still rebuild after selection/filter changes
- Timeseries filter modal still updates ranges, triggers rerender, and emits filter-change events

- [ ] **Step 2: Run the focused test baseline**

Run:

```bash
npm test -- frontend/src/ui/composites/components.test.ts frontend/src/ui/seriesChipList.test.ts frontend/src/features/timeseries/columnsController.test.ts
```

Expected result:

- PASS on existing shared chip/component behavior
- any new Timeseries-specific tests fail only for the behavior gap being migrated

- [ ] **Step 3: Add missing Timeseries-focused tests and rerun**

Run:

```bash
npm test -- frontend/src/features/timeseries/rangeControls.test.ts frontend/src/features/timeseries/filterModalController.test.ts frontend/src/features/timeseries/columnsController.test.ts
```

Expected result:

- focused failures that document the current manual/shared UI mismatch before implementation

### Task 2: Canonicalize `RangeControls` And Drain Manual Timeseries Range-Chip DOM

**Files:**

- Modify: `frontend/src/ui/composites/RangeChip.ts`
- Modify: `frontend/src/ui/composites/RangeControls.ts`
- Modify: `frontend/src/ui/composites/components.test.ts`
- Modify: `frontend/src/features/timeseries/rangeControls.ts`
- Create: `frontend/src/features/timeseries/rangeControls.test.ts`
- Modify: `frontend/src/features/timeseries/columnsController.ts`

- [ ] **Step 1: Expand the shared range-chip surface only enough to represent the live Timeseries variants**

Support the actual chip kinds currently rendered in `features/timeseries/rangeControls.ts`:

- static “Adaptive target” chip
- clickable per-column range chips
- clickable adaptive filter removal chips
- clickable “Clear all” chip

Prefer a declarative item shape owned by `RangeControls.ts`, for example:

```ts
export interface RangeControlItem {
    key: string;
    name: string;
    range: string;
    ariaLabel?: string;
    className?: string;
    onActivate?: () => void;
}
```

Do not add page-specific semantics to the shared UI layer beyond what is required to render and activate items.

- [ ] **Step 2: Reduce `features/timeseries/rangeControls.ts` to a state-to-items composer**

After the shared surface is expressive enough, refactor `buildRangeControls()` so it:

- derives `RangeControlItem[]` from current Timeseries state
- delegates rendering to `RangeControls(...)`
- owns only Timeseries-specific side effects such as:
  - clearing adaptive filters
  - invoking `window.__edatime.openFilterForCol`
  - dispatching Timeseries filter-change events

Avoid leaving manual `document.createElement(...)` chip construction in this file.

- [ ] **Step 3: Keep caller contracts stable**

Preserve the existing public surface:

```ts
export function buildRangeControls(): void
```

`app.ts`, `timeseriesPage.ts`, `actions.ts`, and upload/session restore flows should not need a new contract just because the rendering owner changed.

- [ ] **Step 4: Verify the range-controls migration**

Run:

```bash
npm test -- frontend/src/ui/composites/components.test.ts frontend/src/features/timeseries/rangeControls.test.ts frontend/src/features/timeseries/columnsController.test.ts
```

Expected result:

- PASS

### Task 3: Promote `ColumnFilterModal` Into The Live Timeseries Modal Surface

**Files:**

- Modify: `frontend/src/ui/composites/ColumnFilterModal.ts`
- Modify: `frontend/src/ui/composites/components.test.ts`
- Modify: `frontend/src/features/timeseries/filterModalController.ts`
- Create: `frontend/src/features/timeseries/filterModalController.test.ts`
- Modify: `frontend/src/features/timeseries/columnsController.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`

- [ ] **Step 1: Decide the shared modal boundary before coding**

The shared modal surface should own reusable modal UI behavior such as:

- column selection UI
- min/max text input UI
- range-slider UI and fill syncing
- hint/status text rendering
- apply / clear / cancel control wiring

The Timeseries controller should still own:

- reading/writing `appState.columnRanges`
- computing bounds from fetched data or profiles
- rerendering chart data
- fitting/updating Y range after apply/clear
- dispatching Timeseries filter-change events

Do not move Timeseries data policy into `ui/composites/ColumnFilterModal.ts`.

- [ ] **Step 2: Refactor `filterModalController.ts` into a state/effects owner**

End-state responsibility split:

- `ColumnFilterModal.ts`
  - reusable DOM rendering/binding surface
- `filterModalController.ts`
  - resolves modal state from current Timeseries data
  - supplies callbacks
  - applies cleared/edited bounds back into store and chart

Preserve:

- existing modal ids
- `window.__edatime.openFilterForCol`
- apply/clear button semantics
- Escape/backdrop/close behavior

- [ ] **Step 3: Keep Timeseries feature init stable**

`createTimeseriesEntrypoint(...).init()` should still be the only public place that wires the modal into the page.

Do not leak modal setup back into `app.ts`.

- [ ] **Step 4: Verify the modal migration**

Run:

```bash
npm test -- frontend/src/ui/composites/components.test.ts frontend/src/features/timeseries/filterModalController.test.ts frontend/src/features/timeseries/entrypoint.test.ts
```

Expected result:

- PASS

### Task 4: Remove The Parallel Selector Implementation

**Files:**

- Modify: `frontend/src/ui/composites/ColumnSelector.ts`
- Modify: `frontend/src/ui/composites/components.test.ts`
- Modify: `frontend/src/ui/seriesChipList.ts`
- Modify: `frontend/src/ui/seriesChipList.test.ts`
- Modify: `frontend/src/causal/chipPanel.ts` (only if justified)

- [ ] **Step 1: Make `ColumnSelector.ts` a thin wrapper, not a second chip system**

Refactor `ColumnSelector.ts` so it composes:

- `ColorBySelect`
- `renderSeriesChipList(...)`

instead of manually instantiating `SeriesChip(...)` in a parallel path.

This keeps one canonical chip implementation while preserving the convenience wrapper API:

```ts
export function ColumnSelector(props: ColumnSelectorProps): HTMLDivElement
```

- [ ] **Step 2: Only add chip-list capabilities that have multi-consumer value**

If `ColumnSelector.ts` needs a small `seriesChipList.ts` enhancement, keep it generic and declarative.

Acceptable examples:

- better item label support
- stable class/attribute passthrough
- small wrapper ergonomics

Unacceptable examples:

- color-by awareness in `seriesChipList.ts`
- Timeseries-specific filter/range policy in shared chip code

- [ ] **Step 3: Reassess low-risk adoption**

After `ColumnSelector.ts` is thin, check whether any live caller becomes meaningfully simpler by adopting it.

Adopt only when all are true:

- fewer lines and less glue
- no hidden page behavior moves into `ui/*`
- test coverage becomes simpler, not more indirect

If those conditions are not met, leave live pages on direct `renderSeriesChipList(...)` usage.

- [ ] **Step 4: Verify selector/canonical chip behavior**

Run:

```bash
npm test -- frontend/src/ui/composites/components.test.ts frontend/src/ui/seriesChipList.test.ts
```

Expected result:

- PASS

### Task 5: Final Timeseries Integration And Guardrail Verification

**Files:**

- Modify: `frontend/src/features/timeseries/columnsController.ts`
- Modify: `frontend/src/features/timeseries/columnsController.test.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`
- Modify: `frontend/src/features/timeseries/rangeControls.ts`
- Modify: `frontend/src/features/timeseries/filterModalController.ts`

- [ ] **Step 1: Leave Timeseries feature modules with clear final boundaries**

End-state ownership should be:

- `columnsController.ts`
  - orchestrates shared chip/range/modal surfaces for Timeseries
- `rangeControls.ts`
  - state-to-items mapping plus Timeseries filter side effects
- `filterModalController.ts`
  - modal state/effects owner
- `entrypoint.ts`
  - one public `init()` plus narrow rebuild hooks

Do not reintroduce direct DOM duplication while stitching the pieces together.

- [ ] **Step 2: Run the focused integration suite**

Run:

```bash
npm test -- frontend/src/features/timeseries/columnsController.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/timeseries/rangeControls.test.ts frontend/src/features/timeseries/filterModalController.test.ts
```

Expected result:

- PASS

- [ ] **Step 3: Run whole-slice verification**

Run:

```bash
npm test -- frontend/src/ui/composites/components.test.ts frontend/src/ui/seriesChipList.test.ts frontend/src/features/timeseries/columnsController.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/pages/fftPage.test.ts
npm run typecheck
npm run validate
```

Expected result:

- PASS
- typecheck exits `0`
- validate exits `0` with frontend architecture checks still green

- [ ] **Step 4: Commit**

```bash
git add frontend/src/ui/composites/RangeChip.ts frontend/src/ui/composites/RangeControls.ts frontend/src/ui/composites/ColumnFilterModal.ts frontend/src/ui/composites/ColumnSelector.ts frontend/src/ui/composites/components.test.ts frontend/src/ui/seriesChipList.ts frontend/src/ui/seriesChipList.test.ts frontend/src/features/timeseries/rangeControls.ts frontend/src/features/timeseries/rangeControls.test.ts frontend/src/features/timeseries/filterModalController.ts frontend/src/features/timeseries/filterModalController.test.ts frontend/src/features/timeseries/columnsController.ts frontend/src/features/timeseries/columnsController.test.ts frontend/src/features/timeseries/entrypoint.ts frontend/src/features/timeseries/entrypoint.test.ts
git commit -m "refactor: consolidate shared frontend ui controls"
```

## Expected Outcomes

After this plan lands:

- the live frontend has one canonical chip implementation
- Timeseries no longer hand-builds range-chip DOM
- the shared column filter modal is a real live UI surface instead of a test/demo-only abstraction
- `ColumnSelector.ts` stops being a parallel implementation path
- future page/controller cleanup can target smaller feature modules because the UI duplication has already been removed

## Follow-On Work

This plan intentionally stops before broader page-controller refactors.

After completion, the next best follow-on plans are:

1. page/controller cleanup in `app.ts`, `scatter/scatterPage.ts`, `drift/driftPage.ts`, and `ui/upload.ts`
2. modal-controller normalization across remaining custom modals
3. selective adoption of the shared UI surfaces by other pages only where they remove real duplication
