# Frontend UI Canonicalization And Analytics Page Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `frontend/src/ui/` the only canonical internal shared UI surface and extract repeated FFT/heatmap/spectrogram page shell logic into one behavior-preserving shared runtime.

**Architecture:** Keep `frontend/src/components/` as a temporary compatibility facade with no unique logic, enforce `ui/` as the only internal import path, and add a small `pages/shared/analysisPageRuntime.ts` module that composes existing lifecycle, empty-state, and export helpers without taking over page-specific render or fetch logic.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, Vanilla DOM rendering

---

## File Map

- **Create:** `frontend/src/ui/composites/components.test.ts`
  - Canonical shared-component tests moved beside the canonical implementation surface.
- **Create:** `frontend/src/pages/shared/analysisPageRuntime.ts`
  - Shared shell for analytics pages.
- **Create:** `frontend/src/pages/shared/analysisPageRuntime.test.ts`
  - Verifies lifecycle, export binding, and empty-state wiring.
- **Create:** `frontend/src/pages/heatmapPage.test.ts`
  - Focused regression coverage for heatmap shell behavior.
- **Create:** `frontend/src/pages/spectrogramPage.test.ts`
  - Focused regression coverage for spectrogram shell behavior.
- **Modify:** `scripts/check-frontend-architecture.mjs`
  - Add a rule that blocks new internal imports from `frontend/src/components/`.
- **Modify:** `frontend/src/components/atoms/*.ts`
- **Modify:** `frontend/src/components/molecules/*.ts`
- **Modify:** `frontend/src/components/organisms/*.ts`
  - Keep as pure re-export adapters only.
- **Modify:** `frontend/src/components/organisms/components.test.ts`
  - Retire or redirect deprecated-surface tests after canonical tests exist.
- **Modify:** `frontend/src/pages/fftPage.ts`
- **Modify:** `frontend/src/pages/heatmapPage.ts`
- **Modify:** `frontend/src/pages/spectrogramPage.ts`
  - Adopt the shared analytics page runtime.
- **Modify:** `frontend/src/pages/fftPage.test.ts`
  - Update for the shared shell boundary without changing behavior.

### Task 1: Lock In `ui/` As The Canonical Internal Shared UI Surface

**Files:**
- Create: `frontend/src/ui/composites/components.test.ts`
- Modify: `frontend/src/components/organisms/components.test.ts`
- Modify: `scripts/check-frontend-architecture.mjs`

- [ ] **Step 1: Write canonical shared-component tests against `ui/`**

Create `frontend/src/ui/composites/components.test.ts` by moving the existing shared DOM factory coverage off the deprecated `components/` surface and onto:

```ts
import { ColumnFilterModal } from './ColumnFilterModal.js';
import { ColumnSelector } from './ColumnSelector.js';
import { RangeControls } from './RangeControls.js';
```

Preserve the existing interaction assertions:

- `ColumnSelector` emits toggle, color, range, and color-by callbacks
- `RangeControls` supports keyboard activation
- `ColumnFilterModal` submits edited bounds

- [ ] **Step 2: Run the targeted test to prove the canonical surface works**

Run: `npm test -- frontend/src/ui/composites/components.test.ts`
Expected: PASS

- [ ] **Step 3: Add an architecture rule that blocks internal `components/` imports**

Extend `scripts/check-frontend-architecture.mjs` so files outside `frontend/src/components/` fail if they import from `components/`.

The rule should allow:

- re-export files inside `frontend/src/components/`
- `frontend/src/components/organisms/components.test.ts` until Task 1 Step 5 retires it

The rule should fail:

- runtime imports from `frontend/src/app/`
- runtime imports from `frontend/src/pages/`
- runtime imports from `frontend/src/features/`
- runtime imports from `frontend/src/ui/`

- [ ] **Step 4: Run the architecture check**

Run: `npm run validate`
Expected: PASS with no internal `components/` import violations

- [ ] **Step 5: Retire deprecated-surface tests**

Either delete `frontend/src/components/organisms/components.test.ts` or reduce it to a minimal compatibility assertion that `components/` still re-exports the canonical `ui/` implementation. Do not keep full behavioral coverage anchored to the deprecated surface.

- [ ] **Step 6: Re-run focused verification**

Run: `npm test -- frontend/src/ui/composites/components.test.ts`
Expected: PASS

### Task 2: Normalize The `components/` Compatibility Layer

**Files:**
- Modify: `frontend/src/components/atoms/Button.ts`
- Modify: `frontend/src/components/atoms/Chip.ts`
- Modify: `frontend/src/components/atoms/ColorInput.ts`
- Modify: `frontend/src/components/atoms/IconButton.ts`
- Modify: `frontend/src/components/atoms/Select.ts`
- Modify: `frontend/src/components/atoms/TextInput.ts`
- Modify: `frontend/src/components/molecules/ColorBySelect.ts`
- Modify: `frontend/src/components/molecules/ModalFrame.ts`
- Modify: `frontend/src/components/molecules/RangeChip.ts`
- Modify: `frontend/src/components/molecules/RangeSlider.ts`
- Modify: `frontend/src/components/molecules/SeriesChip.ts`
- Modify: `frontend/src/components/organisms/ColumnFilterModal.ts`
- Modify: `frontend/src/components/organisms/ColumnSelector.ts`
- Modify: `frontend/src/components/organisms/RangeControls.ts`

- [ ] **Step 1: Audit every file under `frontend/src/components/`**

Confirm each file is a pure re-export and contains no unique logic, side effects, or test-only behavior.

Expected shape:

```ts
// DEPRECATED: import from 'ui/' directly.
export { ColumnSelector, type ColumnSelectorProps } from '../../ui/composites/ColumnSelector.js';
```

- [ ] **Step 2: Normalize any outliers to the pure-adapter shape**

If any `components/` file contains logic beyond comments and re-exports, convert it to a pure adapter in this task. Do not delete the adapter yet.

- [ ] **Step 3: Re-run architecture validation**

Run: `npm run validate`
Expected: PASS

### Task 3: Add A Shared Analytics Page Runtime

**Files:**
- Create: `frontend/src/pages/shared/analysisPageRuntime.ts`
- Create: `frontend/src/pages/shared/analysisPageRuntime.test.ts`

- [ ] **Step 1: Write the failing shared runtime test**

Create `frontend/src/pages/shared/analysisPageRuntime.test.ts` covering:

- `mount()` wires `createPageLifecycle(...)` for the requested page
- `bindExports()` runs once during initialization
- `updateEmptyState(...)` delegates to one empty-state controller instance
- `onVisible()` runs when the page becomes active

Test skeleton:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createAnalysisPageRuntime } from './analysisPageRuntime.js';

describe('createAnalysisPageRuntime', () => {
    it('binds exports once and forwards empty-state updates', () => {
        const bindExports = vi.fn();
        const onVisible = vi.fn();
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            bindExports,
            onVisible,
        });
        expect(typeof runtime.mount).toBe('function');
        expect(typeof runtime.updateEmptyState).toBe('function');
    });
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- frontend/src/pages/shared/analysisPageRuntime.test.ts`
Expected: FAIL because the module does not exist yet

- [ ] **Step 3: Implement the shared runtime**

Create `frontend/src/pages/shared/analysisPageRuntime.ts` with a narrow surface:

```ts
import { createPageLifecycle } from '../../app/pageLifecycle.js';
import {
    createEmptyStateController,
    type EmptyStateController,
    type EmptyStateViewModel,
} from '../../ui/emptyState.js';

export interface AnalysisPageRuntimeOptions {
    page: string;
    emptyStateRootId: string;
    bindExports?: () => void;
    init?: () => void | (() => void);
    onVisible?: () => void;
}

export function createAnalysisPageRuntime(options: AnalysisPageRuntimeOptions) {
    let emptyState: EmptyStateController | null = null;
    const getEmptyState = () => {
        if (!emptyState) {
            emptyState = createEmptyStateController({ rootId: options.emptyStateRootId });
        }
        return emptyState;
    };

    return {
        mount() {
            return createPageLifecycle({
                page: options.page,
                init() {
                    options.bindExports?.();
                    return options.init?.();
                },
                onVisible: options.onVisible,
            });
        },
        updateEmptyState(model: EmptyStateViewModel) {
            getEmptyState().update(model);
        },
    };
}
```

- [ ] **Step 4: Run the targeted shared-runtime test**

Run: `npm test -- frontend/src/pages/shared/analysisPageRuntime.test.ts`
Expected: PASS

### Task 4: Refactor `fftPage.ts` To Use The Shared Runtime

**Files:**
- Modify: `frontend/src/pages/fftPage.ts`
- Modify: `frontend/src/pages/fftPage.test.ts`

- [ ] **Step 1: Replace the local empty-state singleton and lifecycle shell**

Refactor `frontend/src/pages/fftPage.ts` so:

- local FFT trace and render behavior stays in place
- export binding moves into a `bindExports()` closure
- empty-state updates go through `createAnalysisPageRuntime(...)`
- lifecycle registration is created by `runtime.mount()`

Do not change:

- FFT chip behavior
- zoom reset semantics
- spectral filter behavior
- export filenames or CSV payload shape

- [ ] **Step 2: Update or extend the FFT page test**

Cover the shell-level contract that must remain stable:

- export buttons still bind once
- empty state is shown when no traces are selected
- page activation still initializes the FFT chart flow

- [ ] **Step 3: Run focused FFT verification**

Run: `npm test -- frontend/src/pages/fftPage.test.ts`
Expected: PASS

### Task 5: Refactor `heatmapPage.ts` To Use The Shared Runtime

**Files:**
- Modify: `frontend/src/pages/heatmapPage.ts`
- Create: `frontend/src/pages/heatmapPage.test.ts`

- [ ] **Step 1: Replace the local empty-state singleton and lifecycle shell**

Refactor `frontend/src/pages/heatmapPage.ts` so:

- matrix fetch and render logic stays in the page
- export binding moves into a `bindExports()` closure
- empty-state updates go through `createAnalysisPageRuntime(...)`
- `loadMatrix()` remains the `onVisible()` action

Do not change:

- correlation color mapping
- click-through to Scatter
- export filenames or CSV matrix shape

- [ ] **Step 2: Add focused heatmap regression coverage**

Create `frontend/src/pages/heatmapPage.test.ts` covering:

- visible page activation triggers `loadMatrix()`
- empty state still appears when matrix data is missing
- export binding remains callable without matrix data crashes

- [ ] **Step 3: Run focused heatmap verification**

Run: `npm test -- frontend/src/pages/heatmapPage.test.ts`
Expected: PASS

### Task 6: Refactor `spectrogramPage.ts` To Use The Shared Runtime

**Files:**
- Modify: `frontend/src/pages/spectrogramPage.ts`
- Create: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] **Step 1: Replace the local empty-state singleton and lifecycle shell**

Refactor `frontend/src/pages/spectrogramPage.ts` so:

- ECharts setup and drag-to-zoom logic stay in the page
- export binding moves into a `bindExports()` closure
- empty-state updates go through `createAnalysisPageRuntime(...)`
- visibility handling remains page-local through the shared runtime

Do not change:

- chart initialization timing guards
- tooltip or axis formatting
- zoom behavior
- export filenames

- [ ] **Step 2: Add focused spectrogram regression coverage**

Create `frontend/src/pages/spectrogramPage.test.ts` covering:

- empty state still appears before data exists
- page activation still allows one-time chart setup
- export binding remains wired after refactor

- [ ] **Step 3: Run focused spectrogram verification**

Run: `npm test -- frontend/src/pages/spectrogramPage.test.ts`
Expected: PASS

### Task 7: Run Cross-Wave Verification

**Files:**
- Test: `frontend/src/ui/composites/components.test.ts`
- Test: `frontend/src/pages/shared/analysisPageRuntime.test.ts`
- Test: `frontend/src/pages/fftPage.test.ts`
- Test: `frontend/src/pages/heatmapPage.test.ts`
- Test: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] **Step 1: Run targeted tests for this refactor wave**

Run:

```bash
npm test -- \
  frontend/src/ui/composites/components.test.ts \
  frontend/src/pages/shared/analysisPageRuntime.test.ts \
  frontend/src/pages/fftPage.test.ts \
  frontend/src/pages/heatmapPage.test.ts \
  frontend/src/pages/spectrogramPage.test.ts
```

Expected: PASS

- [ ] **Step 2: Run type and architecture validation**

Run: `npm run check:frontend`
Expected: PASS

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Run a browser smoke check**

Run: `npm run dev`
Manual verification:

- timeseries still loads normally
- FFT still computes and exports
- heatmap still loads and links to Scatter
- spectrogram still computes, zooms, and exports

## Why This Order

- Task 1 makes the intended UI boundary explicit before more code starts depending on the wrong namespace.
- Task 2 keeps the compatibility layer honest without deleting it prematurely.
- Tasks 3 through 6 extract only the repeated analytics page shell and leave page-specific behavior in place.
- Task 7 proves the structure changed without changing behavior.

## Deferred Cleanup

Do not delete `frontend/src/components/` in this plan. Once the canonical `ui/` surface has soaked and no remaining compatibility consumers matter, remove the deprecated facade in a later cleanup-only change.
