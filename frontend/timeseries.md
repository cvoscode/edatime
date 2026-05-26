# Time Series Page — Old Frontend Implementation Overview

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Initialization Chain](#2-initialization-chain)
3. [State Management](#3-state-management)
4. [Data Fetching & Rendering Pipeline](#4-data-fetching--rendering-pipeline)
5. [Chart System](#5-chart-system)
6. [Interactions (Zoom, Pan, Selection)](#6-interactions-zoom-pan-selection)
7. [Overlays (Rolling Bands, Anomalies, Filters, Annotations)](#7-overlays-rolling-bands-anomalies-filters-annotations)
8. [Column Filtering System](#8-column-filtering-system)
9. [Analytics Integration](#9-analytics-integration)
10. [Export System](#10-export-system)
11. [Empty States & Error Handling](#11-empty-states--error-handling)
12. [Adaptive Line Filters (Ctrl+Click)](#12-adaptive-line-filters-ctrlclick)
13. [Session Persistence](#13-session-persistence)
14. [Service Worker & Caching](#14-service-worker--caching)
15. [Feature Checklist for Reimplementation](#15-feature-checklist-for-reimplementation)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                            index.html                                │
│                      (120KB, main entry, #main-chart)                │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            app.ts                                    │
│                    (main orchestrator, init())                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │ dataClient   │ │  DataChart   │ │timeseriesPage│ │ appShell    │ │
│  │ (lazy-load)  │ │  (lazy-load) │ │ controller   │ │ (sidebar)   │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └─────────────┘ │
│         │                │                │                          │
│         ▼                ▼                ▼                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    appState (composite state)                  │   │
│  │  chartState | analyticsState | uiState | datasetState | ...   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
old_frontend/
├── index.html                      # Main HTML (120KB, inline scripts/CSS)
├── app.js                          # Vite placeholder {}
├── sw.js                           # Service worker (cache-first strategy)
├── css/
│   ├── style.css
│   └── modules/
│       └── chart.css               # Chart container, skeleton, empty state
├── js/
│   ├── app.js                      # Built output
│   └── assets/                     # Bundled libs: echarts, chartgpu, apache-arrow
├── libs/
│   └── chartgpu/                   # WebGPU chart library
└── src/
    ├── app.ts                      # Main orchestrator
    ├── state.ts                    # Composite state re-exports + helpers
    ├── types.ts
    ├── dataClient.ts               # Arrow IPC fetching + analytics APIs
    ├── bootstrap/
    │   ├── appShell.ts             # Sidebar, page switching
    │   ├── timeseriesBootstrap.ts  # Dataset inputs, reset/clear actions
    │   ├── analyticsOverlay.ts     # Rolling/anomaly overlay binding
    │   └── sessionBootstrap.ts     # Session restore
    ├── chart/
    │   ├── DataChart.ts            # ChartGPU wrapper + drawing + export
    │   ├── FftChart.ts
    │   ├── chartOverlays.ts        # Rolling bands, anomalies, annotations
    │   ├── chartInteractions.ts   # Box zoom, wheel zoom, selection box
    │   └── annotations.ts
    ├── pages/
    │   ├── timeseriesPage.ts       # Main timeseries controller
    │   ├── fftPage.ts
    │   ├── spectrogramPage.ts
    │   └── heatmapPage.ts
    ├── store/
    │   ├── chartState.ts           # Chart viewport, zoom history, chartText
    │   ├── analyticsState.ts       # Rolling bands, anomalies, spectral filter
    │   ├── uiState.ts              # Selected cols, filters, color column
    │   ├── datasetState.ts         # Metadata, numeric cols, profiles
    │   └── scatterState.ts
    └── ui/
        ├── toolbar.ts              # Analysis controls, zoom/draw/export
        ├── columns.ts              # Column toggles, range chips, filter modal
        └── chartTextControls.ts    # Title/axis label inputs
```

---

## 2. Initialization Chain

### Full Boot Sequence

```
init() [app.ts]
  │
  ├─ installWindowsWebGpuRequestAdapterWorkaround()
  ├─ buildMetaBar(null)                           // empty meta bar immediately
  ├─ initAppShell()                               // sidebar + page routing
  │
  ├─ getHashPage() → 'timeseries'
  │
  ├─ ensureDatasetReady()                         // gated by metadata
  │    ├─ ensureChartModules()                    // lazy-load: dataClient + DataChart
  │    │    └─ Promise.all([
  │    │         import('dataClient'),            // fetchData, fetchMetadata, etc.
  │    │         import('chart/DataChart')        // DataChart constructor
  │    │       ])
  │    │    └─ registerChartType('line', DataChart)
  │    │    └─ registerChartType('fallback', FallbackChart)
  │    │
  │    ├─ fetchMetadata() → DatasetMetadata
  │    │    └─ storeFetchedMetadata(metadata)
  │    │    └─ derive numericCols from metadata
  │    │
  │    └─ initializeDatasetUi()
  │         ├─ initDatasetSearchInputs()          // column/profile filter inputs
  │         ├─ initSeriesCollapse()
  │         ├─ initTimeseriesActions()            // reset range, clear filters
  │         ├─ buildColumnToggles()                // series chip list
  │         ├─ buildMetaBar()                      // row/col count stats
  │         ├─ buildRangeControls()                // time range inputs
  │         ├─ hydrateColumnProfiles()
  │         └─ applyPartialTimeRangeFromMetadata()
  │
  └─ ensureTimeseriesReady()                      // gated by chart init
       ├─ checkWebGPU()                            // 5s timeout adapter request
       ├─ appState.chart = new DataChart(...)       // chart created
       ├─ appState.chart.init()                    // 6s timeout
       │    ├─ createChart(container, chartOptions)
       │    ├─ _initDrawingOverlay()               // transparent 2D canvas
       │    ├─ _initTextOverlays()                 // title, x-label, y-label divs
       │    └─ _initMouseSelectionZoom()            // box-zoom setup
       ├─ bindAnalysisChartEvents()
       ├─ initAdaptiveFilterGesture()               // Ctrl+click line drawing
       ├─ refreshZoomControlsState()
       ├─ appState.chart.setXRange(currentStart, currentEnd)
       ├─ renderCurrentData()
       ├─ timeseriesPage.fetchAndRender()          // first data fetch
       ├─ appState.initialView = getCurrentView()  // snapshot for reset
       └─ restoreSessionAfterChartReady()
```

### WebGPU Fallback Chain

```
checkWebGPU()
  ├─ navigator.gpu exists? → NO → return "WebGPU not supported"
  ├─ requestGpuAdapter() → 5s timeout → reject → return error
  └─ success → null

If error:
  → getChartType('fallback')?.create(container)
  → FallbackChart (Canvas 2D)
```

---

## 3. State Management

### AppState — Composite State Proxy

`appState` is a backward-compatible proxy object delegating to sub-states:

```
appState ─┬─→ datasetState.metadata, numericCols, columnProfiles, datasetRevision
          ├─→ uiState.selectedCols, columnRanges, adaptiveLineFilters,
          │      seriesColors, selectedColorColumn, filterText, ...
          ├─→ analyticsState.rollingEnabled, rollingWindow, rollingBands,
          │      anomalyEnabled, anomalyRegions, spectralFilterPreview, ...
          ├─→ chartState.chart, currentStart, currentEnd, initialView,
          │      zoomHistory, chartText
          └─→ scatterState.* (scatter sub-state)
```

### State Interfaces

```typescript
// chartState — viewport & chart instance
interface ChartState {
    chart: ChartInstance | null;        // DataChart/FallbackChart instance
    currentStart: number | null;        // epoch ms
    currentEnd: number | null;          // epoch ms
    initialView: ViewSnapshot | null;    // for "reset to dataset range"
    zoomHistory: ViewSnapshot[];         // max 20 entries
    chartText: { title: string; xLabel: string; yLabel: string };
}

// analyticsState — overlay data
interface AnalyticsState {
    rollingEnabled: boolean;
    rollingWindow: number;              // default 50
    rollingBands: RollingBandData[] | null;
    anomalyEnabled: boolean;
    anomalyMethod: string;               // 'zscore'
    anomalyThreshold: number;            // 3.0
    anomalyRegions: AnomalyRegionData[] | null;
    spectralFilterPreview: SpectralFilterPreview | null;
}

// uiState — selections & filters
interface UiState {
    filterText: string;
    selectedCols: string[];
    adaptiveFilterColumn: string | null;
    columnRanges: Record<string, ColumnRange>;  // per-column y-axis range filters
    adaptiveLineFilters: AdaptiveLineFilter[];   // keepAbove/below line filters
    pendingAdaptivePoint: PendingAdaptivePoint | null;
    seriesColors: Record<string, string>;        // custom hex colors per column
    selectedColorColumn: string | null;          // color-by-column
    // ... profile grid state
}

// datasetState — metadata
interface DatasetState {
    metadata: DatasetMetadata | null;
    numericCols: string[];
    columnProfiles: ProfileRow[];
    datasetRevision: number;              // monotonic invalidation counter
}
```

### Key State Transitions

| State | Written By | Read By | Trigger |
|-------|-----------|---------|---------|
| `currentStart/currentEnd` | `timeseriesPage.onZoomRangeChange()` | `DataChart.setXRange()`, `chartInteractions` | Zoom/pan |
| `selectedCols` | `uiState.setSelectedCols()` | `timeseriesPage.fetchAndRender()` | Column chip click |
| `columnRanges` | `uiState.setColumnRange()` | `state.applyColumnRanges()` | Range brush on chart |
| `rollingBands` | `fetchRollingBands()` → analytics overlay | `chartOverlays._renderRollingBandsToCtx()` | Rolling toggle |
| `anomalyRegions` | `fetchAnomalies()` | `chartOverlays._renderAnomalyRegionsToCtx()` | Anomaly toggle |
| `chart` | `ensureTimeseriesReady()` | `DataChart.updateDataMulti()`, `timeseriesPage` | Chart init |

---

## 4. Data Fetching & Rendering Pipeline

### Fetch Pipeline (`fetchAndRender()`)

```
fetchAndRender()
  │
  ├─ 1. sanitizeSelectedColumns()               // normalize appState.selectedCols
  │      // removes: ts/timestamp/time cols, non-numeric, unavailable cols
  │
  ├─ 2. guard: no selectedCols → buildRangeControls() + renderCurrentData() → return
  │
  ├─ 3. abort previous dataFetchController      // cancels in-flight request
  │
  ├─ 4. show loading indicator (#main-chart-loading)
  │
  ├─ 5. fetchData(startIso, endIso, width, selectedCols, colorCol, signal)
  │      │ HTTP GET /api/data?start=&end=&width=&columns=&color_column=
  │      │ Returns Arrow IPC binary
  │      │ Parsed via apache-arrow tableFromIPC
  │      └─ DataObject: { ts: Float64Array, values: {}, color: {}, _meta: {} }
  │
  ├─ 6. appState.lastFetchedData = data
  │
  ├─ 7. ensureRangeStateFromData(data)           // init columnRanges from data bounds
  │
  ├─ 8. deps.buildRangeControls()               // rebuild time range UI
  │
  ├─ 9. appState.chart.setXRange(currentStart, currentEnd)
  │
  ├─ 10. renderCurrentData()
  │       ├─ applyColumnRanges(lastFetchedData)  // filter rows by columnRanges + adaptive filters
  │       ├─ emptyState.update({...})           // update empty state reason
  │       ├─ merge spectralFilterPreview        // inject preview series if active
  │       ├─ appState.chart.updateDataMulti(filtered, displayCols)
  │       ├─ if rollingEnabled: computeFrontendRollingBands() → rollingBands
  │       └─ requestOverlayRender()
  │
  ├─ 11. emitChartRangeChange('data')
  │
  ├─ 12. if anomalyEnabled: deps.fetchAndRenderAnalytics()
  │
  └─ 13. hide loading indicator (finally)
```

### Data Object Shapes

```typescript
// Raw from fetchData()
interface DataObject {
    ts: Float64Array;               // timestamps in epoch ms
    values: Record<string, Float64Array>;  // column → values
    color: Record<string, Array<number|string|null>>; // color-by column values
    _meta: {
        downsampled: boolean;
        returned_rows: number;
        target_points: number;
        [key: string]: any;
    };
}

// After applyColumnRanges() — same shape but filtered
interface FilteredDataObject {
    ts: Float64Array;
    values: Record<string, Float64Array>;
    color: Record<string, Array<number|string|null>>;
    _meta: DataObject['_meta'];
}

// Rolling band data (fetched from API)
interface RollingBandData {
    column: string;
    ts: number[];
    mean: (number | null)[];
    upper1: (number | null)[];     // +1 sigma
    lower1: (number | null)[];     // -1 sigma
    upper2: (number | null)[];     // +2 sigma
    lower2: (number | null)[];     // -2 sigma
}

// Anomaly region data (fetched from API)
interface AnomalyRegionData {
    column: string;
    method: string;
    start_ms: number;
    end_ms: number;
    score: number;
}
```

### `applyColumnRanges()` Filtering

```typescript
applyColumnRanges(dataObj): FilteredDataObject {
    // Iterates over all rows
    // For each row, for each selected column:
    //   - Check if value falls within columnRanges[col].from / .to
    //   - Check if row passes adaptiveLineFilters (keepAbove/below)
    // Only rows where ALL selected columns pass are included
    // Returns new FilteredDataObject (does NOT mutate original)
}
```

---

## 5. Chart System

### DataChart — ChartGPU Wrapper

```
┌────────────────────────────────────────────────────────────────┐
│                         DataChart                              │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                  ChartGPU (WebGPU)                        │ │
│  │  setOption(series[], axes, tooltip, annotations)          │ │
│  │  setZoomRange(start, end, source)                         │ │
│  │  resize() / dispose()                                    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                              ▲                                  │
│                              │ chartInstance.setOption()       │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              updateDataMulti(dataObj, columns)            │ │
│  │  - maps FilteredDataObject → ChartGPU SeriesConfig[]      │ │
│  │  - color-by-column: calls buildColorizedSeries()          │ │
│  │  - builds tooltip formatter                               │ │
│  │  - fires onYRangeCallback(dataYMin, dataYMax)             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Overlay System (2D Canvas)                  │ │
│  │                                                          │ │
│  │  _overlayCanvas (transparent, pointer-events: none)       │ │
│  │    ├─ ChartOverlays (extracted overlay renderer)         │ │
│  │    │    ├─ _renderRollingBandsToCtx()                     │ │
│  │    │    ├─ _renderAnomalyRegionsToCtx()                  │ │
│  │    │    ├─ _renderAdaptiveFilterLinesToCtx()             │ │
│  │    │    └─ _renderAnnotationsToCtx()                      │ │
│  │    └─ User drawings (arrows, boxes)                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Text Overlays (HTML divs)                   │ │
│  │  _titleEl, _xLabelEl, _yLabelEl (absolutely positioned)  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Box Zoom (pointer capture)                  │ │
│  │  initBoxZoom() → selection box div, pointer events        │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### DataChart Public API

```typescript
class DataChart {
    destroy(): void;                          // light disposal
    deepDispose(): void;                      // full disposal + DOM removal

    // Text/labels
    setChartText(title: string, xLabel: string, yLabel: string): void;

    // Drawing mode
    setDrawMode(mode: 'none' | 'arrow' | 'box', color?: string, width?: number): void;
    clearDrawings(): void;
    requestOverlayRender(): void;

    // Viewport
    setXRange(minMs: number, maxMs: number): void;
    setYRange(min: number, max: number): void;
    getYRange(): { min: number; max: number } | null;
    fitYToData(): void;
    getXDomain(): { min: number; max: number } | null;

    // Events
    onCrosshairMove(callback: (data: ChartGPUCrosshairMovePayload) => void): void;
    onClick(callback: (data: ChartGPUEventPayload) => void): void;

    // Data
    async updateDataMulti(dataObj: FilteredDataObject, columns: string[]): Promise<void>;

    // Export
    async exportPNG(): Promise<void>;
    async exportSVG(): Promise<void>;
    async exportHTML(): Promise<void>;
    exportSVGDrawings(viewWidth: number, viewHeight: number): string;

    // Coordinate conversion
    cssPointToData(clientX: number, clientY: number): { x: number; y: number } | null;

    // Lifecycle
    async init(): Promise<void>;
    supportsZoomControls(): boolean;
    resize(): void;
}
```

### Color-by-Column Rendering

When `appState.selectedColorColumn` is set and color values exist:

```
updateDataMulti() → for each series with color values:
  ├─ buildColorizedSeries(series, colorValues, colorScale)
  │    └─ Creates N sub-series, one per unique color value
  │    └─ Each sub-series has a solid color from the color scale
  ├─ Show colorbar (continuous gradient) or categorical legend (color dots)
  └─ Pass all sub-series to chartInstance.setOption()
```

---

## 6. Interactions (Zoom, Pan, Selection)

### Box Zoom (Drag Selection)

```
User drags on chart container
  │
  ├─ pointerdown (button===0)
  │    └─ startDrag() → stores drag state, setPointerCapture()
  │
  ├─ pointermove (while dragging)
  │    └─ moveDrag() → update endX/endY
  │    └─ updateSelectionBox() → redraw selection rectangle (cyan border)
  │
  └─ pointerup
       ├─ if dx < 4px → onClick() [small tap, not a zoom]
       ├─ if dx >= 8px → dragToDataRange()
       │    └─ Convert CSS pixel span → data domain (xMin..xMax mapping)
       │    └─ onZoom(newMin, newMax)
       │         └─ timeseriesPage.onZoomRangeChange(newMin, newMax, 'box-zoom')
       └─ hideSelectionBox()
```

```
┌─────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  ← chart series
│                                         │
│         ┌───────────────┐               │  ← selection box (cyan border)
│         │   SELECTION   │               │    dashed fill
│         └───────────────┘               │
│                                         │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
└─────────────────────────────────────────┘
```

### Wheel Zoom (Scroll-to-Zoom)

```
User scrolls wheel over chart
  │
  ├─ Compute xNorm = (cursorX - plotLeft) / plotWidth
  │   // cursor's normalized position within plot area
  │
  ├─ Compute focus = curMin + xNorm * range
  │   // data value under cursor
  │
  ├─ factor = scroll-up ? 0.8 : 1.25
  │   // zoom in (smaller range) or out (larger range)
  │
  ├─ newRange = range * factor
  ├─ newMin = focus - xNorm * newRange
  ├─ newMax = newMin + newRange
  │
  └─ onZoom(newMin, newMax)
```

### onZoomRangeChange() Flow

```
onZoomRangeChange(newStart, newEnd, sourceKind?)
  │
  ├─ Clear debounce timer
  ├─ Validate: non-finite or inverted range → no-op
  │
  ├─ pushZoomHistory(currentView)           // save to undo stack (max 5)
  ├─ appState.currentStart = newStart
  ├─ appState.currentEnd = newEnd
  ├─ appState.pendingYMode = 'fit'          // Y should auto-fit to new data
  ├─ appState.pendingRestoreY = null
  │
  ├─ deps.updateAnalysisZoom(newStart, newEnd, sourceKind)
  │   // propagate zoom to analytics overlays
  │
  ├─ emitChartRangeChange(sourceKind)
  │   // fires window.CustomEvent('edatime:chart-range-change')
  │
  └─ if appState.refetchOnZoom:
       setTimeout(fetchAndRender, 150)     // debounced refetch
     else:
       renderCurrentData()                 // just re-render with existing data
```

### Zoom History (Reset to Initial View)

```typescript
// zoomHistory stores up to 5 ViewSnapshots
interface ViewSnapshot {
    start: number;    // epoch ms
    end: number;       // epoch ms
    columns: string[]; // selected columns at that point
}

// Initial view is stored separately as appState.initialView
// Used by "Reset to dataset range" button
resetChartRangeToDataset():
  ├─ read appState.metadata.time_range.min/max
  ├─ setViewport(minMs, maxMs)
  ├─ chart.setXRange(minMs, maxMs)
  ├─ deps.updateAnalysisZoom(minMs, maxMs)
  ├─ deps.emitChartRangeChange('reset')
  └─ deps.fetchAndRender()
```

---

## 7. Overlays (Rolling Bands, Anomalies, Filters, Annotations)

### Overlay Architecture

```
Overlay Canvas (_overlayCanvas)
  ┌─────────────────────────────────────────────────────────────┐
  │ z-index: 6, pointer-events: none (click-through to chart)  │
  │                                                          │
  │  Layer 1: ChartOverlays.renderAll(ctx, scale)             │
  │    ├─ Rolling bands (blue translucent corridor)           │
  │    ├─ Anomaly regions (red semi-transparent strips)      │
  │    ├─ Adaptive filter lines (teal/red dashed lines)      │
  │    └─ Annotations (bookmarks, notes, regions)             │
  │                                                          │
  │  Layer 2: User drawings (arrows, boxes)                   │
  │    └─ only visible when _drawMode !== 'none'              │
  └─────────────────────────────────────────────────────────────┘
```

### Rendering Pipeline

```
updateDataMulti() or resize() or requestOverlayRender()
  │
  └─ _scheduleDrawingRender()           // RAF coalescing
       │
       └─ _renderDrawings()             // next animation frame
            ├─ ctx.clearRect(0, 0, w, h)
            ├─ _overlays?.renderAll(ctx, { x: dpr, y: dpr })
            │    ├─ _renderRollingBandsToCtx()
            │    ├─ _renderAnomalyRegionsToCtx()
            │    ├─ _renderAdaptiveFilterLinesToCtx()
            │    └─ _renderAnnotationsToCtx()
            └─ render user drawings on top
```

### Rolling Bands Visual

```
Y-axis
  │            ╭─────────────────────╮  upper2 (2σ, rgba 0.22)
  │         ╭──┤                     ├──╮  upper1 (1σ, rgba 0.38)
  │       ╭─┤  │     ████████████    │ ├─╮  mean (dashed line)
  │     ╭─┤ │  │   ██           ██  │ │ ├─  lower1
  │   ╭─┤ │ │  │ ██               ██ │ │ │ └── lower2
  │   │ │ │ │  │██                 ██│ │ │    │
  │   │ │ │ │  │█                   █│ │ │    │
  └───┴─┴─┴─┴──┴─────────────────────┴─┴─┴────┴── X-axis (time)
        │   │
        │   └─ cyan dots: actual data points (if not downsampled)
        └────── blue translucent band (1σ or 2σ corridor)
```

**Colors:**
- 2σ band: `rgba(100, 180, 255, 0.22)` — very light blue
- 1σ band: `rgba(100, 180, 255, 0.38)` — medium light blue
- Mean line: dashed `rgba(180, 220, 255, 0.90)`, 1.5px

### Anomaly Regions Visual

```
Y-axis
  │
  │  ┌────────┐          ┌──────────┐              ← red semi-transparent
  │  │████████│          │██████████│                vertical strips across
  │  │████████│          │██████████│                full Y axis height
  │  │████████│          │██████████│
  │  └────────┘          └──────────┘
  └──────────────────────────────────────────────── X-axis (time)
        anomaly          anomaly
        region 1         region 2

  Fill: rgba(255, 74, 110, 0.15)
  Stroke: rgba(255, 74, 110, 0.5), 1px
```

### Adaptive Filter Lines Visual

```
Y-axis
  │
  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   ← keep-above line (teal, dashed [8,6])
  │      ●
  │        ●
  │          ● ● ● ● ● ● ● ● ●         ← data points above line (kept)
  │                    ●
  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   ← keep-below line (red, dashed [8,6])
  │                              ●
  │                                ●  ← data points below line (kept)
  └──────────────────────────────────────────── X-axis
```

**Pending point (during drawing):**
- 1 point: cyan dot `rgba(0, 212, 255, 0.95)` with white stroke
- 2 points: dashed preview line between them + dots at both endpoints

---

## 8. Column Filtering System

### Column Range Filter (Brush on Chart)

```
User drags brush on a column's range track in the sidebar
  │
  └─ uiState.setColumnRange(col, { from, to })
       │
       └─ timeseriesPage.renderCurrentData()
            │
            └─ applyColumnRanges(lastFetchedData)
                 ├─ For each row, for each selected column:
                 │    ├─ Check: y >= columnRanges[col].from
                 │    └─ Check: y <= columnRanges[col].to
                 └─ Only rows passing ALL column ranges are kept
```

### Adaptive Line Filters (Ctrl+Click)

Interactive 2-click line drawing to filter points above/below a line:

```
Step 1: Ctrl + Click on chart
  └─ chart.cssPointToData(clientX, clientY) → { x, y }
  └─ Store as _firstPoint (pendingAdaptivePoint with x, y)

Step 2: Ctrl + Click second point
  └─ Store as _secondPoint (pendingAdaptivePoint with x, y, x2, y2)
  └─ Show dashed preview line between the two points

Step 3: Ctrl key released (not just click)
  └─ showTracePicker(p1, p2) → popup listing all selected columns
  └─ User clicks a column name
       └─ Build AdaptiveLineFilter:
         { column, x1, y1, x2, y2, keepAbove: boolean }
         // keepAbove = more points fall above the line

Step 4: Apply filter
  └─ uiState.appendAdaptiveLineFilter(filter)
  └─ pendingAdaptivePoint = null
  └─ renderCurrentData()  // re-render with filter applied

Step 5: Filtering in applyColumnRanges()
  └─ passesAdaptiveLineFilters(tsMs, valuesByColumn)
       ├─ For each adaptiveLineFilter with matching column:
       │    └─ buildAdaptiveLineY(filter, tsMs) → expected y value on line
       │    └─ keepAbove: actual y > expected y?
       │    └─ keepBelow: actual y < expected y?
       └─ Row is kept if ALL filters pass
```

**Visual:** A dashed line is drawn on the overlay canvas. Points above (keep-above) or below (keep-below) the line are visually excluded (they remain in the data but are highlighted as "filtered").

---

## 9. Analytics Integration

### Rolling Bands

```
User enables rolling bands in toolbar
  └─ analyticsState.setRollingEnabled(true)
  └─ timeseriesPage.renderCurrentData()
       └─ computeFrontendRollingBands()  // computed on frontend
            └─ For each selected column:
                 ├─ rolling mean (moving average with window)
                 ├─ rolling stddev
                 ├─ upper1 = mean + stddev
                 ├─ lower1 = mean - stddev
                 ├─ upper2 = mean + 2*stddev
                 └─ lower2 = mean - 2*stddev
            └─ analyticsState.setRollingBands(bands)
            └─ chart.requestOverlayRender()
                 └─ _renderRollingBandsToCtx() draws on overlay canvas
```

Note: There are TWO paths for rolling bands — frontend-computed (this path) and backend-computed via `fetchRollingBands()` API. The frontend path is used when `rollingEnabled` is set directly.

### Anomaly Detection

```
User enables anomaly detection
  └─ analyticsState.setAnomalyEnabled(true)
  └─ deps.fetchAndRenderAnalytics()
       └─ fetchAnomalies(start, end, selectedCols, method, threshold)
            └─ HTTP GET /api/analytics/anomalies
            └─ Returns AnomalyRegionData[]
       └─ analyticsState.setAnomalyRegions(regions)
       └─ chart.requestOverlayRender()
```

### FFT / Spectrogram

```
FFT page:
  └─ fftPage.ts → fetchFft(start, end, columns, maxPoints)
       └─ HTTP GET /api/analytics/fft
       └─ Returns { frequencies, magnitudes, psd } per column

Spectrogram page:
  └─ spectrogramPage.ts → fetchSpectrogram(start, end, column, windowSize, hopSize)
       └─ HTTP GET /api/analytics/spectrogram
       └─ Returns time-frequency matrix for heatmap rendering
```

---

## 10. Export System

### Three Export Formats

```
exportPNG()
  └─ _getCombinedExportCanvas(true)   // includes drawings
       └─ Renders chart to offscreen via _renderExportChartToCanvas()
       └─ _renderDrawingsToCtx()       // overlays drawings
       └─ downloadUrl(url, 'chart.png')

exportSVG()
  ├─ _getCombinedExportCanvas(true)
  ├─ exportSVGDrawings(viewWidth, viewHeight)  // arrows/boxes as SVG paths
  └─ Embed PNG + SVG drawings into SVG markup
       └─ downloadUrl(url, 'chart.svg')

exportHTML()
  ├─ _getCombinedExportCanvas(true)
  └─ Wrap in self-contained HTML page with embedded styles
       └─ downloadUrl(url, 'chart.html')
```

### Low-Level Canvas Rendering (`_renderExportChartToCanvas`)

For export, the chart is re-rendered using pure Canvas 2D (no WebGPU):

```
1. Fill background (white/dark based on theme)
2. Draw plot area background
3. For each series: draw line (clipped to plot area)
4. Draw axes, ticks, tick labels
5. Draw title, x-label, y-label
6. Draw legend
7. Optionally draw overlay canvases (rolling bands, etc.)
8. Optionally draw user annotations
```

---

## 11. Empty States & Error Handling

### Empty State Reasons

| Reason | Condition | Title | Message |
|--------|-----------|-------|---------|
| `'no-columns-selected'` | No columns selected | "Select one or more series" | "Click a column chip above to add it to the chart. Start with 2-3 related columns for a clearer first view." |
| `'linked-range-outside-dataset'` | Viewport outside dataset bounds | "Current range is outside this dataset" | "Reset to dataset range to recover visible data." |
| `'no-data-after-filters'` | Data exists but all points filtered out | "No points match current filters" | "Try widening the time range or clearing filters." |

### Empty State Controller

```
getTimeseriesEmptyStateController()
  └─ Returns singleton controller:
       { update({ visible, reason, title, message, showResetAction }) }

renderCurrentData():
  ├─ hasSelection = selectedCols.length > 0
  ├─ hasPoints = filtered.ts.length > 0
  ├─ inDatasetRange = currentStart >= metadata.time_range.min && currentEnd <= metadata.time_range.max
  │
  ├─ if !hasSelection → reason = 'no-columns-selected'
  ├─ else if !inDatasetRange → reason = 'linked-range-outside-dataset'
  ├─ else if !hasPoints → reason = 'no-data-after-filters'
  └─ else → emptyState.update({ visible: false })
```

### Error Handling

```typescript
// In fetchAndRender() try/catch:
catch (err) {
    if (err.name === 'AbortError') return;  // silently swallow cancelled requests
    console.error('Failed to fetch data:', err);
    setMetaText('Error: ' + err.message);
}

// Non-finite range in onZoomRangeChange():
if (!isFinite(newStart) || !isFinite(newEnd) || newStart >= newEnd) return;
```

### Loading Indicator

```
#main-chart-loading div (hidden by default)
  └─ fetchAndRender shows it before the fetch
  └─ finally block hides it after fetch completes or aborts
```

---

## 12. Adaptive Line Filters (Ctrl+Click)

Full gesture workflow:

```
1. User HOLDS Ctrl and clicks on chart
   └─ chart.cssPointToData(clientX, clientY) → data coords
   └─ Store _firstPoint = { column: selectedCols[0], x, y }
   └─ Show cyan dot at data-space location on overlay

2. User MOVES mouse (while still holding Ctrl) and clicks second point
   └─ _secondPoint = { column, x, y, x2, y2 }
   └─ Show dashed preview line between p1 and p2
   └─ Show dots at both endpoints

3. User RELEASES Ctrl key (NOT click — Ctrl is latched)
   └─ showTracePicker(p1, p2) opens popup with column names
   └─ Clicking a column creates the filter:
        AdaptiveLineFilter = {
          column: 'selected_column',
          x1, y1, x2, y2,
          keepAbove: countAboveLine > countBelowLine
        }
   └─ pendingAdaptivePoint = null
   └─ appendAdaptiveLineFilter(filter)
   └─ renderCurrentData() + fetchAndRender()

4. User presses Escape while drawing
   └─ pendingAdaptivePoint = null
   └─ overlay re-renders (no line shown)

5. Filter rendering on overlay:
   └─ For each adaptiveLineFilter in selectedCols:
        ├─ Draw dashed line from (x1,y1) to (x2,y2)
        │    ├─ keep-above: teal rgba(0, 200, 150, 0.95)
        │    └─ keep-below: red rgba(255, 74, 110, 0.95)
        └─ Label at endpoint: "colname: keep above"
```

---

## 13. Session Persistence

### Session Bootstrap (`sessionBootstrap.ts`)

```typescript
restoreSessionAfterChartReady({
    getSelectedColumns,    // () => appState.selectedCols
    setSelectedColumns,   // (cols) => setSelectedCols(cols)
    getZoomHistory,       // () => appState.zoomHistory
    pushZoomHistory,
    getCurrentView,       // () => current view snapshot
    getMetadata,          // () => appState.metadata
})
```

**Session state restored from URL hash / localStorage:**

```
1. Hash state: #timeseries?start=...&end=...&cols=...
   └─ Parsed on init, applied to appState

2. LocalStorage session:
   ├─ selectedCols
   ├─ zoomHistory
   ├─ custom series colors
   ├─ columnRanges
   └─ adaptiveLineFilters
```

**Restoration flow:**

```
On page load:
  ├─ read hash → set initial viewport (currentStart/currentEnd)
  ├─ read localStorage → restore selectedCols, zoomHistory, colors
  └─ restoreSessionAfterChartReady() called after chart init

On changes:
  ├─ Debounced save to localStorage on state changes
  └─ URL hash updated on viewport change (for shareability)
```

---

## 14. Service Worker & Caching

### sw.js — Cache Strategy

```
Cache name: edatime-v2

Static assets (JS, CSS, fonts, images):
  └─ Cache-first strategy
       └─ Check cache → serve → else fetch from network → cache

HTML pages:
  └─ Network-first strategy
       └─ Try network → else serve from cache

API requests (data):
  └─ Network-only (no caching)
```

### Frontend Build Assets

```
frontend/dist/
  ├─ index.html
  ├─ sw.js                       (service worker)
  ├─ assets/
  │    ├─ chartgpu-*.js           (WebGPU chart lib)
  │    ├─ echarts-*.js            (fallback chart)
  │    ├─ apache-arrow-*.js       (Arrow IPC parser)
  │    └─ DataChart-*.js          (bundled DataChart)
  └─ js/app-*.js                  (main app bundle)
```

---

## 15. Feature Checklist for Reimplementation

### Core Chart

- [ ] **WebGPU rendering** via ChartGPU with Canvas 2D fallback
- [ ] **Multi-series line chart** with arbitrary number of series
- [ ] **Time X-axis** with appropriate tick formatting (auto-scaling)
- [ ] **Value Y-axis** with auto-fit to data range
- [ ] **Chart title and axis labels** as HTML text overlays (not rendered in WebGPU)
- [ ] **Legend** rendered by ChartGPU
- [ ] **Tooltip on hover** with crosshair and per-series values
- [ ] **Data update pipeline**: `updateDataMulti(dataObj, columns)` → ChartGPU `setOption()`

### Viewport & Navigation

- [ ] **Box zoom** (drag selection) → converts pixel range to time range
- [ ] **Wheel zoom** (scroll) → zooms toward cursor position
- [ ] **Pan** (drag when zoomed) → shifts viewport
- [ ] **Zoom history stack** (max 5) for undo
- [ ] **Reset to initial view** / dataset range
- [ ] **Y-axis auto-fit** (`fitYToData`) triggered on zoom/refetch
- [ ] **Y-axis manual lock** (`setYRange`)
- [ ] **Viewport state**: `currentStart`, `currentEnd` tracked in state
- [ ] **Shareable URLs**: viewport encoded in URL hash

### Data Handling

- [ ] **Arrow IPC fetch** via `GET /api/data` with `apache-arrow`
- [ ] **Timestamp parsing** handling seconds/ms/us/ns precision
- [ ] **Column selection** — fetch only selected columns
- [ ] **Color-by-column** — pass color column to API, render as colorized series
- [ ] **Downsample detection** — show markers when `x-edatime-downsampled` header is false
- [ ] **Request deduplication** for concurrent identical fetches
- [ ] **Abort controller** for cancelling in-flight requests

### Column Filtering

- [ ] **Column range filters** per column (min/max sliders)
- [ ] **applyColumnRanges()** — filters rows where y falls outside range
- [ ] **Adaptive line filters** (Ctrl+click two-point drawing)
- [ ] **keepAbove / keepBelow** line filter types
- [ ] **Filter preview** (dashed line while drawing)
- [ ] **Filter persistence** in session/localStorage
- [ ] **Column filter input** (text search for column chips)

### Analytics Overlays

- [ ] **Rolling bands** (1σ and 2σ corridors) — computed on frontend
- [ ] **Rolling bands rendered** on transparent 2D canvas overlay
- [ ] **Anomaly regions** — fetched from `/api/analytics/anomalies`
- [ ] **Anomaly overlay** — red semi-transparent vertical strips
- [ ] **Spectral filter preview** — injected as preview series
- [ ] **FFT page** — `/api/analytics/fft` with frequency/magnitude/psd
- [ ] **Spectrogram page** — `/api/analytics/spectrogram` with STFT

### Drawing & Annotations

- [ ] **Arrow drawing mode** (`setDrawMode('arrow')`)
- [ ] **Box drawing mode** (`setDrawMode('box')`)
- [ ] **Drawings persisted** across renders
- [ ] **Annotations** (bookmarks, notes, regions) stored in `window.__edatimeAnnotations`
- [ ] **Annotation rendering** on overlay canvas

### Export

- [ ] **PNG export** — composite of WebGPU canvas + overlay canvas
- [ ] **SVG export** — chart rendered to SVG with embedded drawings
- [ ] **HTML export** — self-contained HTML page with chart embedded

### State Management

- [ ] **Composite appState** delegating to sub-states (chart, analytics, ui, dataset)
- [ ] **datasetRevision** monotonic counter for cache invalidation
- [ ] **Series colors** palette with custom color overrides per column
- [ ] **Session restore** from localStorage/URL hash

### UI Components

- [ ] **Column toggle chips** — click to add/remove series
- [ ] **Time range controls** — start/end datetime inputs + reset button
- [ ] **Column profile grid** — virtual scroll, sortable, with histograms
- [ ] **Empty state controller** with configurable reasons
- [ ] **Loading indicator** (#main-chart-loading)
- [ ] **Chart skeleton** animation during initial load
- [ ] **Meta bar** — row/column counts, error messages
- [ ] **Filter modal** for column range + adaptive filters

### Service Worker

- [ ] **Cache-first** for static assets
- [ ] **Network-first** for HTML
- [ ] **No-cache** for API data requests

---

## Key Files Reference

| File | Purpose |
|------|---------|
| [src/app.ts](old_frontend/src/app.ts) | Main orchestrator, init flow, adaptive filter gesture |
| [src/pages/timeseriesPage.ts](old_frontend/src/pages/timeseriesPage.ts) | Timeseries controller, fetch/render pipeline |
| [src/chart/DataChart.ts](old_frontend/src/chart/DataChart.ts) | ChartGPU wrapper, drawing, export |
| [src/chart/chartOverlays.ts](old_frontend/src/chart/chartOverlays.ts) | Rolling bands, anomalies, annotations rendering |
| [src/chart/chartInteractions.ts](old_frontend/src/chart/chartInteractions.ts) | Box zoom, wheel zoom, selection box |
| [src/dataClient.ts](old_frontend/src/dataClient.ts) | Arrow IPC fetch, analytics API calls |
| [src/state.ts](old_frontend/src/state.ts) | Composite state, applyColumnRanges, formatting |
| [src/store/chartState.ts](old_frontend/src/store/chartState.ts) | Viewport, zoom history, chart instance |
| [src/store/analyticsState.ts](old_frontend/src/store/analyticsState.ts) | Rolling, anomaly, spectral filter state |
| [src/store/uiState.ts](old_frontend/src/store/uiState.ts) | Selected cols, filters, colors |
| [src/store/datasetState.ts](old_frontend/src/store/datasetState.ts) | Metadata, numeric columns, profiles |
| [src/bootstrap/timeseriesBootstrap.ts](old_frontend/src/bootstrap/timeseriesBootstrap.ts) | Dataset inputs, reset/clear actions |
| [css/modules/chart.css](old_frontend/css/modules/chart.css) | Chart styling, empty state, skeleton |