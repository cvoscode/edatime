# Frontend Architecture Refactor Plan

**Date**: 2026-05-20  
**Stack**: SolidJS + TypeScript + ChartGPU + Vite  
**Status**: Planned

---

## Table of Contents

1. [Current Architecture Assessment](#1-current-architecture-assessment)
2. [Refactor Goals](#2-refactor-goals)
3. [Proposed Frontend Architecture](#3-proposed-frontend-architecture)
4. [Component & UI Refactor Strategy](#4-component--ui-refactor-strategy)
5. [SolidJS Reactive Architecture](#5-solidjs-reactive-architecture)
6. [ChartGPU Integration Architecture](#6-chartgpu-integration-architecture)
7. [State Management Architecture](#7-state-management-architecture)
8. [Data Fetching & Async Flows](#8-data-fetching--async-flows)
9. [Performance Optimization Plan](#9-performance-optimization-plan)
10. [Developer Experience Improvements](#10-developer-experience-improvements)
11. [Testing Strategy](#11-testing-strategy)
12. [Migration & Incremental Refactor Plan](#12-migration--incremental-refactor-plan)
13. [Patterns, Anti-Patterns & Code Smells Reference](#13-patterns-anti-patterns--code-smells-reference)
14. [Deliverables](#14-deliverables)

---

## 1. Current Architecture Assessment

### 1.1 Store Proliferation (High Severity)

**9 store modules** in `stores/`:
- `analyticsStore.ts` — rolling bands, anomaly detection, correlations
- `fftStore.ts` — FFT-specific state
- `chartStore.ts` — viewport, zoom history, annotations, drawings
- `causalStore.ts` — causal analysis state
- `scatterStore.ts` — scatter config, points, color/size arrays
- `uiStore.ts` — theme, sidebar, toasts, filters, adaptive filters, colors
- `datasetStore.ts` — metadata, columns, revision
- `uploadStore.ts` — upload progress
- `sessionStore.ts`

**Problems**:
- `analyticsStore` duplicates state held in `domain/timeseries/store.ts` (rollingBands, anomalyRegions, correlations)
- `chartStore` viewport is mirrored in `domain/timeseries/store.ts` — two sources of truth
- `scatterStore` has raw arrays (`scatterPoints: [number, number][]`, `colorValues: number[]`) AND domain-wrapped duplicates in `domain/scatter/store.ts`
- `uiStore` conflates presentation state (theme, sidebar, toasts) with domain filters (columnFilters, adaptiveLineFilters) and per-series color customization
- Page components import from multiple stores simultaneously — unclear ownership
- 9 stores is excessive for a mid-sized app

### 1.2 God Components (High Severity)

#### `TimeseriesPage.tsx` (~450 lines)
- Owns **20+ local signals**: drawTool, drawColor, drawWidth, showAnalytics, showLabelsDrawer, chartTitle, xAxisLabel, yAxisLabel, chartEngine, filterModalOpen, filterModalColumn, isLoading, isDownsampled, showSkeleton, colorColumn, showAdaptivePopup, adaptiveFilterPoints, updateChartFn, chartReady, chartInstanceRef, lastContextMenuTime, fetchInProgress
- Manages debounce timers directly (`viewportDebounceTimer`)
- Directly imports `chartStore`, `datasetStore`, `uiStore`, `analyticsStore`
- Directly calls `fetchTimeseriesData`, `buildSeriesConfig`, `fetchRollingBands`, `fetchAnomalies`
- Implements zoom/pan, Ctrl+click adaptive filter, drawing tools, export handlers
- Renders: ChartView, SeriesToolbar, ChartToolbar, ColumnFilterModal, AnalyticsDrawer, LabelsDrawer, AdaptiveFilterPopup

**Smell**: Data fetching, UI state, chart orchestration, and interaction logic all mixed in one file.

#### `ChartView.tsx` (~350+ lines)
- Handles chart lifecycle (useChartEngine, useChartViewport)
- Manages drag state, theme version
- Handles updateChart with visibility filtering, y-range computation, drawing overlays
- Manages keyboard shortcuts, resize observer, animation loop
- Renders CanvasOverlay for drawings/overlays

**Smell**: ChartView is a "chart god" — engine + viewport + overlays + drag + keyboard + resize all in one component.

### 1.3 Chart Lifecycle Fragmentation (Medium-High Severity)

Chart responsibilities are split across:
- `useChartEngine.ts` — engine init, instance management, resize/dispose
- `useChartController.ts` — separate controller (conflated with engine)
- `useChartViewport.ts` — zoom/pan state machine inside `components/chart/`
- `ChartView.tsx` — combines engine + viewport + drag + overlays + keyboard
- `ChartAdapter.ts` interface exists, but `chartEngine.ts` and `ChartGPUAdapter.ts` are not cleanly isolated — ECharts and ChartGPU are mixed at the implementation layer

### 1.4 Hook Layer Confusion (Medium Severity)

- `useTimeseriesData` and `useFilterPipeline` have overlapping concerns
- `useChartEngine` and `useChartController` naming doesn't clarify lifecycle vs operations ownership
- `useOverlayController` referenced in comments but missing from `hooks/`
- `dataFetch.ts` imports stores directly — breaking inversion of control

### 1.5 Service Layer Impurity (Medium Severity)

- `services/api.ts` mixes request deduplication with typed endpoint functions and API types (ColumnMetadata, TimeRange, ColumnProfile, DatasetMetadata)
- `services/dataFetch.ts` mixes data loading, caching, column filtering, and color analysis — has its own `TimeseriesCache` class AND imports `uiStore` and `chartStore` directly
- `transformers/timeseries.ts` and `transformers/scatter.ts` are incomplete stubs (noted in prior plan but never completed)
- Services are NOT purely async — `dataFetch.ts` imports stores

### 1.6 Domain Module Inconsistency (Medium Severity)

- `domain/timeseries/store.ts` exists, mirrors `chartStore` for viewport, adds timeseries state, but also has separate UI signals exported at module level (drawTool, drawColor, etc.)
- `domain/scatter/store.ts` is a thin wrapper around `stores/scatterStore.ts` — no actual state lives in domain/scatter
- `domain/timeseries/components/` has TimeseriesChart, SeriesSelector, ColumnChips, AdaptiveFilterPopup, AnalyticsDrawer, LabelsDrawer, ColumnFilterModal, TimeseriesToolbar — some are domain-specific, but ColumnChips could be a primitive
- No domain/fft, domain/drift, domain/causal modules despite stores for them

### 1.7 Type System Issues (Medium Severity)

- `types/domains.ts` defines discriminated union types but they aren't used consistently
- `types/index.ts` re-exports from domains, creating two type namespaces that can desync
- `domain/timeseries/types.ts` defines `TimeseriesState`, `ZoomHistory`, `Drawing` overlapping with `types/domains.ts` and `stores/chartStore.ts`
- `AdaptiveLineFilter` defined in `types.ts`, `types/domains.ts`, and imported differently across files

### 1.8 Reactive Pattern Issues (Medium Severity)

- `TimeseriesPage` had module-level mutable variables (`chartUpdateFn`, `chartReady`, `chartInstanceRef`) that bypassed reactivity (partially fixed in TimeseriesChart but still present in TimeseriesPage)
- `createEffect` in TimeseriesPage directly mutates `chartInstanceRef = ...` instead of using signals for chart instance
- Multiple `createMemo` chains with overlapping derived values (e.g., `numericCols`, `datetimeCols`, `allTraceColumns`, `traceColumns` all derived from `datasetStore.state`)

### 1.9 Data Flow Smells (Medium Severity)

- `TimeseriesPage` has `fetchAndRender` that directly updates the chart via `updateChartFn()` callback — no clear separation between data fetching and chart updating
- `scatterStore` holds raw arrays that page components mutate directly
- Page components directly call store methods instead of going through domain hooks
- `useFilterPipeline` is defined but not used consistently in TimeseriesPage

### 1.10 Anti-Patterns Found

| Smell | Location | Description |
|-------|----------|-------------|
| God component | TimeseriesPage.tsx | 450 lines, too many concerns |
| God component | ChartView.tsx | 350+ lines, chart lifecycle over-collection |
| Global state sprawl | stores/ (9 stores) | Unclear ownership, duplicated state |
| Effect bypass | TimeseriesPage | Module-level mutable vars before fix |
| Store duplication | analyticsStore ↔ domain/timeseries/store | Rolling/anomaly state in both |
| Viewport duplication | chartStore ↔ domain/timeseries/store | Viewport in both |
| Mixed services | dataFetch.ts | Data fetching + caching + filtering + color analysis |
| Hook confusion | useTimeseriesData + useFilterPipeline | Overlapping responsibilities |
| Type duplication | 3 namespaces: types/, types/domains.ts, domain/*/types.ts | Three type namespaces |
| Incomplete abstraction | ChartAdapter exists but ECharts/ChartGPU mixed | Adapter not fully isolating engine |
| Service impurity | dataFetch.ts imports stores | Breaks dependency inversion |

---

## 2. Refactor Goals

### 2.1 Modular Feature Isolation
Each analytics domain (timeseries, scatter, fft, drift, causal) is a self-contained module with its own types, state, hooks, and components. No cross-domain imports except through a shared kernel.

### 2.2 Reusable Abstractions
- UI primitives in `components/ui/` (no domain logic)
- Chart infrastructure in `components/chart/` (ChartAdapter interface)
- Service layer with pure async functions (no SolidJS imports)
- Shared hooks for common patterns

### 2.3 Predictable Reactive Data Flow
```
User Action → Page (thin) → Domain Store → Service (pure async) → API
```
Derived state via memos, not redundant stores.

### 2.4 Minimal Re-rendering
Fine-grained signals, memoized derived values, lazy loading, virtualized lists.

### 2.5 Scalable Chart Architecture
```
DomainChart → ChartAdapter → ChartGPUAdapter / EChartsAdapter
```
ViewportManager as a state machine, not scattered across components.

### 2.6 Simplified Debugging
Centralized state ownership, pure service functions testable without SolidJS runtime.

### 2.7 Strict Typing Boundaries
- `domain/*/types.ts` = domain types only
- `services/api/types.ts` = API contract types
- `types/` = shared primitives (viewport, filters)

### 2.8 Maintainable Async Workflows
Request deduplication, cancellation via AbortController, retry/backoff. No fetch logic in UI components.

### 2.9 Extensible Plugin Systems
Chart adapter pattern for engine swapping, export service architecture, theme system with CSS custom properties.

### 2.10 Improved Onboarding
Consistent file organization, architectural linting rules, clear ownership.

---

## 3. Proposed Frontend Architecture

### 3.1 Directory Structure

```
frontend/src/
├── app/                          # App bootstrap only
│   ├── App.tsx                   # Root component with router + ErrorBoundary
│   ├── Startup.tsx               # Initial metadata load sequence
│   └── ErrorBoundary.tsx
│
├── pages/                        # Route-level page components (THIN — ~60 lines each)
│   ├── TimeseriesPage.tsx
│   ├── ScatterPage.tsx
│   ├── FftPage.tsx
│   ├── DriftPage.tsx
│   ├── CausalPage.tsx
│   ├── HeatmapPage.tsx
│   ├── UploadPage.tsx
│   ├── SettingsPage.tsx
│   └── HomePage.tsx
│
├── domain/                       # Feature-modular isolation
│   ├── timeseries/
│   │   ├── types.ts              # TimeseriesState, TimeseriesConfig, ChartCallbacks
│   │   ├── store.ts              # Domain store (signals + createStore for complex)
│   │   ├── hooks.ts              # useTimeseriesData, useTimeseriesViewport
│   │   └── components/
│   │       ├── TimeseriesChart.tsx
│   │       ├── SeriesSelector.tsx
│   │       ├── AdaptiveFilterPanel.tsx
│   │       ├── AnalyticsDrawer.tsx
│   │       ├── LabelsDrawer.tsx
│   │       ├── ColumnFilterModal.tsx
│   │       └── TimeseriesToolbar.tsx
│   ├── scatter/
│   │   ├── types.ts
│   │   ├── store.ts              # Only scatter state (no duplicate arrays)
│   │   ├── hooks.ts              # useScatterData, useScatterCorrelations
│   │   └── components/
│   │       ├── ScatterChart.tsx
│   │       ├── CorrelationMatrix.tsx
│   │       ├── DistributionCards.tsx
│   │       ├── ColorLegend.tsx
│   │       └── ColumnSelectors.tsx
│   ├── fft/
│   │   ├── types.ts
│   │   ├── store.ts
│   │   ├── hooks.ts
│   │   └── components/
│   ├── drift/
│   ├── causal/
│   └── upload/
│       ├── types.ts
│       ├── store.ts
│       ├── hooks.ts
│       └── components/
│
├── stores/                       # App-wide state (3 stores max)
│   ├── uiStore.ts               # Theme, sidebar, toasts ONLY
│   ├── datasetStore.ts          # Metadata, revision tracking ONLY
│   └── index.ts
│
├── services/                     # Pure async (NO SolidJS imports)
│   ├── api/
│   │   ├── client.ts            # Base fetch with deduplication
│   │   ├── endpoints.ts         # Typed endpoint functions
│   │   └── types.ts             # API request/response types
│   ├── dataTransformers/
│   │   ├── timeseries.ts        # Arrow → chart-ready series config
│   │   ├── scatter.ts           # Scatter JSON → chart-ready config
│   │   ├── fft.ts
│   │   └── index.ts
│   ├── cache/
│   │   ├── timeseriesCache.ts
│   │   └── scatterCache.ts
│   └── export/
│       ├── chartExporter.ts
│       └── dataExporter.ts
│
├── components/
│   ├── ui/                      # Primitives ONLY
│   │   ├── Button.tsx
│   │   ├── Chip.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Dropdown.tsx
│   │   ├── RangeSlider.tsx
│   │   ├── LoadingOverlay.tsx
│   │   ├── Tooltip.tsx
│   │   ├── Select.tsx
│   │   ├── Tabs.tsx
│   │   ├── Badge.tsx
│   │   ├── SwitchToggle.tsx
│   │   ├── IconButton.tsx
│   │   ├── Skeleton.tsx
│   │   ├── Toast.tsx
│   │   └── index.ts
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── PageContainer.tsx
│   │   └── Toolbar.tsx
│   └── chart/                   # Chart infrastructure ONLY (no domain logic)
│       ├── ChartAdapter.ts
│       ├── ChartGPUAdapter.ts
│       ├── EChartsAdapter.ts
│       ├── ChartRegistry.ts
│       ├── ViewportManager.ts
│       ├── OverlayRenderer.tsx
│       ├── CanvasOverlay.tsx
│       └── useChartViewport.ts
│
├── hooks/                        # Shared reactive primitives
│   ├── useChartEngine.ts
│   ├── useChartController.ts
│   ├── useViewportSync.ts
│   ├── useAbortController.ts
│   ├── useDebouncedEffect.ts
│   ├── usePageShortcuts.ts
│   └── index.ts
│
├── utils/
│   ├── colorScale.ts
│   ├── plotTemplate.ts
│   ├── formatUtils.ts
│   ├── csvGenerators.ts
│   └── debug.ts
│
├── types/
│   ├── domains.ts               # Shared discriminated unions
│   └── index.ts
│
└── styles/
    ├── tokens.css               # CSS custom properties
    └── global.css
```

### 3.2 Ownership Rules

| Layer | Owner | Rules |
|-------|-------|-------|
| `app/` | Core team | Bootstrap only, no feature logic |
| `pages/` | Any dev | Thin, delegate to domain, ~60 lines max |
| `domain/*/` | Feature dev | Owns all state, hooks, components for that domain |
| `stores/` | Core team | App-wide, 3 stores max (ui, dataset, index) |
| `services/` | Core team | Pure async, no SolidJS |
| `components/ui/` | UI lib owner | Primitives only, no domain knowledge |
| `components/chart/` | Visualization owner | Chart infrastructure only |
| `components/layout/` | UI lib owner | Layout patterns |
| `hooks/` | Core team | Cross-cutting reactive logic |
| `types/` | Core team | Shared types, no domain-specific types |

### 3.3 Dependency Direction

```
pages → domain/*/components → domain/*/store → services/api
         ↓
    components/chart → services/export
         ↓
    components/ui (primitives)
         ↓
    stores/ (uiStore, datasetStore only)
```

Pages NEVER import from stores directly (except uiStore/datasetStore). Pages use domain components and domain hooks.

### 3.4 Anti-Patterns to Avoid

1. **God components**: Pages must stay thin (~60 lines). No page should exceed 100 lines.
2. **Store sprawl**: No more than 3 app-level stores. Domain state lives in domain stores.
3. **Service impurity**: Services must not import from stores or hooks.
4. **Chart lifecycle coupling**: ChartView should not own viewport + overlays + drag + keyboard in one file.
5. **Type duplication**: Each type lives in exactly one place.
6. **Abstraction pyramids**: Prefer shallow hierarchies over deep ones (max 3 levels).
7. **Cross-domain imports**: Domain modules do not import each other.
8. **Mutable module-level state**: Use signals, not module-level `let` variables.

---

## 4. Component & UI Refactor Strategy

### 4.1 Page Components → Thin Orchestrators

Each page component:
- Renders layout and domain components
- Reads domain store state via hooks
- Dispatches user actions to domain store
- No direct store imports (use domain hooks instead)
- No data fetching (use domain hooks)
- No chart manipulation (use domain components)

```typescript
// GOOD
const TimeseriesPage: Component = () => {
  const { state, actions } = useTimeseriesDomain();

  return (
    <div class={styles.page}>
      <TimeseriesToolbar {...state.toolbar} onAction={actions.handleToolbarAction} />
      <TimeseriesChart
        viewport={state.viewport}
        series={state.visibleSeries}
        onZoom={actions.handleZoom}
      />
      <SeriesSelector
        columns={state.allColumns}
        selected={state.selectedColumns}
        colors={state.seriesColors}
        onSelect={actions.handleColumnSelect}
        onColorChange={actions.handleColorChange}
      />
    </div>
  );
};

// BAD (current state)
const TimeseriesPage = () => {
  // 450 lines of signals, fetch logic, chart manipulation, event handlers
};
```

### 4.2 Domain Components Own Domain Logic

- `TimeseriesChart` owns chart-domain interaction (zoom, click, adaptive filter triggers)
- `SeriesSelector` owns series selection, color picking, adaptive targeting
- `AnalyticsDrawer` owns rolling + anomaly configuration

### 4.3 UI Primitives Are Dumb

`components/ui/` contains: Button, Chip, Input, Modal, Dropdown, RangeSlider, LoadingOverlay, Tooltip, Select, Tabs, Badge, SwitchToggle, IconButton, Skeleton, Toast.

**Rules**:
- No domain types as props (use primitives: string, number, boolean)
- No store imports
- Styling via CSS classes + CSS custom properties
- Generic enough to be reusable across all domains

### 4.4 Headless / Compound Component Patterns

For complex UI (e.g., ColumnChips):

```typescript
// Compound: ColumnChips wraps Chip + color picker + adaptive target
// Hook: useColumnChipBehavior for logic
function useColumnChipBehavior(column: string) {
  return { isSelected, toggle, setColor };
}
```

### 4.5 Layout Components

- `AppShell.tsx`: Header + sidebar + content
- `PageContainer.tsx`: Consistent page padding
- `Toolbar.tsx`: Shared toolbar slot with consistent actions

### 4.6 Component Design Rules

1. Props interface should be explicit and typed
2. No spreading `...props` to pass through — explicit prop names
3. Components own their local UI state; domain state lives in stores
4. Prefer composition over prop drilling (use slots/children)
5. Loading states managed via domain hooks, not local signals in pages

### 4.7 UI Anti-Patterns to Avoid

| Anti-Pattern | Manifestation | Solution |
|---|---|---|
| God components | TimeseriesPage 450 lines | Extract domain components |
| Prop drilling | Many levels of passing `onAction` | Use context or domain hooks |
| Stateful presentation | Page components with createSignal for domain state | Use domain store |
| Duplicated interaction | Same zoom/pan code in multiple pages | Extract to chart components |
| Styling fragmentation | Inline styles, !important scattered | CSS custom properties + class names |
| Unclear ownership | Which component handles Ctrl+click? | Domain component owns interaction |

---

## 5. SolidJS Reactive Architecture

### 5.1 Primitive Selection Guide

| Primitive | Use When | Avoid When |
|---|---|---|
| `createSignal` | Simple scalar value, local ephemeral state | Complex nested state |
| `createStore` | Complex nested state (benefits from path syntax) | Simple values |
| `createMemo` | Derived computation from other signals/stores | Side effects |
| `createResource` | Async data fetching with loading/error state | Synchronous data |
| `createEffect` | Syncing external systems (DOM, subscriptions) | Computing derived values |
| `createContext` | Dependency injection (theme, router) | Transporting frequently-changing data |

### 5.2 Signals vs Stores

**Signals** (simpler, fine-grained):
- `drawTool`, `drawColor`, `isLoading`, `chartEngine`
- `filterModalOpen`, `colorColumn`

**Stores** (nested, structured):
- `TimeseriesState` with viewport, seriesVisibility, drawings sub-objects
- `ScatterState` with config nested object
- `DatasetState` with metadata, columns

### 5.3 Derived State Patterns

```typescript
// GOOD: createMemo for derived state
const visibleSeries = createMemo(() =>
  state.selectedColumns.filter(c => !state.hiddenColumns.includes(c))
);

// BAD: createEffect for derived state
createEffect(() => {
  const derived = computeSomething(state.a, state.b);
  store.setDerived(derived);
});
```

### 5.4 Reactive Anti-Patterns

| Anti-Pattern | Code | Problem | Fix |
|---|---|---|---|
| Effect-driven state | `createEffect(() => { store.x = computed(); })` | Indirect mutation | `createMemo` |
| Nested reactive traps | `createEffect(() => { createEffect(() => {...}) })` | Memory leaks | Flatten, `createRoot` |
| Broad store dependencies | `createEffect(() => { console.log(store.state); })` | Re-runs on any change | Select specific paths |
| Accidental subscriptions | `const x = store.state.a.b.c` outside memo | Keeps subscriber alive | Use accessor `() => store.state.a.b.c` |
| Mutable shared state | `let chartInstance = null` | Bypasses reactivity | Use signal |
| Derived state duplication | Same computation in two memos | Inconsistent | Extract to single memo |

---

## 6. ChartGPU Integration Architecture

### 6.1 ChartAdapter Interface

```typescript
// components/chart/ChartAdapter.ts
export interface ChartAdapter {
  init(container: HTMLElement, config: ChartConfig): Promise<void>;
  dispose(): void;
  resize(): void;
  updateSeries(series: SeriesConfig[]): void;
  setViewport(xMin: number, xMax: number, yMin?: number, yMax?: number): void;
  addEventHandler(event: ChartEvent, handler: EventHandler): void;
  removeEventHandler(event: ChartEvent, handler: EventHandler): void;
  setOverlays(overlays: OverlayConfig[]): void;
  clearOverlays(): void;
  exportPNG(): Promise<Blob>;
  exportSVG(): Promise<string>;
}

export type ChartEvent = 'zoom' | 'zoomOut' | 'click' | 'ctrlClick' | 'dragStart' | 'dragMove' | 'dragEnd';

export interface SeriesConfig {
  name: string;
  data: [number, number][];
  color: string;
  visible?: boolean;
}
```

### 6.2 Engine Adapters

```typescript
// ChartGPUAdapter — primary engine
export class ChartGPUAdapter implements ChartAdapter { ... }

// EChartsAdapter — fallback
export class EChartsAdapter implements ChartAdapter { ... }
```

### 6.3 ChartRegistry Factory

```typescript
export function createChartAdapter(type: ChartType, options: ChartOptions): ChartAdapter {
  if (type === 'timeseries' && isWebGPUSupported()) {
    return new ChartGPUAdapter(options);
  }
  return new EChartsAdapter(options);
}
```

### 6.4 ViewportManager State Machine

```typescript
// ViewportManager.ts
export interface ViewportState {
  viewport: ChartViewport;
  zoomHistory: ZoomState;
  isAnimating: boolean;
}
// Events: ZOOM_IN, ZOOM_OUT, ZOOM_TO, PAN, RESET
// Actions: update chart adapter, persist to store
```

### 6.5 Chart Lifecycle Responsibility Split

| Responsibility | Component/File |
|---|---|
| Engine init/dispose | `useChartEngine` hook → `ChartAdapter` |
| Viewport state machine | `ViewportManager.ts` → domain store |
| Series data update | `useChartController` hook → `ChartAdapter.updateSeries` |
| Overlay rendering | `OverlayRenderer.tsx` (CanvasOverlay child) |
| Drawing interaction | `CanvasOverlay.tsx` (mouse/touch handlers) |
| Keyboard shortcuts | `usePageShortcuts` hook → dispatches to chart |
| Resize handling | `useChartEngine` via ResizeObserver |

### 6.6 GPU Memory Management
- `dispose()` must be called when chart unmounts
- ResizeObserver must be disconnected on cleanup
- No lingering WebGPU resources after component destroy
- ChartAdapter.dispose() propagates to engine-specific cleanup

### 6.7 Batch Updates

```typescript
let pendingUpdate: SeriesConfig[] | null = null;
let rafId: number | null = null;

function scheduleUpdate(series: SeriesConfig[]) {
  pendingUpdate = series;
  if (rafId === null) {
    rafId = requestAnimationFrame(flushUpdate);
  }
}

function flushUpdate() {
  if (pendingUpdate) {
    gpu.updateSeries(pendingUpdate);
    pendingUpdate = null;
  }
  rafId = null;
}
```

### 6.8 Chart Anti-Patterns

| Anti-Pattern | Manifestation | Fix |
|---|---|---|
| Monolithic chart wrapper | ChartView owns engine + viewport + overlays + drag + keyboard | Split responsibilities |
| Imperative redraw | `chartInstance.update()` without batching | RAF + batch scheduling |
| Leaking GPU resources | No dispose() on unmount | useChartEngine cleanup |
| Unbounded reactive updates | Effect watches entire store | Granular selectors |
| Oversized chart state | ChartStore holds all state including domain | Domain store owns domain state |

---

## 7. State Management Architecture

### 7.1 Target: 3 Stores

```typescript
// stores/uiStore.ts — presentation state only
interface UIState {
  theme: 'dark' | 'light' | 'system';
  colorScale: ColorScaleName;
  sidebarOpen: boolean;
  plotTheme: PlotThemeMode;
  toasts: ToastMessage[];
}
// NO filters, NO series colors, NO adaptive filters — those are domain state

// stores/datasetStore.ts — server metadata only
interface DatasetState {
  metadata: DatasetMetadata | null;
  columns: ColumnProfile[];
  numericCols: string[];
  datetimeCols: string[];
  xAxisColumn: string | null;
  revision: number | null;
}
// NO loading/error — those are ephemeral, use local signals

// Domain stores own all other state:
// domain/timeseries/store.ts → viewport, selectedColumns, seriesVisibility, drawings
// domain/scatter/store.ts → config, points, color/size arrays, correlations
```

### 7.2 State Ownership Rules

1. **No duplicate state**: `analyticsStore.rollingBands` and `domain/timeseries/store.rollingBands` must consolidate to one source
2. **No cross-store mutations**: domain stores don't import from other stores
3. **No store imports in services**: services are pure async
4. **No store imports in UI components**: use domain hooks instead

### 7.3 State Anti-Patterns

| Anti-Pattern | Manifestation | Fix |
|---|---|---|
| Global state sprawl | 9 stores with unclear boundaries | 3 stores + domain stores |
| Duplicated derived state | analyticsStore ↔ domain/scatter store correlations | Single source of truth |
| Context abuse | Giant context provider with all state | Granular contexts |
| Mutation-heavy stores | Direct `store.x = v` outside actions | Action methods only |
| Stateful utilities | Module with `let cache = ...` | Cache class in services/ |

---

## 8. Data Fetching & Async Flows

### 8.1 API Client Architecture

```typescript
// services/api/client.ts — consolidated deduplication
const _inflight = new Map<string, Promise<unknown>>();

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const existing = _inflight.get(url);
  if (existing) return existing as Promise<T>;
  const promise = (async () => {
    const res = await fetch(url, { cache: 'no-store', signal });
    if (!res.ok) throw new Error(`${url} failed (${res.status})`);
    return res.json() as T;
  })();
  _inflight.set(url, promise);
  try { return await promise; }
  finally { _inflight.delete(url); }
}

export async function fetchArrow(url: string, signal?: AbortSignal): Promise<Response> {
  // same deduplication pattern for Arrow IPC
}
```

### 8.2 Data Transformation Pipeline

```typescript
// services/dataTransformers/timeseries.ts — pure, no SolidJS
export function transformArrowToTimeseries(buffer: ArrayBuffer): TimeseriesData {
  const table = tableFromIPC(buffer);
  // ... transform
  return { xValues, series, returnedRows, downsampled };
}

export function buildSeriesConfig(
  xValues: Float64Array,
  series: Record<string, Float64Array>,
  colors: Record<string, string>,
  filters: ColumnFilters,
  colorByColumn: Record<string, Float64Array> | undefined,
  colorColumn: string | null,
  showLines: boolean,
  colorScale: ColorScaleName,
  adaptiveFilters: AdaptiveLineFilter[]
): SeriesConfig[] {
  // ... build chart-ready config
}
```

### 8.3 Async Anti-Patterns

| Anti-Pattern | Manifestation | Fix |
|---|---|---|
| Fetch in UI component | TimeseriesPage calls fetchTimeseriesData directly | Use domain hook |
| Race conditions | No abort on new request | useAbortController |
| Unmanaged subscriptions | createEffect with fetch, no cleanup | onCleanup + abort |
| Duplicated fetch orchestration | dataFetch and api both deduplicate | Single deduplication |
| Stale reactive resources | Resource doesn't cancel on unmount | useResource with signal |

---

## 9. Performance Optimization Plan

### 9.1 SolidJS Rendering Optimization

1. **Fine-grained signals**: Each piece of state as its own signal
2. **Memo boundaries**: createMemo for every derived value
3. **Keyed For**: Always provide `key` prop to `<For>`
4. **Lazy components**: Pages loaded via `lazy(() => import(...))`
5. **Avoid over-subscription**: Don't subscribe to entire stores when only one field needed

### 9.2 ChartGPU Rendering Optimization

1. **RAF batching**: Batch series updates within requestAnimationFrame
2. **Debounced viewport sync**: Debounce zoom/pan to avoid redundant fetches
3. **Streaming**: Use Arrow IPC streaming for large datasets
4. **GPU memory**: Explicit dispose() and cleanup on unmount
5. **Viewport culling**: Only render visible data range

### 9.3 Performance KPIs

| Metric | Target |
|---|---|
| Initial page load | <2s on 3G |
| Chart render (1200 points) | <100ms |
| Zoom interaction | <16ms (60fps) |
| Scatter matrix (20 cols) | <500ms |
| Memory (idle, 1M rows) | <150MB |
| Bundle size (initial) | <200KB gzipped |

### 9.4 Performance Anti-Patterns

| Anti-Pattern | Manifestation | Fix |
|---|---|---|
| Unnecessary reactive subscriptions | createEffect on entire store | Granular selectors |
| Large reactive trees | Deep nested store causing cascade | Flatten state shape |
| Unbounded effects | createEffect without deps | Specify deps |
| Chart rerender storms | Update chart on every filter change | Debounce + batch |

---

## 10. Developer Experience Improvements

### 10.1 TypeScript Strictness

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 10.2 Path Aliases

```json
{
  "@/*": ["src/*"],
  "@domain/*": ["src/domain/*"],
  "@components/*": ["src/components/*"],
  "@services/*": ["src/services/*"],
  "@stores/*": ["src/stores/*"],
  "@hooks/*": ["src/hooks/*"],
  "@utils/*": ["src/utils/*"],
  "@types/*": ["src/types/*"]
}
```

### 10.3 ESLint Rules

```javascript
{
  "rules": {
    "no-restricted-imports": [2, {
      "paths": ["stores"],
      "message": "Use domain hooks instead of direct store imports in pages"
    }],
    "solid/reactivity": ["error", { "memoizeSideEffects": true }]
  }
}
```

---

## 11. Testing Strategy

| Test Type | What to Test | What NOT to Test |
|---|---|---|
| Unit | Service functions, store actions, transformers | UI rendering |
| Component | Props → render output, callbacks | Store internals |
| Integration | Page + domain + service + API | Implementation details |
| E2E | Full user flows | Internal state |

### 11.1 Testing Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Implementation-detail testing | Test store internals, not behavior | Test public API |
| Brittle snapshots | Snapshot breaks on any change | Test behavior, not structure |
| Reactive timing assumptions | `vi.waitFor(() => ...)` flaky | Use `flushPromises` |

---

## 12. Migration & Incremental Refactor Plan

### 12.1 Strategy: Strangler Fig Pattern

Incrementally replace old components with new architecture without a big-bang rewrite.

### 12.2 Phase 1: Foundation (Weeks 1-2)

**Goal**: Establish the new architecture without changing any page behavior.

1. **Extract `services/api/client.ts`** (from `api.ts`)
   - Consolidate request deduplication
   - Pure async, no store imports
   - Re-export from `services/api/endpoints.ts`

2. **Create `services/dataTransformers/`**
   - `timeseries.ts`: Arrow → chart config (working, from dataFetch.ts)
   - `scatter.ts`: JSON → chart config (working)
   - Both pure functions, no SolidJS

3. **Consolidate stores to 3 + domain**
   - `stores/uiStore.ts`: keep only theme, sidebar, toasts
   - `stores/datasetStore.ts`: keep metadata, revision, columns
   - Remove: `analyticsStore`, `fftStore`, `causalStore`
   - Domain state moves to: `domain/timeseries/store.ts`, `domain/scatter/store.ts`

4. **Create `types/domains.ts`** as single source
   - `ChartViewport`, `AdaptiveLineFilter`, `RollingBandData`, `AnomalyRegionData`
   - Remove duplicates from `types.ts` and stores

5. **Set up `styles/tokens.css`** with CSS custom properties

**Verification**: `tsc --noEmit`, existing tests pass, pages work unchanged.

### 12.3 Phase 2: Timeseries Domain (Weeks 3-4)

**Goal**: Refactor TimeseriesPage to use domain architecture.

1. **Migrate `TimeseriesPage` → thin orchestrator** (~60 lines)
2. **Consolidate `TimeseriesChart`** in `domain/timeseries/components/`
3. **Split chart lifecycle**: `ViewportManager`, `OverlayRenderer`, `CanvasOverlay`
4. **Create `domain/timeseries/hooks.ts`**: `useTimeseriesData`, `useTimeseriesViewport`

### 12.4 Phase 3: Scatter Domain (Week 5)

**Goal**: Fix scatter color-by-column bugs with clean architecture.

1. **Consolidate `scatterStore`** → `domain/scatter/store.ts`
2. **Refactor `ScatterPage`** to thin orchestrator
3. **Fix color-by-column rendering**: clear color contract for numeric vs categorical

### 12.5 Phase 4: UI Component Cleanup (Week 6)

1. **Clean `components/ui/`**: Move domain-specific components out
2. **Create `components/layout/`**: AppShell, PageContainer, Toolbar
3. **Remove domain logic from `components/chart/`**

### 12.6 Phase 5: Analytics Domain Isolation (Week 7)

Create `domain/fft/`, `domain/drift/`, `domain/causal/` following the same pattern.

### 12.7 Phase 6: Polish (Week 8)

1. Verify 3-store model
2. Remove dead code
3. Update all imports to new paths

### 12.8 Rollback Strategy

- Each phase independently verifiable
- If regression: revert phase commit, fix before continuing
- Feature flags for large changes
- Parallel-run: old and new side-by-side during transition

---

## 13. Patterns, Anti-Patterns & Code Smells Reference

### 13.1 Recommended Patterns

**Feature Module Architecture**:
```
domain/timeseries/
├── types.ts
├── store.ts
├── hooks.ts
└── components/
```

**Reactive Ownership Boundaries**:
```typescript
const viewport = () => timeseriesStore.state.viewport;
const visibleSeries = createMemo(() =>
  timeseriesStore.state.selectedColumns.filter(notHidden)
);
```

**Selector-Based Subscriptions**:
```typescript
// Good: subscribe to specific path
createEffect(() => chartStore.state.viewport.xMin);
// Bad: subscribe to entire store
createEffect(() => console.log(chartStore.state));
```

**Dependency Inversion**:
```typescript
// Pages don't import stores directly
const TimeseriesPage = () => {
  const { state, actions } = useTimeseriesDomain();
};
```

### 13.2 Anti-Patterns

**God Components**:
```typescript
// BAD
const TimeseriesPage = () => {
  const [state1, setState1] = createSignal(...);
  const [state2, setState2] = createSignal(...);
  // ... fetch logic, chart manipulation, event handlers all here
};

// GOOD
const TimeseriesPage = () => {
  const { state, actions } = useTimeseriesDomain();
  return <TimeseriesChart {...state} onZoom={actions.handleZoom} />;
};
```

**Effect-Driven State**:
```typescript
// BAD
createEffect(() => {
  const derived = computeExpensive(state.a, state.b);
  store.setDerived(derived);
});

// GOOD
const derived = createMemo(() => computeExpensive(state.a, state.b));
```

**Implicit Shared Mutable State**:
```typescript
// BAD: Module-level mutable variable
let chartInstance: any = null;

// GOOD: Signal
const [chartInstance, setChartInstance] = createSignal<any>(null);
```

**Chart Lifecycle Coupling**:
```typescript
// BAD: ChartView owns everything
const ChartView = () => {
  const engine = useChartEngine(...);
  const viewport = useChartViewport(...);
  const drag = createSignal(...);
  // ... everything in one component
};

// GOOD: Split responsibilities
// TimeseriesChart → orchestrator
// ViewportManager → zoom/pan state
// OverlayRenderer → drawings
// CanvasOverlay → drawing interaction
```

**Giant Context Providers**:
```typescript
// BAD
const AppContext = createContext({ store, actions, theme, filters, ... });

// GOOD: Granular contexts
const ThemeContext = createContext<Theme>();
const UIContext = createContext<UIState>();
```

**Reactive Spaghetti**:
```typescript
// BAD
createEffect(() => {
  createEffect(() => { /* nested effect */ });
  someSignal();
});

// GOOD: Flat reactive graph
const derived = createMemo(() => compute(signal1(), signal2()));
createEffect(() => sideEffect(derived()));
```

### 13.3 Code Smells

| Smell | Manifestation | Fix |
|---|---|---|
| Components exceeding ownership scope | TimeseriesPage handles data fetching + chart lifecycle + analytics + drawing | Extract domain components |
| Repeated transformation chains | fetchTimeseriesData → buildSeriesConfig → chart update all in page | Single transformer service |
| Nested effects | createEffect wrapping createEffect in ChartView | Flatten, use createRoot |
| Cascading memos | xAxisColumn memo depends on metadata, which depends on datasetStore | Selector pattern |
| Opaque prop interfaces | Component receives `...rest` and spreads to children | Explicit prop types |
| Duplicated derived state | analyticsStore.rollingBands and domain/timeseries/store.rollingBands | Single source |
| Excessive optional props | Component with 20 optional props | Split into smaller components |
| Hidden reactive dependencies | createEffect(() => { doSomething(store.state.a.b.c); }) | Explicit signal subscription |
| Mutation-heavy stores | store.someField = computedValue outside action methods | All mutations via actions |
| Unstable chart rendering flows | ChartView renders differently based on module-level mutable | All chart state via signals |

---

## 14. Deliverables

### 14.1 Technical Debt Matrix

| Debt Item | Severity | Effort | Priority |
|---|---|---|---|
| Store proliferation (9 stores) | High | Medium | P0 |
| God components (TimeseriesPage, ChartView) | High | High | P1 |
| Chart lifecycle fragmentation | High | Medium | P1 |
| Duplicate state (analyticsStore ↔ domain) | Medium | Low | P1 |
| Service impurity (dataFetch imports stores) | Medium | Medium | P1 |
| Type duplication (3 type namespaces) | Medium | Low | P2 |
| Incomplete transformers (scatter.ts stub) | Medium | Medium | P2 |
| Hook confusion (useTimeseriesData ↔ useFilterPipeline) | Medium | Low | P2 |
| Module-level mutable vars (partially fixed) | Medium | Low | P2 |

### 14.2 8-Week Roadmap

| Week | Phase | Focus | Key Deliverable |
|---|---|---|---|
| 1-2 | **Foundation** | Infrastructure | `services/api/client.ts`, `services/dataTransformers/` (working), 3 stores, `types/domains.ts`, CSS tokens |
| 3-4 | **Timeseries Domain** | High-value | TimeseriesPage thin (~60L), `domain/timeseries/store`, TimeseriesChart, chart layer split |
| 5 | **Scatter Domain** | High-value + bugfix | `domain/scatter/store` (consolidated), ScatterPage thin, **color-by-column fix** |
| 6 | **UI Cleanup** | Medium | `components/ui/` primitives only, `components/layout/` |
| 7 | **Analytics Domains** | Lower traffic | `domain/fft/`, `domain/drift/`, `domain/causal/` |
| 8 | **Polish** | Low | Remove dead code, update imports, full test suite |

### 14.3 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Store migration during live development | High | High | Feature flags, incremental migration |
| ChartGPU integration regression | Medium | High | Adapter interface first, ECharts keeps working |
| TimeseriesPage refactor (400+ lines) | Medium | Medium | Do first, validate pattern before applying |
| Type duplicates across 3 namespaces | Low | Low | Single pass cleanup in Phase 1 |
| CSS tokens coverage gaps | Low | Low | Incremental mapping, old classes stay |

### 14.4 Verification Checkpoints

1. `tsc --noEmit` — TypeScript clean after each phase
2. `vitest run` — all unit tests pass
3. Playwright E2E — timeseries, scatter, upload flows
4. Visual regression — chart renders identically post-refactor
5. Performance — no >5% regression in Lighthouse scores
