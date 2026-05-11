# Frontend Rewrite Plan — SolidJS Architecture

## Overview

Rewrite the edatime frontend using **SolidJS** for a lighter, more reactive, and easier-to-maintain architecture. Keep Arrow IPC + ChartGPU for data transfer and charting.

**Key Technologies:**
- **SolidJS** — Fine-grained reactivity, no virtual DOM
- **SolidJS native stores** — Idiomatic state management
- **CSS Modules** — Scoped styles + minimal utility layer
- **vite-plugin-solid** — Build tooling
- **vite-plugin-pwa** — Service worker management

---

## Target Architecture

```
frontend/
├── index.html              # Entry HTML
├── tsconfig.json           # Strict TypeScript config
├── vite.config.ts          # Vite + SolidJS + PWA config
├── package.json
├── public/
│   └── sw.js               # Old service worker (to be replaced)
└── src/
    ├── index.tsx           # SolidJS entry point
    ├── App.tsx             # Root component with routing
    ├── components/
    │   ├── ui/             # Base UI components
    │   │   ├── Button.tsx
    │   │   ├── Button.module.css
    │   │   ├── Modal.tsx
    │   │   ├── Modal.module.css
    │   │   ├── Toast.tsx
    │   │   ├── Chip.tsx
    │   │   ├── Input.tsx
    │   │   ├── Dropdown.tsx
    │   │   ├── Tooltip.tsx
    │   │   ├── Tabs.tsx
    │   │   └── index.ts     # Barrel export
    │   ├── layout/          # Layout components
    │   │   ├── AppShell.tsx
    │   │   ├── Sidebar.tsx
    │   │   ├── Toolbar.tsx
    │   │   └── SettingsPanel.tsx
    │   └── chart/           # Chart integration
    │       ├── ChartView.tsx    # ChartGPU wrapper
    │       └── AnnotationPanel.tsx
    ├── pages/
    │   ├── TimeseriesPage.tsx
    │   ├── FftPage.tsx
    │   ├── HeatmapPage.tsx
    │   ├── SpectrogramPage.tsx
    │   ├── ScatterPage.tsx
    │   ├── DriftPage.tsx
    │   ├── CausalPage.tsx
    │   └── SettingsPage.tsx
    ├── stores/
    │   ├── datasetStore.ts   # Metadata, column profiles, Arrow data
    │   ├── uiStore.ts       # Filters, selections, column visibility, colors
    │   ├── chartStore.ts    # Viewport, zoom/pan, chart instance
    │   ├── analyticsStore.ts # Rolling bands, anomalies, spectral
    │   ├── scatterStore.ts  # Scatter page state
    │   └── index.ts         # Barrel export
    ├── services/
    │   ├── dataClient.ts    # Arrow IPC fetch (kept, types added)
    │   └── api.ts           # Typed API wrappers
    ├── types/
    │   └── index.ts         # All shared types
    ├── utils/
    │   ├── router.ts        # Hash-based routing
    │   ├── chartExport.ts   # Export utilities
    │   └── toast.ts         # Toast notification helpers
    ├── styles/
    │   ├── global.css       # Global styles, CSS variables
    │   └── util.css         # Spacing/typography utilities
    └── sw/
        ├── sw.ts            # Main service worker (vite-plugin-pwa)
        └── cache.ts         # Cache strategy helpers
```

---

## Phase Details

### Phase 1: Project Scaffold

**Create:**
- `frontend/tsconfig.json` — strict mode, `jsx: preserve`, `jsxImportSource: solid`, path aliases
- `frontend/vite.config.ts` — add `solidPlugin`, `VitePWAPlugin`, configure chunks
- `frontend/package.json` — add `solid-js`, `@solidjs/router`, `vite-plugin-pwa`
- `frontend/src/index.tsx` — SolidJS render entry point
- `frontend/src/App.tsx` — Root component with hash-based router

**Modify:**
- `frontend/index.html` — update script to `src/index.tsx`, add solid-js div root

**Old files to remove after migration:**
- `frontend/src/app.ts`
- `frontend/src/state.ts`
- `frontend/src/store/` directory

---

### Phase 2: Type System

**Create `src/types/index.ts`** — Consolidate from current `types.ts`:

```typescript
// Dataset types
export interface DatasetMetadata { ... }
export interface ColumnProfile { ... }
export interface DataObject { ts: Float64Array; values: Record<string, Float64Array> }
export interface FilteredDataObject { series: Record<string, SeriesData> }

// Chart types
export interface ChartViewport { xMin: number; xMax: number; yMin: number; yMax: number }
export interface ZoomState { zoomStack: ChartViewport[]; currentIndex: number }
export interface ChartInstance { initialize(): void; setData(d: any): void; dispose(): void }

// Analytics types
export interface RollingBandConfig { column: string; window: number; stats: string[] }
export interface AnomalyConfig { column: string; threshold: number; method: 'std' | 'iqr' }
export interface SpectralConfig { fftSize: number; overlap: number; windowFn: string }

// Page-specific types
export interface ScatterConfig { xCol: string; yCol: string; colorCol: string; sizeCol: string }
export interface DriftConfig { ... }
export interface CausalConfig { ... }

// Component prop types
export interface ChartViewProps { data: FilteredDataObject; viewport: ChartViewport }
```

---

### Phase 3: Service Worker Refactor

**Create `src/sw/`** — Replace manual `sw.js` with vite-plugin-pwa:

- `src/sw/sw.ts` — Main SW entry using Workbox
- `src/sw/cache.ts` — Cache strategies (precise-first for app shell, network-first for API)

**Config in `vite.config.ts`:**
```typescript
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html}'],
    runtimeCaching: [
      {
        urlPattern: /\/api\/arrow/,
        handler: 'NetworkFirst',
        options: { cacheName: 'arrow-data', expiration: { maxEntries: 50 } }
      },
      {
        urlPattern: /\/api\/analytics/,
        handler: 'NetworkFirst',
        options: { cacheName: 'analytics-data' }
      }
    ]
  }
})
```

---

### Phase 4: SolidJS Stores

Replace old pub/sub store with SolidJS `createStore`. Each store is a separate file:

**`src/stores/datasetStore.ts`**
```typescript
const [datasetState, setDatasetState] = createStore({
  metadata: null as DatasetMetadata | null,
  columns: [] as ColumnProfile[],
  numericCols: [] as string[],
  data: null as DataObject | null,
  filteredData: null as FilteredDataObject | null
});
```

**`src/stores/uiStore.ts`**
```typescript
const [uiState, setUiState] = createStore({
  selectedColumns: [] as string[],
  filters: {} as Record<string, any>,
  ranges: {} as Record<string, [number, number]>,
  colors: {} as Record<string, string>,
  theme: 'dark' as 'dark' | 'light'
});
```

**`src/stores/chartStore.ts`**
```typescript
const [chartState, setChartState] = createStore({
  viewport: { xMin: 0, xMax: 100, yMin: 0, yMax: 1 } as ChartViewport,
  zoomHistory: [] as ChartViewport[],
  chartInstance: null as ChartInstance | null,
  isDrawing: false,
  drawMode: 'pan' as 'pan' | 'zoom' | 'select'
});
```

**`src/stores/analyticsStore.ts`**
```typescript
const [analyticsState, setAnalyticsState] = createStore({
  rollingBands: [] as RollingBandConfig[],
  anomalyOverlay: null as AnomalyConfig | null,
  spectralFilter: null as SpectralConfig | null,
  fftResult: null as FFTData | null,
  spectrogramData: null as SpectrogramData | null
});
```

**`src/stores/scatterStore.ts`**
```typescript
const [scatterState, setScatterState] = createStore({
  config: { xCol: '', yCol: '', colorCol: '', sizeCol: '' } as ScatterConfig,
  view: 'plot' as 'plot' | 'matrix',
  zoomLevel: 1,
  matrixColumns: [] as string[]
});
```

---

### Phase 5: Services

**Keep `src/services/dataClient.ts` mostly intact.** Add SolidJS-idiomatic wrappers:

```typescript
// Create a resource for Arrow IPC data
export function createDatasetResource(fileId: string) {
  return createResource(fileId, async (id) => {
    const response = await fetch(`/api/arrow/${id}`);
    return await parseArrowResponse(response);
  });
}

// Analytics helpers
export function createAnalyticsResource(type: string, params: AnalyticsParams) {
  return createResource(() => `${type}-${JSON.stringify(params)}`, async () => {
    return await fetchAnalytics(type, params);
  });
}
```

---

### Phase 6: Base UI Components

**Location: `src/components/ui/`**

| Component | File | Props |
|-----------|------|-------|
| Button | `Button.tsx` | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'danger'`, `size`, `disabled`, `onClick` |
| Modal | `Modal.tsx` | `open`, `onClose`, `title`, `children` |
| Toast | `Toast.tsx` | Uses `createSignal` for queue, renders via portal |
| Chip | `Chip.tsx` | `label`, `color`, `selected`, `onClick`, `onRemove` |
| Input | `Input.tsx` | `type: 'text' \| 'number' \| 'range'`, `value`, `onChange` |
| Dropdown | `Dropdown.tsx` | `options`, `value`, `onChange`, `placeholder` |
| Tooltip | `Tooltip.tsx` | `content`, `position`, `children` |
| Tabs | `Tabs.tsx` | `tabs: {id, label}[]`, `activeTab`, `onTabChange` |

Each component has a `.module.css` file for scoped styles.

---

### Phase 7: Chart Wrapper Component

**`src/components/chart/ChartView.tsx`**

```typescript
interface ChartViewProps {
  data: () => FilteredDataObject | null;
  viewport: () => ChartViewport;
  annotations: () => Annotation[];
  onViewportChange?: (v: ChartViewport) => void;
}

export function ChartView(props: ChartViewProps) {
  let chartRef: HTMLDivElement;
  let chartInstance: ChartInstance;

  onMount(() => {
    chartInstance = new DataChart(chartRef);
    chartInstance.initialize();
  });

  createEffect(() => {
    const data = props.data();
    if (data && chartInstance) {
      chartInstance.setData(data);
    }
  });

  createEffect(() => {
    const viewport = props.viewport();
    if (viewport && chartInstance) {
      chartInstance.setViewport(viewport);
    }
  });

  onCleanup(() => {
    chartInstance?.dispose();
  });

  return <div ref={chartRef} class={styles.chartContainer} />;
}
```

---

### Phase 8: Page Migration

Migrate in dependency order (easiest first):

1. **SettingsPage** — Low complexity, good first SolidJS exercise
2. **TimeseriesPage** — Main page, core chart integration
3. **FftPage** — Similar chart pattern to timeseries
4. **SpectrogramPage** — Grid-based visualization
5. **HeatmapPage** — Matrix/grid layout
6. **ScatterPage** — More state, matrix view, dual modes
7. **DriftPage** — Specialized analysis
8. **CausalPage** — Specialized analysis

**Page structure pattern:**
```typescript
export function TimeseriesPage() {
  const data = datasetStore.data;
  const viewport = chartStore.viewport;
  const selectedColumns = uiStore.selectedColumns;

  return (
    <div class={styles.page}>
      <Toolbar />
      <div class={styles.chartArea}>
        <ChartView data={data} viewport={viewport} />
      </div>
      <ColumnSelector columns={selectedColumns} />
    </div>
  );
}
```

---

### Phase 9: Layout & Remaining Components

**Location: `src/components/layout/`**

| Component | File | Description |
|-----------|------|-------------|
| AppShell | `AppShell.tsx` | Main layout wrapper with header, sidebar, content area |
| Sidebar | `Sidebar.tsx` | Navigation menu with page links |
| Toolbar | `Toolbar.tsx` | Zoom controls, draw mode, export buttons |

**Remaining UI:**
| Component | New Location |
|-----------|--------------|
| UploadPanel | `components/ui/UploadPanel.tsx` |
| ProfileGrid | `components/ui/ProfileGrid.tsx` |
| GuidedWorkflow | `components/ui/GuidedWorkflow.tsx` |

---

### Phase 10: Cleanup

**Files to remove:**
```
frontend/src/app.ts
frontend/src/state.ts
frontend/src/store/
frontend/src/bootstrap/
frontend/src/pages/
frontend/src/scatter/
frontend/src/drift/
frontend/src/causal/
frontend/src/ui/
frontend/src/chart/
frontend/src/charts/
frontend/src/utils/router.ts (replace with solid-router)
frontend/src/utils/settings.ts
frontend/src/utils/session.ts
```

**Verification:**
1. Run `npm run build` — must produce `frontend/js/` output
2. Run typecheck (`npm run typecheck` if configured, or `tsc --noEmit`)
3. Verify no `window.__edatime` references remain
4. Test all pages in browser

---

## Migration Dependency Graph

```
Phase 1: Scaffold
    ├── tsconfig.json
    ├── vite.config.ts
    ├── package.json
    └── index.html + App.tsx
            ↓
Phase 2: Types
    └── src/types/index.ts
            ↓
Phase 3: Service Worker
    └── src/sw/ + vite-plugin-pwa
            ↓
Phase 4: Stores
    └── src/stores/ (dataset, ui, chart, analytics, scatter)
            ↓
Phase 5: Services
    └── src/services/ (keep dataClient, add wrappers)
            ↓
Phase 6: Base UI Components
    └── src/components/ui/ (Button, Modal, Chip, etc.)
            ↓
Phase 7: Chart Wrapper
    └── src/components/chart/ChartView.tsx
            ↓
Phase 8: Pages (1 at a time)
    └── Settings → Timeseries → FFT → Spectrogram → Heatmap → Scatter → Drift → Causal
            ↓
Phase 9: Layout + Remaining UI
    └── AppShell, Sidebar, Toolbar, UploadPanel, ProfileGrid, GuidedWorkflow
            ↓
Phase 10: Cleanup
    └── Remove old .ts files, verify build
```

---

## CSS Strategy

**CSS Modules** — Keep existing pattern, each component has `.module.css`

**Minimal utility layer** — `src/styles/util.css`:
```css
/* Spacing */
.m-1 { margin: 4px; } .m-2 { margin: 8px; } .m-4 { margin: 16px; }
/* Flex */
.flex { display: flex; } .flex-col { flex-direction: column; }
/* Text */
.text-sm { font-size: 12px; } .text-lg { font-size: 18px; }
/* etc. — only define what you actually use */
```

**CSS Variables** — `src/styles/global.css`:
```css
:root {
  --color-bg: #1a1a1a;
  --color-surface: #2a2a2a;
  --color-border: #3a3a3a;
  --color-text: #e0e0e0;
  --color-accent: #4a9eff;
  /* ... */
}
```

---

## Bundle Chunk Strategy (vite.config.ts)

```typescript
manualChunks(id) {
  if (id.includes('chartgpu')) return 'chartgpu';
  if (id.includes('apache-arrow')) return 'arrow';
  if (id.includes('echarts')) return 'echarts';
  if (id.includes('/scatter/')) return 'scatter';
  if (id.includes('/causal/')) return 'causal';
  if (id.includes('/drift/')) return 'drift';
  if (id.includes('/pages/')) return 'pages';
}
```

---

## Notes

- **No virtual DOM** — SolidJS compiles to real DOM operations. Debugging is closer to vanilla JS
- **Signals, not state** — Use `createSignal` for local component state, `createStore` for shared state
- **Effects auto-track** — `createEffect(() => ...)` automatically tracks signal dependencies. No manual deps arrays
- **No JSX runtime** — SolidJS JSX transform produces direct DOM calls, no virtual DOM