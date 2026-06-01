# Frontend Modularization Staged Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the live frontend into clearer app, shell, page, feature, UI, service, and store boundaries so new features can be added with less duplicated wiring and less risk.

**Architecture:** Introduce a generic page runtime first, then shrink `app.ts` and `app/shell.ts` into composition/bootstrap surfaces, then normalize feature entrypoints, then extract page-local controllers from large files, and finally lock the new boundaries with shared UI seams and architecture checks. Behavior should remain substantially the same throughout the migration.

**Tech Stack:** TypeScript, Vite, Vitest, Happy DOM, vanilla DOM rendering, ECharts, ChartGPU, Node-based architecture checks.

---

## File Map

- **Create:** `frontend/src/pages/shared/pageRuntime.ts`
- **Create:** `frontend/src/pages/shared/pageRuntime.test.ts`
- **Modify:** `frontend/src/pages/shared/analysisPageRuntime.ts`
- **Modify:** `frontend/src/pages/shared/analysisPageRuntime.test.ts`
- **Modify:** `frontend/src/pages/timeseriesPage.ts`
- **Modify:** `frontend/src/pages/fftPage.ts`
- **Modify:** `frontend/src/pages/heatmapPage.ts`
- **Modify:** `frontend/src/pages/spectrogramPage.ts`
- **Modify:** `frontend/src/scatter/scatterPage.ts`
- **Modify:** `frontend/src/scatter/scatterPage.test.ts`
- **Modify:** `frontend/src/drift/driftPage.ts`
- **Modify:** `frontend/src/drift/driftPage.test.ts`
  - Canonical shared page runtime adoption.

- **Create:** `frontend/src/app/shell/themeToggle.ts`
- **Create:** `frontend/src/app/shell/a11yNormalization.ts`
- **Create:** `frontend/src/app/shell/homeNavigation.ts`
- **Create:** `frontend/src/app/shell/sampleDatasets.ts`
- **Modify:** `frontend/src/app/shell.ts`
- **Modify:** `frontend/src/app/shell.test.ts`
  - Split global shell bootstrap into focused owners.

- **Create:** `frontend/src/app/bootstrap/ensureTimeseriesReady.ts`
- **Create:** `frontend/src/app/bootstrap/chartBootstrap.ts`
- **Create:** `frontend/src/app/bootstrap/globalShortcuts.ts`
- **Create:** `frontend/src/app/navigation/showPage.ts`
- **Modify:** `frontend/src/app.ts`
- **Modify:** `frontend/src/app/runtime.ts`
- **Modify:** `frontend/src/app/runtime.test.ts`
  - Reduce `app.ts` to composition plus startup order.

- **Create:** `frontend/src/features/fft/entrypoint.test.ts`
- **Create:** `frontend/src/features/heatmap/entrypoint.test.ts`
- **Create:** `frontend/src/features/spectrogram/entrypoint.test.ts`
- **Create:** `frontend/src/features/scatter/entrypoint.test.ts`
- **Create:** `frontend/src/features/causal/entrypoint.test.ts`
- **Create:** `frontend/src/features/drift/entrypoint.test.ts`
- **Modify:** `frontend/src/app/pageModules.ts`
- **Modify:** `frontend/src/features/fft/entrypoint.ts`
- **Modify:** `frontend/src/features/heatmap/entrypoint.ts`
- **Modify:** `frontend/src/features/spectrogram/entrypoint.ts`
- **Modify:** `frontend/src/features/scatter/entrypoint.ts`
- **Modify:** `frontend/src/features/causal/entrypoint.ts`
- **Modify:** `frontend/src/features/drift/entrypoint.ts`
- **Modify:** `frontend/src/features/timeseries/entrypoint.ts`
- **Modify:** `frontend/src/features/timeseries/entrypoint.test.ts`
  - Consistent feature entrypoint contracts.

- **Create:** `frontend/src/scatter/viewController.ts`
- **Create:** `frontend/src/scatter/controls.ts`
- **Create:** `frontend/src/scatter/emptyState.ts`
- **Create:** `frontend/src/pages/spectrogramChartRuntime.ts`
- **Create:** `frontend/src/drift/controls.ts`
- **Modify:** `frontend/src/scatter/state.test.ts`
- **Modify:** `frontend/src/scatter/scatterPage.ts`
- **Modify:** `frontend/src/scatter/scatterPage.test.ts`
- **Modify:** `frontend/src/pages/spectrogramPage.ts`
- **Modify:** `frontend/src/pages/spectrogramPage.test.ts`
- **Modify:** `frontend/src/drift/driftPage.ts`
- **Modify:** `frontend/src/drift/driftPage.test.ts`
  - Page-local controller extraction for the largest remaining page surfaces.

- **Modify:** `frontend/src/ui/seriesChipList.ts`
- **Modify:** `frontend/src/ui/seriesChipList.test.ts`
- **Modify:** `frontend/src/ui/emptyState.ts`
- **Modify:** `frontend/src/ui/emptyState.test.ts`
- **Modify:** `frontend/src/ui/exportControls.ts`
- **Modify:** `frontend/src/ui/pageNavigation.ts`
- **Modify:** `scripts/check-frontend-architecture.mjs`
- **Modify:** `ai/frontend/refactor/2026-06-01-frontend-modularization-staged-design.md`
- **Modify:** `ai/README.md`
  - Shared control convergence plus architecture guardrails and docs.

## Contract Fence

Treat the following as fixed during implementation:

- `ai/contract.md`
- `frontend/src/services/api/*`
- current routes and hash-page names
- current DOM ids used by page navigation, export buttons, empty states, and analysis controls

Only `frontend/src/services/api/*` may:

- call `fetch(...)`
- inspect response headers
- parse transport payloads

No plan step should move API or transport concerns into `app/*`, `pages/*`, `features/*`, or `ui/*`.

### Task 1: Introduce A Canonical Shared Page Runtime

**Files:**
- Create: `frontend/src/pages/shared/pageRuntime.ts`
- Create: `frontend/src/pages/shared/pageRuntime.test.ts`
- Modify: `frontend/src/pages/shared/analysisPageRuntime.ts`
- Modify: `frontend/src/pages/shared/analysisPageRuntime.test.ts`
- Modify: `frontend/src/pages/timeseriesPage.ts`
- Modify: `frontend/src/pages/fftPage.ts`
- Modify: `frontend/src/pages/heatmapPage.ts`
- Modify: `frontend/src/pages/spectrogramPage.ts`
- Modify: `frontend/src/scatter/scatterPage.ts`
- Modify: `frontend/src/scatter/scatterPage.test.ts`
- Modify: `frontend/src/drift/driftPage.ts`
- Modify: `frontend/src/drift/driftPage.test.ts`

- [ ] **Step 1: Add runtime-first tests before moving page logic**

Create `frontend/src/pages/shared/pageRuntime.test.ts` with focused assertions around one-time init, visible hooks, every-page-change hooks, status updates, loading toggles, and lazy empty-state creation:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPageRuntime } from './pageRuntime.js';

describe('createPageRuntime', () => {
    it('runs init once and visible hooks on matching page changes', () => {
        const init = vi.fn();
        const onVisible = vi.fn();
        const runtime = createPageRuntime({
            page: 'scatter',
            emptyStateRootId: 'scatter-empty-state',
            statusElId: 'scatter-status',
            loadingElId: 'scatter-chart-loading',
            init,
            onVisible,
        });

        runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'scatter' } }));
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'scatter' } }));

        expect(init).toHaveBeenCalledTimes(1);
        expect(onVisible).toHaveBeenCalledTimes(2);
    });
});
```

Also extend `frontend/src/pages/shared/analysisPageRuntime.test.ts` so it verifies the analysis wrapper delegates to the generic runtime rather than owning its own lifecycle rules.

- [ ] **Step 2: Run the new runtime tests to freeze the contract**

Run:

```bash
npm test -- frontend/src/pages/shared/pageRuntime.test.ts frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/app/pageLifecycle.test.ts
```

Expected:

- PASS, or a focused failure that captures the runtime behavior gap before any page migration begins

- [ ] **Step 3: Create the generic runtime and convert the analysis runtime into a thin adapter**

Add `frontend/src/pages/shared/pageRuntime.ts` with a page-agnostic shell contract:

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

export function createPageRuntime(options: PageRuntimeOptions) {
    let emptyState: ReturnType<typeof createEmptyStateController> | null = null;
    const getEmptyState = () => emptyState ??= createEmptyStateController({ rootId: options.emptyStateRootId! });

    return {
        mount() { return createPageLifecycle({ page: options.page, init: options.init ?? (() => {}), onVisible: options.onVisible, onEveryPageChange: options.onEveryPageChange }); },
        updateEmptyState(model: EmptyStateViewModel) { if (options.emptyStateRootId) getEmptyState().update(model); },
        updateStatus(text: string) { if (options.statusElId) (document.getElementById(options.statusElId) as HTMLElement | null)!.textContent = text; },
        setLoading(loading: boolean) { if (options.loadingElId) (document.getElementById(options.loadingElId) as HTMLElement | null)!.hidden = !loading; },
    };
}
```

Then simplify `analysisPageRuntime.ts` so it composes `createPageRuntime(...)` plus export binding rather than implementing another page-shell variant.

- [ ] **Step 4: Migrate the live page modules onto the new runtime in low-risk order**

Migrate pages in this order:

1. `fftPage.ts`
2. `heatmapPage.ts`
3. `spectrogramPage.ts`
4. `scatterPage.ts`
5. `driftPage.ts`
6. `timeseriesPage.ts` for status/empty-state/loading ownership only

Keep migrations narrow. A representative page shape should look like:

```ts
const runtime = createPageRuntime({
    page: 'heatmap',
    emptyStateRootId: 'heatmap-empty-state',
    statusElId: 'heatmap-status',
    init() {
        bindHeatmapControls();
    },
    onVisible() {
        void loadMatrix();
    },
});
```

Do not move data-fetch logic into the runtime. Only move shell ownership.

- [ ] **Step 5: Run focused page regressions**

Run:

```bash
npm test -- frontend/src/pages/shared/pageRuntime.test.ts frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/pages/fftPage.test.ts frontend/src/pages/heatmapPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/scatter/scatterPage.test.ts frontend/src/drift/driftPage.test.ts
```

Expected:

- PASS

- [ ] **Step 6: Commit the shared runtime migration**

```bash
git add frontend/src/pages/shared/pageRuntime.ts frontend/src/pages/shared/pageRuntime.test.ts frontend/src/pages/shared/analysisPageRuntime.ts frontend/src/pages/shared/analysisPageRuntime.test.ts frontend/src/pages/fftPage.ts frontend/src/pages/heatmapPage.ts frontend/src/pages/spectrogramPage.ts frontend/src/scatter/scatterPage.ts frontend/src/drift/driftPage.ts frontend/src/pages/timeseriesPage.ts frontend/src/scatter/scatterPage.test.ts frontend/src/drift/driftPage.test.ts
git commit -m "refactor: introduce canonical page runtime"
```

### Task 2: Split `app/shell.ts` Into Focused Global Shell Modules

**Files:**
- Create: `frontend/src/app/shell/themeToggle.ts`
- Create: `frontend/src/app/shell/a11yNormalization.ts`
- Create: `frontend/src/app/shell/homeNavigation.ts`
- Create: `frontend/src/app/shell/sampleDatasets.ts`
- Modify: `frontend/src/app/shell.ts`
- Modify: `frontend/src/app/shell.test.ts`
- Modify: `frontend/src/ui/upload.test.ts`

- [ ] **Step 1: Add shell tests around the boundaries you are about to split**

Extend `frontend/src/app/shell.test.ts` so it proves `initAppShell(...)` delegates to focused helpers instead of directly owning theme, accessibility, and sample-dataset logic:

```ts
vi.mock('./shell/themeToggle.js', () => ({ initThemeToggle: vi.fn() }));
vi.mock('./shell/a11yNormalization.js', () => ({ normalizeFormControlAccessibility: vi.fn() }));
vi.mock('./shell/homeNavigation.js', () => ({ wireHomeNavigationCards: vi.fn() }));
vi.mock('./shell/sampleDatasets.js', () => ({ wireSampleDatasetCards: vi.fn() }));
```

Add one assertion in `frontend/src/ui/upload.test.ts` that sample-dataset loading still reaches the upload flow after extraction.

- [ ] **Step 2: Run the shell-focused tests first**

Run:

```bash
npm test -- frontend/src/app/shell.test.ts frontend/src/ui/upload.test.ts frontend/src/ui/profile.test.ts
```

Expected:

- PASS or a focused failure that shows which shell responsibility still leaks across boundaries

- [ ] **Step 3: Extract global shell helpers without changing shell sequencing**

Create focused modules using current `app/shell.ts` behavior:

```ts
// frontend/src/app/shell/themeToggle.ts
export function initThemeToggle(): void {
    const btn = document.getElementById('theme-toggle-btn');
    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');
    if (!btn) return;
    const savedTheme = localStorage.getItem('edatime-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const apply = (theme: 'dark' | 'light') => {
        if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
        else document.documentElement.removeAttribute('data-theme');
        if (iconDark) iconDark.hidden = theme === 'light';
        if (iconLight) iconLight.hidden = theme !== 'light';
    };
    apply(savedTheme === 'light' ? 'light' : (prefersDark ? 'dark' : 'light'));
    btn.addEventListener('click', () => apply(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'));
}

// frontend/src/app/shell/a11yNormalization.ts
export function normalizeFormControlAccessibility(): void {
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach((control) => {
        if (!control.name && control.id) control.name = control.id;
        if (control.getAttribute('aria-label')) return;
        const labels = Array.from(control.labels || []).map((label) => label.textContent?.trim() || '').filter(Boolean).join(' ');
        const fallback = control.getAttribute('placeholder') || control.getAttribute('title') || control.id || 'Form field';
        control.setAttribute('aria-label', labels || fallback);
    });
}

// frontend/src/app/shell/homeNavigation.ts
export function wireHomeNavigationCards(showPage: (page: string) => void): void {
    document.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((element) => {
        element.addEventListener('click', () => {
            const target = element.dataset.homeNav;
            if (target) showPage(target);
        });
    });
}

// frontend/src/app/shell/sampleDatasets.ts
export function wireSampleDatasetCards(showPage: (page: string) => void): void {
    document.querySelectorAll<HTMLElement>('[data-sample-dataset]').forEach((element) => {
        element.addEventListener('click', () => {
            const dataset = element.dataset.sampleDataset;
            if (dataset) void loadSampleDataset(dataset, showPage);
        });
    });
}
```

Keep `initAppShell(...)` as the ordered composition surface:

```ts
export function initAppShell(deps: AppShellDeps): void {
    normalizeFormControlAccessibility();
    initPages();
    initHashRouting();
    initThemeToggle();
    wireHomeNavigationCards(deps.showPage);
    wireSampleDatasetCards(deps.showPage);
    initUploadPanel(deps.hydrateColumnProfiles, deps.renderColumnProfilesGrid, {
        buildColumnToggles: deps.buildTimeseriesColumns,
        buildRangeControls: deps.buildTimeseriesRanges,
    });
    initAnalysisControls(deps.fetchAndRender);
    deps.initAnalyticsListeners();
}
```

- [ ] **Step 4: Re-run the shell regression set**

Run:

```bash
npm test -- frontend/src/app/shell.test.ts frontend/src/ui/upload.test.ts frontend/src/ui/profile.test.ts frontend/src/ui/guidedWorkflow.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit the shell split**

```bash
git add frontend/src/app/shell.ts frontend/src/app/shell.test.ts frontend/src/app/shell/themeToggle.ts frontend/src/app/shell/a11yNormalization.ts frontend/src/app/shell/homeNavigation.ts frontend/src/app/shell/sampleDatasets.ts frontend/src/ui/upload.test.ts
git commit -m "refactor: split global shell bootstrap"
```

### Task 3: Reduce `app.ts` To Composition And Startup Order

**Files:**
- Create: `frontend/src/app/bootstrap/ensureTimeseriesReady.ts`
- Create: `frontend/src/app/bootstrap/chartBootstrap.ts`
- Create: `frontend/src/app/bootstrap/globalShortcuts.ts`
- Create: `frontend/src/app/navigation/showPage.ts`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/app/runtime.ts`
- Modify: `frontend/src/app/runtime.test.ts`

- [ ] **Step 1: Add tests for the new bootstrap seams before extraction**

Extend `frontend/src/app/runtime.test.ts` with a higher-level assembly assertion that the runtime can register bootstrap cleanups without also owning chart boot logic:

```ts
import { createAppRuntime } from './runtime.js';

it('tracks cleanup registrations independently from app bootstrap orchestration', () => {
    const runtime = createAppRuntime();
    const cleanup = vi.fn();
    runtime.registerCleanup(cleanup);
    runtime.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
});
```

Add one app-level smoke assertion in an existing page or shell test that `showPage('timeseries')` still routes through the sidebar click contract after extraction.

- [ ] **Step 2: Run runtime and shell smoke tests**

Run:

```bash
npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/app/pageLifecycle.test.ts
```

Expected:

- PASS

- [ ] **Step 3: Extract chart boot, timeseries readiness, navigation, and keyboard shortcuts into focused modules**

Create boot helpers that move behavior out of `app.ts` without changing the boot order:

```ts
// frontend/src/app/navigation/showPage.ts
export function showPage(pageName: string): void {
    (document.querySelector(`.sidebar .nav-item[data-page="${pageName}"]`) as HTMLElement | null)?.click?.();
}

// frontend/src/app/bootstrap/globalShortcuts.ts
export function initGlobalShortcuts(deps: { showPage: (page: string) => void; fetchAndRender: () => Promise<void>; resetZoom: () => void; zoomOut: () => void; }): () => void {
    const onKeydown = (event: KeyboardEvent) => {
        const key = String(event.key || '').toLowerCase();
        if (event.altKey && key === '2') { event.preventDefault(); deps.showPage('timeseries'); }
        if (event.altKey && key === '3') { event.preventDefault(); deps.showPage('scatter'); }
        if (event.shiftKey && !event.altKey && key === 'r') { event.preventDefault(); deps.resetZoom(); }
        if (event.shiftKey && !event.altKey && key === 'z') { event.preventDefault(); deps.zoomOut(); }
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
}

// frontend/src/app/bootstrap/ensureTimeseriesReady.ts
export function createTimeseriesBootstrap(deps: { appState: typeof appState; createChart: () => Promise<ChartInstance>; bindAnalysisChartEvents: () => void; fetchAndRender: () => Promise<void>; renderCurrentData: () => void; }): { ensureReady: () => Promise<void> } {
    let ready = false;
    let pending: Promise<void> | null = null;
    return {
        ensureReady: async () => {
            if (ready) return;
            if (pending) return pending;
            pending = (async () => {
                deps.appState.chart ??= await deps.createChart();
                await deps.appState.chart.init();
                deps.bindAnalysisChartEvents();
                deps.renderCurrentData();
                await deps.fetchAndRender();
                ready = true;
            })();
            await pending;
            pending = null;
        },
    };
}
```

Keep `app.ts` as the composition root that wires the extracted helpers together rather than holding their full bodies inline.

- [ ] **Step 4: Run targeted regressions and static checks**

Run:

```bash
npm test -- frontend/src/app/runtime.test.ts frontend/src/app/shell.test.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/pages/timeseriesLayout.test.ts
npm run typecheck
```

Expected:

- tests PASS
- `npm run typecheck` exits `0`

- [ ] **Step 5: Commit the app composition extraction**

```bash
git add frontend/src/app.ts frontend/src/app/runtime.ts frontend/src/app/runtime.test.ts frontend/src/app/bootstrap/ensureTimeseriesReady.ts frontend/src/app/bootstrap/chartBootstrap.ts frontend/src/app/bootstrap/globalShortcuts.ts frontend/src/app/navigation/showPage.ts
git commit -m "refactor: reduce app.ts to composition root"
```

### Task 4: Normalize Feature Entrypoint Contracts Across All Live Features

**Files:**
- Create: `frontend/src/features/fft/entrypoint.test.ts`
- Create: `frontend/src/features/heatmap/entrypoint.test.ts`
- Create: `frontend/src/features/spectrogram/entrypoint.test.ts`
- Create: `frontend/src/features/scatter/entrypoint.test.ts`
- Create: `frontend/src/features/causal/entrypoint.test.ts`
- Create: `frontend/src/features/drift/entrypoint.test.ts`
- Modify: `frontend/src/app/pageModules.ts`
- Modify: `frontend/src/features/fft/entrypoint.ts`
- Modify: `frontend/src/features/heatmap/entrypoint.ts`
- Modify: `frontend/src/features/spectrogram/entrypoint.ts`
- Modify: `frontend/src/features/scatter/entrypoint.ts`
- Modify: `frontend/src/features/causal/entrypoint.ts`
- Modify: `frontend/src/features/drift/entrypoint.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.ts`
- Modify: `frontend/src/features/timeseries/entrypoint.test.ts`

- [ ] **Step 1: Freeze the public shape of each entrypoint with tests**

Add one test per feature entrypoint that asserts:

- explicit dependency input
- a returned object with `init()`
- no immediate DOM work before `init()`

Representative test:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createHeatmapEntrypoint } from './entrypoint.js';

describe('createHeatmapEntrypoint', () => {
    it('returns an explicit init surface', () => {
        const showPage = vi.fn();
        const entrypoint = createHeatmapEntrypoint({ showPage });
        expect(typeof entrypoint.init).toBe('function');
        expect(showPage).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run the entrypoint test suite before implementation changes**

Run:

```bash
npm test -- frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/fft/entrypoint.test.ts frontend/src/features/heatmap/entrypoint.test.ts frontend/src/features/spectrogram/entrypoint.test.ts frontend/src/features/scatter/entrypoint.test.ts frontend/src/features/causal/entrypoint.test.ts frontend/src/features/drift/entrypoint.test.ts
```

Expected:

- PASS for new wrappers, or focused failures that capture contract inconsistencies

- [ ] **Step 3: Normalize all entrypoint return shapes and app registration code**

Move all live entrypoints toward the same shape:

```ts
export interface FeatureEntrypoint {
    init: () => void | Promise<void>;
}

export function createScatterEntrypoint(deps: ScatterEntrypointDeps): FeatureEntrypoint {
    return {
        init: () => {
            const metadata = deps.getMetadata();
            return deps.initScatterPage(metadata);
        },
    };
}
```

Update `frontend/src/app/pageModules.ts` so it registers all pages through a uniform `init` surface and stops carrying per-feature special cases beyond dependency wiring.

- [ ] **Step 4: Run feature-entrypoint regressions**

Run:

```bash
npm test -- frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/fft/entrypoint.test.ts frontend/src/features/heatmap/entrypoint.test.ts frontend/src/features/spectrogram/entrypoint.test.ts frontend/src/features/scatter/entrypoint.test.ts frontend/src/features/causal/entrypoint.test.ts frontend/src/features/drift/entrypoint.test.ts frontend/src/app/runtime.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit the normalized entrypoint wave**

```bash
git add frontend/src/app/pageModules.ts frontend/src/features/timeseries/entrypoint.ts frontend/src/features/timeseries/entrypoint.test.ts frontend/src/features/fft/entrypoint.ts frontend/src/features/fft/entrypoint.test.ts frontend/src/features/heatmap/entrypoint.ts frontend/src/features/heatmap/entrypoint.test.ts frontend/src/features/spectrogram/entrypoint.ts frontend/src/features/spectrogram/entrypoint.test.ts frontend/src/features/scatter/entrypoint.ts frontend/src/features/scatter/entrypoint.test.ts frontend/src/features/causal/entrypoint.ts frontend/src/features/causal/entrypoint.test.ts frontend/src/features/drift/entrypoint.ts frontend/src/features/drift/entrypoint.test.ts
git commit -m "refactor: normalize feature entrypoints"
```

### Task 5: Extract Page-Local Controllers From The Largest Remaining Page Files

**Files:**
- Create: `frontend/src/scatter/viewController.ts`
- Create: `frontend/src/scatter/controls.ts`
- Create: `frontend/src/scatter/emptyState.ts`
- Create: `frontend/src/pages/spectrogramChartRuntime.ts`
- Create: `frontend/src/drift/controls.ts`
- Modify: `frontend/src/scatter/scatterPage.ts`
- Modify: `frontend/src/scatter/scatterPage.test.ts`
- Modify: `frontend/src/scatter/state.test.ts`
- Modify: `frontend/src/pages/spectrogramPage.ts`
- Modify: `frontend/src/pages/spectrogramPage.test.ts`
- Modify: `frontend/src/drift/driftPage.ts`
- Modify: `frontend/src/drift/driftPage.test.ts`

- [ ] **Step 1: Tighten tests around the biggest page-level behaviors first**

Before extraction, add focused tests covering:

- scatter view switching and empty-state reasons
- spectrogram zoom/reset and chart-ready handling
- drift control behavior and window-list interaction

Representative additions:

```ts
it('keeps scatter empty-state reasons stable when controls are rebound', async () => {
    await initScatterPage(metadata);
    expect(emptyStateUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ reason: 'no-columns-selected' }));
});
```

```ts
it('keeps drift window keyboard semantics after control extraction', async () => {
    await initDriftPage(metadata);
    expect(document.querySelector('[role="option"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run the focused page tests to freeze current behavior**

Run:

```bash
npm test -- frontend/src/scatter/scatterPage.test.ts frontend/src/scatter/state.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/drift/driftPage.test.ts
```

Expected:

- PASS

- [ ] **Step 3: Extract scatter page-local controllers**

Split `scatterPage.ts` into focused owners:

```ts
// frontend/src/scatter/emptyState.ts
export function createScatterEmptyState(deps: { getControls: () => ScatterControls; getTotals: () => { totalPoints: number; loading: boolean; }; }) {
    return {
        sync(message?: string) {
            const controls = deps.getControls();
            const totals = deps.getTotals();
            const emptyState = getScatterEmptyStateController();
            const hasAxes = !!controls.x && !!controls.y;
            const reason = !hasAxes ? 'no-columns-selected' : totals.loading ? 'loading' : totals.totalPoints === 0 ? 'no-data-after-filters' : '';
            emptyState.update({
                visible: reason !== '' && reason !== 'loading',
                reason,
                title: hasAxes ? 'No scatter points found' : 'Choose scatter axes',
                message: message || (hasAxes ? 'No points match the current query.' : 'Choose X and Y numeric columns to render the scatter plot.'),
            });
        },
    };
}

// frontend/src/scatter/viewController.ts
export function createScatterViewController(deps: { renderMatrix: () => Promise<void>; resizePlot: () => void; }) {
    return {
        async setView(viewName: string, options: { render?: boolean } = {}) {
            const shouldRender = options.render !== false;
            appState.scatter.activeView = viewName || 'plot';
            syncScatterViewButtons(appState.scatter.activeView);
            if (!shouldRender) return;
            if (appState.scatter.activeView === 'matrix') await deps.renderMatrix();
            else deps.resizePlot();
        },
        refreshActiveView() {
            return this.setView(appState.scatter.activeView, { render: true });
        },
    };
}

// frontend/src/scatter/controls.ts
export function bindScatterControls(deps: { onViewChange: (view: string) => Promise<void>; onOpenCausal: () => void; }) {
    document.querySelectorAll<HTMLButtonElement>('[data-scatter-view]').forEach((button) => {
        button.addEventListener('click', () => {
            const view = button.dataset.scatterView || 'plot';
            void deps.onViewChange(view);
        });
    });
    document.getElementById('scatter-open-causal-btn')?.addEventListener('click', deps.onOpenCausal);
}
```

- [ ] **Step 4: Extract spectrogram and drift local controllers without changing page contracts**

Move the most isolated logic out of the page files:

```ts
// frontend/src/pages/spectrogramChartRuntime.ts
export function createSpectrogramChartRuntime(chartEl: HTMLDivElement, deps: { logScale: () => boolean; onStatus: (text: string) => void; }) {
    let chartPromise: Promise<any> | null = null;
    return {
        ensureChart: async () => {
            chartPromise ??= (async () => {
                const echarts = await import('echarts');
                const chart = echarts.init(chartEl, undefined, { renderer: 'canvas' });
                const resizeObserver = new ResizeObserver(() => chart.resize());
                resizeObserver.observe(chartEl);
                return chart;
            })();
            return chartPromise;
        },
        render: async (result: SpectrogramResult, sampleCount: number) => {
            const chart = await this.ensureChart();
            chart.setOption({
                animation: false,
                xAxis: { type: 'category', data: result.times_ms },
                yAxis: { type: 'category', data: result.frequencies },
                visualMap: { min: 0, max: 1, calculable: true },
                series: [{
                    type: 'heatmap',
                    data: result.times_ms.flatMap((timeMs, timeIndex) => result.frequencies.map((freq, freqIndex) => [timeIndex, freqIndex, deps.logScale() ? Math.log10(Math.max(Number(result.magnitudes[timeIndex]?.[freqIndex] ?? 0), 1e-30)) : Number(result.magnitudes[timeIndex]?.[freqIndex] ?? 0), timeMs, freq])),
                }],
            });
            deps.onStatus(`${result.column} · ${result.times_ms.length} windows × ${result.frequencies.length} bins · ${sampleCount} samples`);
        },
    };
}

// frontend/src/drift/controls.ts
export function createDriftControls(deps: { numericColumns: string[]; onCompute: () => Promise<void>; onResetZoom: () => void; }) {
    return {
        bind() {
            const list = document.getElementById('drift-col-picker-list');
            if (list) {
                list.innerHTML = '';
                deps.numericColumns.forEach((column) => {
                    const label = document.createElement('label');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'drift-col-cb';
                    checkbox.value = column;
                    label.append(checkbox, document.createTextNode(column));
                    list.appendChild(label);
                });
            }
            document.getElementById('drift-compute-btn')?.addEventListener('click', () => { void deps.onCompute(); });
            document.getElementById('drift-zoom-reset-btn')?.addEventListener('click', deps.onResetZoom);
        },
    };
}
```

Keep `spectrogramPage.ts` and `driftPage.ts` as orchestrators that assemble these controllers, not as the sole owner of all DOM behavior.

- [ ] **Step 5: Run focused regressions plus typecheck**

Run:

```bash
npm test -- frontend/src/scatter/scatterPage.test.ts frontend/src/scatter/state.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/drift/driftPage.test.ts
npm run typecheck
```

Expected:

- tests PASS
- `npm run typecheck` exits `0`

- [ ] **Step 6: Commit the page-controller extraction wave**

```bash
git add frontend/src/scatter/viewController.ts frontend/src/scatter/controls.ts frontend/src/scatter/emptyState.ts frontend/src/scatter/scatterPage.ts frontend/src/scatter/scatterPage.test.ts frontend/src/scatter/state.test.ts frontend/src/pages/spectrogramChartRuntime.ts frontend/src/pages/spectrogramPage.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/drift/controls.ts frontend/src/drift/driftPage.ts frontend/src/drift/driftPage.test.ts
git commit -m "refactor: extract page-local controllers"
```

### Task 6: Consolidate Shared Controls And Enforce The New Boundaries

**Files:**
- Modify: `frontend/src/ui/seriesChipList.ts`
- Modify: `frontend/src/ui/seriesChipList.test.ts`
- Modify: `frontend/src/ui/emptyState.ts`
- Modify: `frontend/src/ui/emptyState.test.ts`
- Modify: `frontend/src/ui/exportControls.ts`
- Modify: `frontend/src/ui/pageNavigation.ts`
- Modify: `scripts/check-frontend-architecture.mjs`
- Modify: `ai/frontend/refactor/2026-06-01-frontend-modularization-staged-design.md`
- Modify: `ai/README.md`

- [ ] **Step 1: Add guardrail tests around the shared UI seams**

Strengthen the existing UI tests so they protect the converged seams:

```ts
it('preserves shared chip DOM state across rerenders', () => {
    renderSeriesChipList({ container, items, preserveExisting: true });
    expect(container.querySelector('[data-col="HUFL"]')?.classList.contains('loading')).toBe(true);
});
```

```ts
it('keeps empty-state updates declarative and DOM-id driven', () => {
    const controller = createEmptyStateController({ rootId: 'scatter-empty-state' });
    controller.update({ visible: true, reason: 'no-data-after-filters', title: 'No data', message: 'Try widening the time range.' });
    expect(document.getElementById('scatter-empty-state')?.hidden).toBe(false);
});
```

- [ ] **Step 2: Run the shared UI tests first**

Run:

```bash
npm test -- frontend/src/ui/seriesChipList.test.ts frontend/src/ui/emptyState.test.ts frontend/src/utils/bindExportButtons.test.ts
```

Expected:

- PASS

- [ ] **Step 3: Finish consolidating shared control ownership**

Make the shared UI seams explicit:

```ts
// frontend/src/ui/exportControls.ts
export interface ExportSurface {
    bind(): void;
    setEnabled(enabled: boolean): void;
}

export function createExportSurface(deps: {
    key: string;
    buttons: { png?: HTMLButtonElement | null; svg?: HTMLButtonElement | null; html?: HTMLButtonElement | null; csv?: HTMLButtonElement | null; };
    bind: () => void;
}): ExportSurface {
    return {
        bind() {
            deps.bind();
        },
        setEnabled(enabled: boolean) {
            Object.values(deps.buttons).forEach((button) => {
                if (button) button.disabled = !enabled;
            });
        },
    };
}
```

```ts
// frontend/src/ui/pageNavigation.ts
export function syncActivePageNav(page: string): void {
    document.querySelectorAll<HTMLElement>('.sidebar .nav-item[data-page]').forEach((el) => {
        el.classList.toggle('active', el.dataset.page === page);
    });
}
```

Use this step to remove the last obvious page-local reimplementation of:

- chip rendering conventions
- empty-state visibility toggles
- repeated export enable/disable wiring
- repeated nav active-state updates

- [ ] **Step 4: Tighten architecture validation**

Extend `scripts/check-frontend-architecture.mjs` with rules that block:

- new direct `fetch(...)` outside `services/api/*`
- new DOM queries inside `services/*`, `store/*`, and `types/*`
- new imports from deprecated or bypassed shell/page wiring surfaces once replacements are live

Representative addition:

```js
if (!isTest && rel.startsWith('frontend/src/app/') && /from\s+['"]\.\.\/pages\/.*Page\.js['"]/.test(text)) {
  add(file, 'app/ must compose feature entrypoints or shared runtimes, not import page internals directly');
}
```

- [ ] **Step 5: Run the full validation path**

Run:

```bash
npm test -- frontend/src/ui/seriesChipList.test.ts frontend/src/ui/emptyState.test.ts frontend/src/app/shell.test.ts frontend/src/app/runtime.test.ts frontend/src/scatter/scatterPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/drift/driftPage.test.ts
npm run validate
```

Expected:

- test suite PASS for the touched surfaces
- `npm run validate` exits `0`

- [ ] **Step 6: Update docs and commit the guardrail wave**

Reflect the final boundary decisions in:

- `ai/frontend/refactor/2026-06-01-frontend-modularization-staged-design.md`
- `ai/README.md`

Then commit:

```bash
git add frontend/src/ui/seriesChipList.ts frontend/src/ui/seriesChipList.test.ts frontend/src/ui/emptyState.ts frontend/src/ui/emptyState.test.ts frontend/src/ui/exportControls.ts frontend/src/ui/pageNavigation.ts scripts/check-frontend-architecture.mjs ai/frontend/refactor/2026-06-01-frontend-modularization-staged-design.md ai/README.md
git commit -m "refactor: enforce modular frontend boundaries"
```

## Execution Notes

- Implement the tasks in order. Later tasks assume the seams created by earlier tasks.
- If a step reveals an unexpectedly large page-specific dependency, extract the smallest stable helper first and rerun the targeted tests before continuing.
- Prefer subagent execution per task. Each task is self-contained enough for a separate worker plus review checkpoint.

## Recommended Verification Order

Run these after every completed task even if the task already includes narrower commands:

```bash
npm run typecheck
node scripts/check-frontend-architecture.mjs
```

Run this after Tasks 3, 5, and 6:

```bash
npm run validate
```
