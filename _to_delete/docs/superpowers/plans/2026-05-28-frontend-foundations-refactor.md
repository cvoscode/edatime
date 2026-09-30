# Frontend Foundations Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the frontend foundations so app boot, shared UI, and feature ownership are clearly separated without changing current behavior.

**Architecture:** Introduce a thin app runtime and page registry, consolidate canonical shared UI under `frontend/src/ui/`, and promote Timeseries into the first feature entrypoint. Keep compatibility adapters in place while call sites migrate so the app remains stable and future migration to fuller component composition stays open.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, Vanilla DOM rendering, custom store

---

## File Map

- **Create:** `frontend/src/app/runtime.ts`
  - Runtime container for cleanup registration, feature dependencies, and shared boot helpers.
- **Create:** `frontend/src/app/pageRegistry.ts`
  - Canonical page loader registry and metadata-gated lazy loading.
- **Create:** `frontend/src/app/shell.ts`
  - Global shell initialization wrapper that absorbs current `bootstrap/appShell.ts` responsibilities.
- **Create:** `frontend/src/app/runtime.test.ts`
  - Verifies cleanup registration and page-registry lifecycle behavior.
- **Modify:** `frontend/src/app.ts`
  - Reduce to dependency assembly and top-level orchestration only.
- **Modify:** `frontend/src/bootstrap/appShell.ts`
  - Shrink into compatibility adapter or re-export while behavior moves into `app/shell.ts`.
- **Modify:** `frontend/src/bootstrap/pageLoaders.ts`
  - Shrink into compatibility adapter or re-export while behavior moves into `app/pageRegistry.ts`.
- **Modify:** `frontend/src/bootstrap/sessionBootstrap.ts`
  - Depend on the new app runtime hooks instead of old boot coupling.

- **Create:** `frontend/src/ui/primitives/Button.ts`
- **Create:** `frontend/src/ui/primitives/Chip.ts`
- **Create:** `frontend/src/ui/primitives/IconButton.ts`
- **Create:** `frontend/src/ui/primitives/Select.ts`
- **Create:** `frontend/src/ui/primitives/TextInput.ts`
- **Create:** `frontend/src/ui/primitives/ColorInput.ts`
- **Create:** `frontend/src/ui/primitives/index.ts`
  - Canonical shared UI primitive entrypoints.
- **Create:** `frontend/src/ui/composites/SeriesChip.ts`
- **Create:** `frontend/src/ui/composites/RangeChip.ts`
- **Create:** `frontend/src/ui/composites/RangeSlider.ts`
- **Create:** `frontend/src/ui/composites/ColorBySelect.ts`
- **Create:** `frontend/src/ui/composites/ModalFrame.ts`
- **Create:** `frontend/src/ui/composites/ColumnSelector.ts`
- **Create:** `frontend/src/ui/composites/RangeControls.ts`
- **Create:** `frontend/src/ui/composites/ColumnFilterModal.ts`
- **Create:** `frontend/src/ui/composites/index.ts`
  - Canonical shared composite entrypoints.
- **Modify:** `frontend/src/components/atoms/Button.ts`
- **Modify:** `frontend/src/components/atoms/Chip.ts`
- **Modify:** `frontend/src/components/atoms/ColorInput.ts`
- **Modify:** `frontend/src/components/atoms/IconButton.ts`
- **Modify:** `frontend/src/components/atoms/Select.ts`
- **Modify:** `frontend/src/components/atoms/TextInput.ts`
- **Modify:** `frontend/src/components/molecules/ColorBySelect.ts`
- **Modify:** `frontend/src/components/molecules/ModalFrame.ts`
- **Modify:** `frontend/src/components/molecules/RangeChip.ts`
- **Modify:** `frontend/src/components/molecules/RangeSlider.ts`
- **Modify:** `frontend/src/components/molecules/SeriesChip.ts`
- **Modify:** `frontend/src/components/organisms/ColumnFilterModal.ts`
- **Modify:** `frontend/src/components/organisms/ColumnSelector.ts`
- **Modify:** `frontend/src/components/organisms/RangeControls.ts`
  - Convert to compatibility re-exports from the canonical `ui/` implementation.

- **Create:** `frontend/src/ui/shell/createModalController.ts`
- **Create:** `frontend/src/ui/shell/createDrawerController.ts`
- **Create:** `frontend/src/ui/shell/index.ts`
  - Shared shell interaction controllers.
- **Modify:** `frontend/src/ui/modalUtils.ts`
- **Modify:** `frontend/src/ui/settingsPanel.ts`
- **Modify:** `frontend/src/ui/analyticsDrawer.ts`
- **Modify:** `frontend/src/ui/dataMutationModals.ts`
  - Rebuild against shared shell controllers.
- **Create:** `frontend/src/ui/modalUtils.test.ts`
  - Validates close/cancel/backdrop wiring through the shared controller layer.

- **Create:** `frontend/src/features/timeseries/entrypoint.ts`
  - Canonical Timeseries feature bootstrap surface.
- **Create:** `frontend/src/features/timeseries/entrypoint.test.ts`
  - Verifies feature wiring, rebuild hooks, and event bridging.
- **Modify:** `frontend/src/features/timeseries/columnsController.ts`
- **Modify:** `frontend/src/bootstrap/timeseriesBootstrap.ts`
- **Modify:** `frontend/src/pages/timeseriesPage.ts`
- **Modify:** `frontend/src/ui/columns.ts`
- **Modify:** `frontend/src/ui/upload.ts`
- **Modify:** `frontend/src/ui/profile.ts`
  - Move Timeseries-owned coordination behind the feature entrypoint.

- **Create:** `frontend/src/features/scatter/entrypoint.ts`
- **Create:** `frontend/src/features/causal/entrypoint.ts`
- **Create:** `frontend/src/features/drift/entrypoint.ts`
- **Create:** `frontend/src/features/fft/entrypoint.ts`
- **Create:** `frontend/src/features/spectrogram/entrypoint.ts`
- **Create:** `frontend/src/features/heatmap/entrypoint.ts`
  - Thin wrappers around existing page init code so all pages share one entrypoint model.
- **Modify:** `frontend/src/app/pageRegistry.ts`
- **Modify:** `frontend/src/bootstrap/pageLoaders.ts`
  - Use feature entrypoints instead of ad-hoc page-specific boot logic.

- **Modify:** `frontend/src/components/organisms/components.test.ts`
- **Modify:** `frontend/src/components/molecules/SeriesChip.test.ts`
- **Modify:** `frontend/src/bootstrap/appShell.test.ts`
- **Modify:** `frontend/src/features/timeseries/columnsController.test.ts`
- **Modify:** `frontend/src/scatter/scatterPage.test.ts`
- **Modify:** `frontend/src/causal/causalPage.test.ts`
- **Modify:** `frontend/src/drift/driftPage.test.ts`
- **Modify:** `frontend/src/pages/fftPage.test.ts`
- **Modify:** `frontend/src/pages/spectrogramPage.test.ts`
- **Modify:** `frontend/src/pages/heatmapPage.test.ts`
  - Keep existing behavior covered while the architecture shifts.

### Task 1: Establish The App Runtime And Page Registry

**Files:**
- Create: `frontend/src/app/runtime.ts`
- Create: `frontend/src/app/pageRegistry.ts`
- Create: `frontend/src/app/runtime.test.ts`
- Modify: `frontend/src/bootstrap/pageLoaders.ts`

- [ ] **Step 1: Write the failing runtime tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createAppRuntime } from './runtime';
import { createPageRegistry } from './pageRegistry';

describe('app runtime', () => {
    it('runs registered cleanups once when disposed', () => {
        const runtime = createAppRuntime();
        const cleanup = vi.fn();
        runtime.registerCleanup(cleanup);
        runtime.dispose();
        runtime.dispose();
        expect(cleanup).toHaveBeenCalledTimes(1);
    });
});

describe('page registry', () => {
    it('waits for metadata readiness before initializing a gated page', async () => {
        const init = vi.fn(async () => {});
        const registry = createPageRegistry();
        registry.register('scatter', { requiresMetadata: true, init });
        const pending = registry.ensureLoaded('scatter');
        expect(init).not.toHaveBeenCalled();
        registry.markMetadataReady();
        await pending;
        expect(init).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- frontend/src/app/runtime.test.ts`
Expected: FAIL because `runtime.ts` and `pageRegistry.ts` do not exist yet.

- [ ] **Step 3: Implement the runtime and registry**

```ts
export function createAppRuntime() {
    const cleanups = new Set<() => void>();
    let disposed = false;
    return {
        registerCleanup(fn: () => void) {
            if (disposed) return () => {};
            cleanups.add(fn);
            return () => cleanups.delete(fn);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const fn of cleanups) fn();
            cleanups.clear();
        },
    };
}
```

```ts
export function createPageRegistry() {
    const loaded = new Set<string>();
    const pages = new Map<string, { requiresMetadata: boolean; init: () => Promise<void> }>();
    let metadataReady = false;
    let releaseMetadata: (() => void) | null = null;
    const metadataPromise = new Promise<void>((resolve) => { releaseMetadata = resolve; });
    return {
        register(name: string, page: { requiresMetadata: boolean; init: () => Promise<void> }) {
            pages.set(name, page);
        },
        async ensureLoaded(name: string) {
            if (loaded.has(name)) return;
            const page = pages.get(name);
            if (!page) return;
            if (page.requiresMetadata && !metadataReady) await metadataPromise;
            await page.init();
            loaded.add(name);
        },
        markMetadataReady() {
            metadataReady = true;
            releaseMetadata?.();
        },
        clearLoaded() {
            loaded.clear();
        },
    };
}
```

- [ ] **Step 4: Convert `bootstrap/pageLoaders.ts` into a compatibility adapter**

```ts
export {
    clearLoadedPageModules,
    ensurePageModuleLoaded,
    isMetadataReady,
    markMetadataReady,
} from '../app/pageRegistry.js';
```

- [ ] **Step 5: Run the targeted test again**

Run: `npm test -- frontend/src/app/runtime.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/runtime.ts frontend/src/app/pageRegistry.ts frontend/src/app/runtime.test.ts frontend/src/bootstrap/pageLoaders.ts
git commit -m "refactor: add app runtime and page registry"
```

### Task 2: Create Canonical Shared UI Namespaces

**Files:**
- Create: `frontend/src/ui/primitives/Button.ts`
- Create: `frontend/src/ui/primitives/Chip.ts`
- Create: `frontend/src/ui/primitives/IconButton.ts`
- Create: `frontend/src/ui/primitives/Select.ts`
- Create: `frontend/src/ui/primitives/TextInput.ts`
- Create: `frontend/src/ui/primitives/ColorInput.ts`
- Create: `frontend/src/ui/primitives/index.ts`
- Create: `frontend/src/ui/composites/SeriesChip.ts`
- Create: `frontend/src/ui/composites/RangeChip.ts`
- Create: `frontend/src/ui/composites/RangeSlider.ts`
- Create: `frontend/src/ui/composites/ColorBySelect.ts`
- Create: `frontend/src/ui/composites/ModalFrame.ts`
- Create: `frontend/src/ui/composites/ColumnSelector.ts`
- Create: `frontend/src/ui/composites/RangeControls.ts`
- Create: `frontend/src/ui/composites/ColumnFilterModal.ts`
- Create: `frontend/src/ui/composites/index.ts`
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
- Modify: `frontend/src/components/organisms/components.test.ts`

- [ ] **Step 1: Write a failing canonical import test**

```ts
import { describe, expect, it } from 'vitest';
import { SeriesChip } from '../ui/composites/SeriesChip';
import { Button } from '../ui/primitives/Button';

describe('canonical ui exports', () => {
    it('exposes shared primitives and composites from ui/', () => {
        expect(typeof Button).toBe('function');
        expect(typeof SeriesChip).toBe('function');
    });
});
```

- [ ] **Step 2: Run the targeted UI test to verify it fails**

Run: `npm test -- frontend/src/components/organisms/components.test.ts frontend/src/components/molecules/SeriesChip.test.ts`
Expected: FAIL because canonical `ui/primitives` and `ui/composites` modules do not exist yet.

- [ ] **Step 3: Create canonical `ui/` modules by moving implementation, not behavior**

```ts
// frontend/src/ui/composites/SeriesChip.ts
export interface SeriesChipProps {
    column: string;
    checked: boolean;
    color: string;
    disabled?: boolean;
    adaptiveTarget?: boolean;
    menuLabel?: string;
    label?: string;
    title?: string;
    onToggle?: (checked: boolean) => void;
    onColorInput?: (color: string) => void;
    onMenuClick?: () => void;
}
export function SeriesChip(props: SeriesChipProps): HTMLLabelElement {
    const chip = document.createElement('label');
    chip.className = `series-chip${props.checked ? ' active' : ''}`;
    chip.style.setProperty('--chip-accent', props.color);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = props.checked;
    checkbox.addEventListener('change', () => props.onToggle?.(checkbox.checked));
    chip.append(checkbox);
    return chip;
}
```

```ts
// frontend/src/components/molecules/SeriesChip.ts
export * from '../../ui/composites/SeriesChip.js';
```

- [ ] **Step 4: Update tests and imports to prefer canonical `ui/` paths**

```ts
import { ColumnFilterModal } from '../../ui/composites/ColumnFilterModal.js';
import { ColumnSelector } from '../../ui/composites/ColumnSelector.js';
import { RangeControls } from '../../ui/composites/RangeControls.js';
```

- [ ] **Step 5: Run the targeted UI tests again**

Run: `npm test -- frontend/src/components/organisms/components.test.ts frontend/src/components/molecules/SeriesChip.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/primitives frontend/src/ui/composites frontend/src/components frontend/src/components/organisms/components.test.ts frontend/src/components/molecules/SeriesChip.test.ts
git commit -m "refactor: establish canonical shared ui namespaces"
```

### Task 3: Introduce Shared Modal And Drawer Controllers

**Files:**
- Create: `frontend/src/ui/shell/createModalController.ts`
- Create: `frontend/src/ui/shell/createDrawerController.ts`
- Create: `frontend/src/ui/modalUtils.test.ts`
- Modify: `frontend/src/ui/modalUtils.ts`
- Modify: `frontend/src/ui/settingsPanel.ts`
- Modify: `frontend/src/ui/analyticsDrawer.ts`
- Modify: `frontend/src/ui/dataMutationModals.ts`

- [ ] **Step 1: Write the failing modal-controller tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createModalController } from './shell/createModalController';

it('closes on cancel, close button, and backdrop click', () => {
    document.body.innerHTML = `
      <div id="settings-modal" hidden>
        <button id="settings-close-btn"></button>
        <button id="settings-cancel-btn"></button>
      </div>
    `;
    const onClose = vi.fn();
    const controller = createModalController({
        modalId: 'settings-modal',
        closeButtonIds: ['settings-close-btn', 'settings-cancel-btn'],
        onClose,
    });
    controller.open();
    document.getElementById('settings-cancel-btn')?.dispatchEvent(new Event('click'));
    expect(onClose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- frontend/src/ui/modalUtils.test.ts`
Expected: FAIL because shared shell controllers do not exist yet.

- [ ] **Step 3: Implement reusable modal and drawer controllers**

```ts
export function createModalController(opts: {
    modalId: string;
    closeButtonIds: string[];
    onOpen?: () => void;
    onClose?: () => void;
}) {
    const modal = document.getElementById(opts.modalId) as HTMLElement | null;
    const open = () => { if (modal) modal.hidden = false; opts.onOpen?.(); };
    const close = () => { if (modal) modal.hidden = true; opts.onClose?.(); };
    // bind close buttons + backdrop click
    return { open, close };
}
```

- [ ] **Step 4: Rebuild settings, analytics drawer, and data-mutation modals on top of the shared controller layer**

```ts
const controller = createModalController({
    modalId: 'settings-modal',
    closeButtonIds: ['settings-close-btn', 'settings-cancel-btn'],
    onClose: () => { currentSettings = null; },
});
```

- [ ] **Step 5: Run the modal and shell-related tests again**

Run: `npm test -- frontend/src/ui/modalUtils.test.ts frontend/src/bootstrap/appShell.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/shell frontend/src/ui/modalUtils.ts frontend/src/ui/modalUtils.test.ts frontend/src/ui/settingsPanel.ts frontend/src/ui/analyticsDrawer.ts frontend/src/ui/dataMutationModals.ts frontend/src/bootstrap/appShell.test.ts
git commit -m "refactor: unify modal and drawer controllers"
```

### Task 4: Move Global Shell Setup Into `frontend/src/app/shell.ts`

**Files:**
- Create: `frontend/src/app/shell.ts`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/bootstrap/appShell.ts`
- Modify: `frontend/src/bootstrap/sessionBootstrap.ts`
- Modify: `frontend/src/bootstrap/appShell.test.ts`

- [ ] **Step 1: Write a failing shell bootstrap test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { initAppShell } from '../app/shell';

it('initializes global shell services without owning feature-specific behavior', () => {
    const deps = {
        showPage: vi.fn(),
        ensurePageModuleLoaded: vi.fn(),
        initAnalyticsListeners: vi.fn(),
        registerCleanup: vi.fn(),
    };
    initAppShell(deps as any);
    expect(deps.initAnalyticsListeners).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the targeted shell test to verify it fails**

Run: `npm test -- frontend/src/bootstrap/appShell.test.ts`
Expected: FAIL because canonical `app/shell.ts` does not exist yet.

- [ ] **Step 3: Move shell-only boot logic into `app/shell.ts`**

```ts
export function initAppShell(deps: AppShellDeps): void {
    normalizeFormControlAccessibility();
    initHashRouting();
    initSettings();
    initGuidedWorkflow();
    initThemeToggle();
    initAccessibilityShortcuts();
    initCommandPalette();
    initProvenance();
    deps.initAnalyticsListeners();
}
```

- [ ] **Step 4: Leave `bootstrap/appShell.ts` as a compatibility surface or thin re-export**

```ts
export { initAppShell } from '../app/shell.js';
```

- [ ] **Step 5: Reduce `app.ts` to dependency assembly and explicit runtime wiring**

```ts
const runtime = createAppRuntime();
initAppShell({
    ...deps,
    registerCleanup: runtime.registerCleanup,
});
```

- [ ] **Step 6: Run the targeted shell tests again**

Run: `npm test -- frontend/src/bootstrap/appShell.test.ts frontend/src/app/runtime.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/shell.ts frontend/src/app.ts frontend/src/bootstrap/appShell.ts frontend/src/bootstrap/sessionBootstrap.ts frontend/src/bootstrap/appShell.test.ts
git commit -m "refactor: extract app shell bootstrap"
```

### Task 5: Promote Timeseries To A Feature Entrypoint

**Files:**
- Create: `frontend/src/features/timeseries/entrypoint.ts`
- Create: `frontend/src/features/timeseries/entrypoint.test.ts`
- Modify: `frontend/src/features/timeseries/columnsController.ts`
- Modify: `frontend/src/bootstrap/timeseriesBootstrap.ts`
- Modify: `frontend/src/pages/timeseriesPage.ts`
- Modify: `frontend/src/ui/columns.ts`
- Modify: `frontend/src/ui/upload.ts`
- Modify: `frontend/src/ui/profile.ts`
- Modify: `frontend/src/features/timeseries/columnsController.test.ts`

- [ ] **Step 1: Write the failing Timeseries entrypoint tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTimeseriesEntrypoint } from './entrypoint';

it('rebuilds column toggles and range controls through one feature surface', async () => {
    const feature = createTimeseriesEntrypoint({
        fetchAndRender: vi.fn(),
        renderCurrentData: vi.fn(),
        updateAnalysisYRange: vi.fn(),
    } as any);
    feature.rebuildColumns();
    expect(feature.buildRangeControls).toBeTypeOf('function');
});
```

- [ ] **Step 2: Run the targeted Timeseries tests to verify they fail**

Run: `npm test -- frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/timeseries/columnsController.test.ts`
Expected: FAIL because the feature entrypoint does not exist yet.

- [ ] **Step 3: Implement the Timeseries feature entrypoint as a wrapper around existing modules**

```ts
export function createTimeseriesEntrypoint(deps: TimeseriesFeatureDeps) {
    const rebuildColumns = () => buildColumnToggles(deps.fetchAndRender, buildRangeControls, deps.renderCurrentData);
    return {
        init() {
            initColumnFilterModal(deps.renderCurrentData, deps.updateAnalysisYRange);
            initDatasetSearchInputs({ rebuildColumnToggles: rebuildColumns, renderColumnProfilesGrid: deps.renderColumnProfilesGrid });
            initTimeseriesActions({ ...deps, rebuildColumnToggles: rebuildColumns, buildRangeControls });
        },
        rebuildColumns,
        buildRangeControls,
    };
}
```

- [ ] **Step 4: Replace legacy direct calls in `app.ts`, `ui/columns.ts`, and `ui/upload.ts` with the feature surface**

```ts
const timeseries = createTimeseriesEntrypoint({...});
timeseries.init();
timeseries.rebuildColumns();
timeseries.buildRangeControls();
```

- [ ] **Step 5: Keep `frontend/src/ui/columns.ts` as a temporary adapter**

```ts
export * from '../features/timeseries/columnsController.js';
```

- [ ] **Step 6: Run the targeted Timeseries tests again**

Run: `npm test -- frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/timeseries/columnsController.test.ts frontend/src/ui/upload.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/timeseries/entrypoint.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/timeseries/columnsController.ts frontend/src/bootstrap/timeseriesBootstrap.ts frontend/src/pages/timeseriesPage.ts frontend/src/ui/columns.ts frontend/src/ui/upload.ts frontend/src/ui/profile.ts frontend/src/features/timeseries/columnsController.test.ts
git commit -m "refactor: add timeseries feature entrypoint"
```

### Task 6: Normalize Non-Timeseries Pages Onto The Same Entry Model

**Files:**
- Create: `frontend/src/features/scatter/entrypoint.ts`
- Create: `frontend/src/features/causal/entrypoint.ts`
- Create: `frontend/src/features/drift/entrypoint.ts`
- Create: `frontend/src/features/fft/entrypoint.ts`
- Create: `frontend/src/features/spectrogram/entrypoint.ts`
- Create: `frontend/src/features/heatmap/entrypoint.ts`
- Modify: `frontend/src/app/pageRegistry.ts`
- Modify: `frontend/src/bootstrap/pageLoaders.ts`
- Modify: `frontend/src/scatter/scatterPage.test.ts`
- Modify: `frontend/src/causal/causalPage.test.ts`
- Modify: `frontend/src/drift/driftPage.test.ts`
- Modify: `frontend/src/pages/fftPage.test.ts`
- Modify: `frontend/src/pages/spectrogramPage.test.ts`
- Modify: `frontend/src/pages/heatmapPage.test.ts`

- [ ] **Step 1: Write failing adapter tests for one non-timeseries feature**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createScatterEntrypoint } from './entrypoint';

it('wraps the existing scatter init function behind a stable feature contract', async () => {
    const initScatterPage = vi.fn(async () => {});
    const entry = createScatterEntrypoint({ initScatterPage } as any);
    await entry.init();
    expect(initScatterPage).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the targeted adapter tests to verify they fail**

Run: `npm test -- frontend/src/scatter/scatterPage.test.ts frontend/src/causal/causalPage.test.ts`
Expected: FAIL because canonical feature entrypoints do not exist yet.

- [ ] **Step 3: Create thin feature wrappers around existing page init code**

```ts
export function createScatterEntrypoint(deps: ScatterEntrypointDeps) {
    return {
        init: () => deps.initScatterPage(deps.metadata),
    };
}
```

- [ ] **Step 4: Register the wrappers in `app/pageRegistry.ts` instead of page-specific boot code**

```ts
registry.register('scatter', { requiresMetadata: true, init: () => scatterEntrypoint.init() });
registry.register('causal', { requiresMetadata: true, init: () => causalEntrypoint.init() });
registry.register('fft', { requiresMetadata: true, init: () => fftEntrypoint.init() });
registry.register('spectrogram', { requiresMetadata: true, init: () => spectrogramEntrypoint.init() });
registry.register('heatmap', { requiresMetadata: true, init: () => heatmapEntrypoint.init() });
```

- [ ] **Step 5: Run the targeted non-timeseries tests again**

Run: `npm test -- frontend/src/scatter/scatterPage.test.ts frontend/src/causal/causalPage.test.ts frontend/src/drift/driftPage.test.ts frontend/src/pages/fftPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/pages/heatmapPage.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/scatter/entrypoint.ts frontend/src/features/causal/entrypoint.ts frontend/src/features/drift/entrypoint.ts frontend/src/features/fft/entrypoint.ts frontend/src/features/spectrogram/entrypoint.ts frontend/src/features/heatmap/entrypoint.ts frontend/src/app/pageRegistry.ts frontend/src/bootstrap/pageLoaders.ts frontend/src/scatter/scatterPage.test.ts frontend/src/causal/causalPage.test.ts frontend/src/drift/driftPage.test.ts frontend/src/pages/fftPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/pages/heatmapPage.test.ts
git commit -m "refactor: normalize feature page entrypoints"
```

### Task 7: Full Verification And Cleanup

**Files:**
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/bootstrap/appShell.ts`
- Modify: `frontend/src/bootstrap/pageLoaders.ts`
- Modify: `frontend/src/ui/columns.ts`
- Modify: `frontend/src/components/molecules/SeriesChip.ts`
- Modify: `frontend/src/components/organisms/ColumnSelector.ts`
- Modify: `frontend/src/components/organisms/RangeControls.ts`

- [ ] **Step 1: Run frontend typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 2: Run the full frontend test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run architecture validation**

Run: `npm run validate`
Expected: PASS, including `scripts/check-frontend-architecture.mjs`

- [ ] **Step 4: Manually smoke-check the highest-risk flows**

Run:

```bash
npm run dev
```

Expected manual checks:

- Upload a dataset and confirm the Upload page still hydrates profiles.
- Navigate to Timeseries and confirm chip toggles, range controls, and the column filter modal still work.
- Open Settings, Analytics drawer, Transform, and Outlier modals and confirm close/cancel/backdrop behavior still works.
- Navigate to Scatter, Drift, FFT, Spectrogram, and Causal to confirm lazy loading still initializes each page once.

- [ ] **Step 5: Remove stale compatibility code only if every call site is migrated**

```ts
// delete only after search confirms no callers remain
rg "src/components/|src/ui/columns|bootstrap/pageLoaders|bootstrap/appShell" frontend/src
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "refactor: complete frontend foundation cleanup"
```

## Spec Coverage

- [x] Thin app-level runtime and shell boundary: Tasks 1 and 4
- [x] Single canonical shared UI system: Tasks 2 and 3
- [x] Timeseries as the first explicit feature entrypoint: Task 5
- [x] Cross-app foundation first, then page adoption: Task 6
- [x] Incremental migration with compatibility shims: Tasks 1-7
- [x] Future path toward fuller component composition: Tasks 2, 4, and 6
