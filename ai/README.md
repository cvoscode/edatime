# edatime — AI Repository Map

> Data visualization and analysis tool with a Rust backend (Axum + Polars) and TypeScript frontend (vanilla TypeScript + DOM, WebGPU charts via ChartGPU).

## Frontend File Reference

### `frontend/src/features/timeseries/actions.ts` { #fe-timeseries-actions }
Canonical home for Timeseries action wiring — global chart-range reset, filter clear, and dataset-search input initialization. All functions are side-effect-only (DOM + window events) and take dependency hooks rather than importing from appState directly.

**Interface: `TimeseriesActionDeps`**
```ts
interface TimeseriesActionDeps {
    rebuildColumnToggles: () => void;
    renderColumnProfilesGrid: (force?: boolean) => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    registerCleanup: (cleanup: () => void) => void;
}
```

**Functions**

- `initDatasetSearchInputs(deps: Pick<TimeseriesActionDeps, 'rebuildColumnToggles' | 'renderColumnProfilesGrid'>): void` — Wires debounced input listeners for `#column-filter-input` and `#profile-filter-input`, updating store filter text and triggering UI rebuilds.
- `initTimeseriesActions(deps: TimeseriesActionDeps): void` — Wires `edatime:request-chart-range-reset` and `edatime:clear-all-filters` window event listeners; exposes `window.__edatime.resetChartRangeToDataset()` and `window.__edatime.clearAllFilters()`.

<!-- internal deps -->
[appState]: ../frontend/src/store/appStateCompat.md
[store/index]: ../frontend/src/store/index.md

---

### `frontend/src/services/timeseries/filtering.ts` { #fe-timeseries-filtering }
Server-side column range and adaptive line filter helpers. Ensures column range state is populated from data and computes Y-axis interpolation for adaptive line filters.

**Functions**

- `ensureRangeStateFromData(dataObj: DataObject): void` — Inspects `appState.selectedCols`, computes bounds for any column missing a range, and calls `setColumnRanges()`.
- `computeBounds(values: ArrayLike<number>): { min: number; max: number } | null` — Scans a value array (skipping non-finite values) and returns `{ min, max }` or `null`.
- `ensureRangeStateFromDataState(dataObj: DataObject, selectedCols: string[], columnRanges: Record<string, ColumnRange>): Record<string, ColumnRange>` — Pure version used by `ensureRangeStateFromData`; returns updated ranges map.
- `buildAdaptiveLineY(filter: AdaptiveLineFilter, tsMs: number): number | null` — Interpolates Y at `tsMs` along the line defined by filter endpoints `(x1, y1)` → `(x2, y2)` using linear interpolation. Returns `null` if inputs are invalid or divide-by-zero would occur.

<!-- internal deps -->
[appStateCompat]: ../frontend/src/store/appStateCompat.md
[uiState]: ../frontend/src/store/uiState.md

---

### `frontend/src/ui/seriesChipList.ts` { #fe-ui-seriesChipList }
Shared SeriesChip list orchestration — rendering a list of chips into a container, keyboard activation (Enter/Space → toggle checkbox), post-creation class/attribute wiring, and color update plumbing. Does NOT own data fetching or domain logic.

**Interfaces**

```ts
interface SeriesChipListItem {
    column: string;
    label?: string;
    checked: boolean;
    color: string;
    disabled?: boolean;
    adaptiveTarget?: boolean;
    title?: string;
    onToggle: (checked: boolean, column: string) => void;
    onColorInput?: (color: string, column: string) => void;
    onMenuClick?: (column: string) => void;
    menuLabel?: string;
}

interface SeriesChipListOptions {
    container: HTMLElement;
    items: SeriesChipListItem[];
    chipClass?: string;
    onColorUpdate?: (column: string, color: string) => void;
    postChipAttributes?: Record<string, string>;
    postChipClass?: (item: SeriesChipListItem) => string;
}
```

**Functions**

- `renderSeriesChipList(options: SeriesChipListOptions): void` — Full DOM replace of `container` contents with `SeriesChip` items; adds `chipClass`, wires keyboard listener (Enter/Space), stores cleanup on `container.__chipKeyboardCleanup`.
- `updateSeriesChipList(options: SeriesChipListOptions): void` — Incremental upsert of chips using `data-col` attribute matching; removes stale chips, creates missing ones. Skips DOM rebuild for existing chips, updating only checked/color state.

<!-- internal deps -->
[SeriesChip]: ../frontend/src/ui/composites/SeriesChip.md

---

### `frontend/src/utils/bindExportButtons.ts` { #fe-utils-bindExportButtons }
Declarative wiring for PNG / SVG / HTML / CSV export buttons. Replaces repeated `document.getElementById(...).addEventListener(...)` boilerplate across fftPage, heatmapPage, and spectrogramPage.

**Interfaces**

```ts
interface ExportButtonConfig {
    png: { fn: (...args: string[]) => void; filename: string };
    svg: { fn: (...args: string[]) => void; filename: string };
    html: { fn: (...args: string[]) => void; filename: string };
    csv?: { fn: (filename: string) => void; filename: string; dataCheck?: () => boolean };
}
```

**Functions**

- `bindExportButtons(prefix: string, config: ExportButtonConfig): void` — Wires `#${prefix}-export-png-btn`, `#${prefix}-export-svg-btn`, `#${prefix}-export-html-btn`, and optionally `#${prefix}-export-csv-btn`. CSV button checks `dataCheck()` before calling `fn` and shows a warning toast if falsy.
- `bindOne(id: string, handler: () => void): void` — Internal helper; does `document.getElementById(id)?.addEventListener('click', handler)`.

<!-- internal deps -->
[toast]: ../frontend/src/utils/toast.md

---

### `frontend/src/pages/shared/analysisPageRuntime.ts` { #fe-pages-shared-analysisPageRuntime }
Shared page runtime factory for FFT, heatmap, and spectrogram pages — provides empty-state controller management and declarative export-button wiring via `bindExportButtons`. Uses `createPageLifecycle` for init/visible/every-page-change hooks.

**Interfaces**


```ts
interface ExportConfig {
    key: string;
    png: { fn: (...args: string[]) => void; filename: string };
    svg: { fn: (...args: string[]) => void; filename: string };
    html: { fn: (...args: string[]) => void; filename: string };
    csv?: { fn: (filename: string) => void; filename: string; dataCheck?: () => boolean };
}

interface AnalysisPageRuntimeOptions {
    page: string;
    emptyStateRootId: string;
    exportConfig?: ExportConfig;
    init?: () => void | (() => void);
    onVisible?: () => void;
    onEveryPageChange?: () => void;
}
```

**Functions**

- `createAnalysisPageRuntime(options: AnalysisPageRuntimeOptions)` — Returns a `{ mount() }` object that calls `createPageLifecycle` with the provided `page` name, wiring `bindExportButtons` in `init` if supplied. Lazily creates `EmptyStateController` via `getEmptyState()`.

**Returned object shape**
```ts
{
    mount(): ReturnType<typeof createPageLifecycle>;
    updateEmptyState(vm: EmptyStateViewModel): void;  // on the returned object
}
```

<!-- internal deps -->
[pageLifecycle]: ../frontend/src/app/pageLifecycle.md
[EmptyStateController]: ../frontend/src/ui/emptyState.md
[bindExportButtons]: ../frontend/src/utils/bindExportButtons.md

---

### `frontend/src/pages/spectrogramPage.ts` { #fe-pages-spectrogram }
Spectrogram page — STFT heatmap visualization using ECharts. Refactored to use the `createAnalysisPageRuntime` pattern for shared page lifecycle, empty-state management, and export-button wiring. Column selection drives `fetchSpectrogram` API calls; drag-to-zoom and resize observer are wired on the chart container.

**State (module-level)**
```ts
let spectrogramChart: any;
let spectrogramResizeObserver: ResizeObserver;
let spectrogramResult: SpectrogramResult | null;
let spectrogramRuntime: ReturnType<typeof createAnalysisPageRuntime>;
```

**Functions**

- `initSpectrogramPage(deps: SpectrogramPageDeps): Promise<void>` — Bootstrap: selects DOM elements, creates `createAnalysisPageRuntime({ page: 'spectelegram', emptyStateRootId: 'spectrogram-empty-state', exportConfig: { key: 'spectrogram', png, svg, html }})`, wires compute button (calls `fetchSpectrogram`), log-scale toggle, zoom-reset button, and `onVisible` resize handler.
- `syncSpectrogramEmptyState(message?: string): void` — Updates the empty-state controller visibility based on `spectrogramResult`.
- `formatSpectrogramTime(timestampMs: number): string` — `toLocaleString` formatter for axis labels.
- `formatSpectrogramFrequency(frequency: number): string` — Converts Hz/kHz/mHz with fixed decimals.

**Internal helpers**

- `ensureSpectrogramChartDimensions()` — Sets `minHeight` / `height` if chart has zero dimensions.
- `isSpectrogramChartReadyForInit()` — Guards chart init until `clientWidth/clientHeight > 0` AND page is not hidden.
- `waitForSpectrogramChartReady(attempts?: number): Promise<boolean>` — Polls up to `attempts` ticks.
- `ensureSpectrogramChart(): Promise<any>` — Lazily initializes ECharts instance with ResizeObserver, drag-selection box, and pointer event handlers for drag-to-zoom.
- `renderSpectrogramChart(): Promise<void>` — Builds heatmap points array, configures ECharts `xAxis`/`yAxis`/`visualMap`/`dataZoom`. No longer writes status text (status UI removed).

<!-- internal deps -->
[fetchSpectrogram]: ../frontend/src/services/api/index.md
[appStateCompat]: ../frontend/src/store/appStateCompat.md
[chartExport]: ../frontend/src/utils/chartExport.md
[createAnalysisPageRuntime]: ../frontend/src/pages/shared/analysisPageRuntime.md

---

## Project Structure

> Last reconciled: 2026-07-16. Several old subtrees documented in the AI folder are no longer present in the repo. See `ai/frontend/refactor/2026-06-01-frontend-modularization-staged-plan.md` for the migration context.

```
edatime/
├── crates/
│   ├── edatime-core/      # Pure types, pipeline IR, config, error
│   ├── edatime-store/     # Data repository, state, storage adapters, artifacts, jobs, dataset versions
│   ├── edatime-query/     # LazyFrame query engine, aggregations, downsampling, cleaning, derived
│   ├── edatime-ingest/    # Data ingestion, CSV/Parquet loading
│   ├── edatime-service/   # Axum HTTP handlers, routing, analytics, causal, cleaning, scatter
│   └── edatime-bin/       # Main binary entry point (re-export of root src/)
└── frontend/src/
    ├── app.ts             # Main bootstrapping
    ├── app/               # App-level helpers (pageLifecycle, pageRegistry, runtime, shell, bootState, navigation)
    ├── chart/             # DataChart (ChartGPU WebGPU) + tick helpers
    ├── charts/            # Chart registry (ChartGPU line chart + Canvas fallback)
    ├── store/             # Flat pub/sub store (chartState, uiState, datasetState, analyticsState, scatterState, runtimeState, events)
    ├── services/api/      # HTTP client barrel + endpoint modules + contract tests
    ├── features/          # Feature-scoped entrypoints (timeseries, fft, heatmap, scatter, spectrogram, causal, drift, upload, home)
    ├── cleaning/          # Cleaning-plan UI (api, panel, store, compiler, codegen, types, dataset identity, plan hash, resample, pipeline graph, compatibility)
    ├── contracts/         # Canonical contract registry (api/v1 routes.ts + workspace contracts.ts)
    ├── workspace/         # Workspace-level store + tests
    ├── platform/          # Platform / environment helpers
    ├── ui/                # Shared UI surface — primitives (Button, Chip, ColorInput, …) and composites (SeriesChip, RangeControls, …)
    ├── types/             # TypeScript interfaces (api, scatter, store, analytics, chart, assets.d)
    └── utils/             # Helpers (chartExport, bindExportButtons, toast, router, etc.)
```

> Note: the legacy `frontend/src/state.ts`, `frontend/src/components/`, `frontend/src/pages/`, `frontend/src/bootstrap/`, `frontend/src/scatter/`, `frontend/src/causal/`, `frontend/src/drift/`, `frontend/src/services/timeseries/`, `frontend/src/services/profile/`, `frontend/src/services/chart/`, and `frontend/src/legacy/` folders have been removed in favor of the `features/*` + `store/*` layout. Many AI docs under `ai/frontend/src/{pages,scatter,causal,drift,bootstrap,legacy}` and `ai/frontend/src/store/{index,appStateCompat}.md` are stale and need to be regenerated.

## Backend Tech Stack
- **Runtime:** tokio async runtime
- **HTTP:** Axum + tower-http (CORS, compression, tracing)
- **Data:** Polars DataFrame/LazyFrame
- **Rate limiting:** Token-bucket per IP (plus per-job registry for cleaning/profile/correlation jobs)
- **Cleaning pipeline:** PCMCI causal + cleaning-plan IR (`edatime-query::cleaning`, `edatime-query::derived`) + persistent artifact store (`edatime-store::artifacts`) + dataset-version registry (`edatime-store::versions`)

## Frontend Tech Stack
- **Framework:** Vanilla TypeScript + DOM (no Solid.js or other UI framework)
- **Build:** Vite
- **Charts:** WebGPU via ChartGPU library, ECharts fallback, Canvas 2D fallback chart
- **State:** Flat pub/sub store under `store/` (sub-states: `chartState`, `uiState`, `datasetState`, `analyticsState`, `scatterState`, `runtimeState`, plus `events`). The earlier composite `appState` Proxy at `store/index.ts` was retired in favor of direct sub-state imports.

## Planning Notes

- `ai/frontend/refactor/2026-05-30-broad-frontend-consolidation.md` — approved target architecture and migration status for the broad frontend consolidation and legacy archive refactor.
- `ai/frontend/refactor/2026-05-30-frontend-canonicalization-plan.md` — supersede-d by the actual `/api/v1` canonical cutover; all listed contract URLs in this plan are out of date.
- `ai/frontend/refactor/2026-06-01-frontend-modularization-staged-{design,plan}.md` — implemented in spirit; the actual file layout lives under `frontend/src/features/*` rather than the paths named in the plan.
- `ai/frontend/refactor/2026-06-01-timeseries-ownership-and-shared-shell-{design,plan}.md` — timeseries ownership now lives under `frontend/src/features/timeseries/{lifecycle,controller,module,...}.ts`. The shared analysis runtime the plan referenced (`frontend/src/pages/shared/analysisPageRuntime.ts`) was retired.

## Key Architecture Notes

- **`frontend/src/ui/`** is the canonical shared component surface. `primitives/` holds basic building blocks (Button, Chip, ColorInput, IconButton, Select, TextInput). `composites/` holds domain-aware components (SeriesChip, RangeControls, ColumnSelector, etc.).
- **`frontend/src/contracts/api/v1/routes.ts`** is the canonical TypeScript registry of every URL the frontend targets. New endpoints must be added here before the corresponding frontend caller.
- **`frontend/src/store/`** holds flat pub/sub sub-states; new state should be added as a focused module (e.g. `xxxState.ts`) and emitted through `events.ts`. The deprecated `appState` Proxy / `appStateCompat` shim are gone — do not reintroduce them.
- **`frontend/src/app/pageLifecycle.ts`** provides shared page lifecycle wiring (one-time init, page-change listeners, onVisible hooks) used by feature pages.
- **`frontend/src/ui/seriesChipList.ts`** provides shared SeriesChip list orchestration (rendering, keyboard activation, color update plumbing).
- **`frontend/src/utils/bindExportButtons.ts`** provides declarative PNG/SVG/HTML/CSV button wiring used by feature pages.
- **API base path is `/api/v1`** (single canonical mount in `src/main.rs` and `crates/edatime-bin/src/main.rs`). There is no `/api` alias; do not introduce one.

## Key Entry Points
- Backend binary: `crates/edatime-bin/src/main.rs`
- Backend router: `crates/edatime-service/src/handlers/routes/mod.rs`
- Frontend app: `frontend/src/app.ts`
- Frontend store: `frontend/src/store/index.ts`
- API client: `frontend/src/services/api/index.ts`
