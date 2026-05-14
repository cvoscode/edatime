# Timeseries Page

**Page ID:** `timeseries`
**Route:** `#page=timeseries`
**Entry:** Sidebar nav (⌥2) or home card navigation
**CSS Module:** `frontend/css/style.css` (no dedicated module — styles live in `toolbar.css`, `chart.css`, `chips.css`, `layout.css`, `scatter.css`)

---

## Purpose

Primary data exploration surface. Renders one or more time-series traces on a WebGPU-accelerated chart with zoom, drawing tools, annotations, export, and an analytics drawer (rolling bands, anomaly regions).

---

## HTML Structure

### Toolbar Row 1 — Series chips (lines 273–286)

```html
<div class="toolbar toolbar--series">
  <div class="toolbar-group" role="group" aria-label="Series selection tools">
    <span class="toolbar-label">Series</span>
    <input type="text" id="column-filter-input" name="column-filter" class="column-filter-input"
      placeholder="Filter columns…" aria-label="Filter columns">
    <button class="btn btn-ghost btn-sm" id="collapse-series-btn" type="button" title="Collapse series list">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4,6 8,10 12,6"/>
      </svg>
    </button>
    <div class="series-toggles" id="column-toggles"></div>
  </div>
</div>
```

- `column-filter-input` — live filter for the chip list above
- `collapse-series-btn` — toggles chip list collapse state
- `column-toggles` — populated by `app.ts` / `appState.selectedCols` render loop

### Toolbar Row 2 — Draw | Labels | Export | Analytics | Zoom (lines 288–345)

```html
<div class="toolbar toolbar--tools">
  <!-- Draw tools -->
  <div class="toolbar-group draw-toolbar" role="group" aria-label="Drawing tools">
    <span class="toolbar-label">Draw</span>
    <select id="draw-tool" name="draw-tool" class="draw-select" aria-label="Draw tool">
      <option value="none">None (Pan)</option>
      <option value="arrow">Arrow</option>
      <option value="box">Box</option>
    </select>
    <input type="color" id="draw-color" name="draw-color" value="#ff0055" title="Color" aria-label="Draw color">
    <input type="number" id="draw-width" name="draw-width" value="2" min="1" max="10" title="Thickness" aria-label="Draw thickness">
    <button class="btn btn-ghost btn-sm" id="draw-clear-btn" type="button" title="Clear drawings">Clear Drawings</button>
    <button class="btn btn-ghost btn-sm" id="adaptive-clear-btn" type="button" title="Clear adaptive line filters (Shift+C)">Clear Column Filter</button>
  </div>

  <!-- Labels panel trigger -->
  <div class="toolbar-group labels-toolbar toolbar-group--sep" role="group" aria-label="Chart label controls">
    <button class="btn btn-ghost btn-sm toolbar-panel-open" id="open-labels-panel-btn" type="button" title="Edit chart title and axis labels">
      <span class="toolbar-label">Labels</span>
      <span class="toolbar-disclosure__value">Title + axes</span>
    </button>
  </div>

  <!-- Annotations panel trigger -->
  <div class="toolbar-group annotations-toolbar toolbar-group--sep" role="group" aria-label="Note and annotation tools">
    <button class="btn btn-ghost btn-sm toolbar-panel-open" id="open-notes-panel-btn" type="button" title="Open annotation tools">
      <span class="toolbar-label">Notes</span>
      <span class="toolbar-disclosure__value">Annotations</span>
    </button>
  </div>

  <!-- Export buttons -->
  <div class="toolbar-group export-toolbar toolbar-group--push" role="group" aria-label="Export chart and data options">
    <button class="btn btn-ghost btn-sm" id="export-png-btn" type="button" title="Export chart as PNG (P)" aria-label="Export chart as PNG">PNG <kbd class="toolbar-kbd">P</kbd></button>
    <button class="btn btn-ghost btn-sm" id="export-csv-btn" type="button" title="Export filtered data as CSV (E)" aria-label="Export filtered data as CSV">CSV <kbd class="toolbar-kbd">E</kbd></button>
    <button class="btn btn-ghost btn-sm toolbar-panel-open" id="open-export-options-btn" type="button" title="More export options">
      <span class="toolbar-label">More</span>
      <span class="toolbar-disclosure__value">SVG, JSON, Parquet</span>
    </button>
  </div>

  <!-- Analytics panel trigger -->
  <div class="toolbar-group analytics-toolbar toolbar-group--sep toolbar-group--push" role="group" aria-label="Analytics controls">
    <button class="btn btn-ghost btn-sm toolbar-panel-open" id="open-analytics-panel-btn" type="button" title="Open analytics controls">
      <span class="toolbar-label">Analytics</span>
      <span class="toolbar-disclosure__value">Bands, anomalies, cleanup</span>
    </button>
  </div>

  <!-- Zoom controls -->
  <div class="toolbar-group zoom-toolbar" role="group" aria-label="Zoom controls">
    <button class="btn btn-ghost btn-sm" id="zoom-out-btn" type="button" title="Zoom out">−</button>
    <span class="zoom-range-badge" id="zoom-range-badge">—</span>
    <button class="btn btn-ghost btn-sm" id="zoom-reset-btn" type="button" title="Reset zoom to initial view">↺</button>
  </div>
</div>
```

### Main chart area (lines 347–395)

```html
<main class="main" id="main">
  <div id="main-chart"></div>

  <!-- Empty state (shown when no columns selected) -->
  <div id="timeseries-empty-state" class="plot-empty-state" data-empty-reason="no-columns-selected">
    <div class="plot-empty-illustration" aria-hidden="true">
      <svg viewBox="0 0 80 48" width="120" height="72" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="1" width="78" height="46" rx="8" opacity="0.12" />
        <path d="M12 34 L26 22 L36 28 L50 16 L68 32" />
        <circle cx="12" cy="34" r="2" fill="currentColor" />
        <circle cx="26" cy="22" r="2" fill="currentColor" />
        <circle cx="36" cy="28" r="2" fill="currentColor" />
        <circle cx="50" cy="16" r="2" fill="currentColor" />
        <circle cx="68" cy="32" r="2" fill="currentColor" />
      </svg>
    </div>
    <strong id="timeseries-empty-title">Select one or more series</strong>
    <span id="timeseries-empty-message">Click a column chip above or use Upload to add dataset series to the chart. Start with 2–3 related columns for a clearer first view.</span>
    <div class="plot-empty-actions">
      <button class="btn btn-primary btn-sm" id="timeseries-empty-upload-btn" type="button" aria-label="Open upload page">Upload data</button>
      <button class="btn btn-sm" id="timeseries-reset-range-btn" type="button" hidden>Reset to dataset range</button>
    </div>
  </div>

  <!-- Loading overlay -->
  <div id="main-chart-loading" class="chart-loading-overlay" hidden role="status" aria-live="polite" aria-label="Chart loading indicator">
    <div class="chart-loading-spinner"></div>
    <span class="chart-loading-label">Loading data…</span>
  </div>

  <!-- Colorbar overlays -->
  <div class="scatter-overlay-stack" id="timeseries-overlays">
    <div id="timeseries-colorbar-wrap" class="scatter-colorbar-wrap scatter-colorbar-wrap--ts" hidden role="group" aria-label="Numeric color column scale">
      <span id="timeseries-colorbar-name" class="scatter-colorbar-name">Color</span>
      <div class="scatter-colorbar-scale">
        <span id="timeseries-colorbar-min" class="scatter-colorbar-bound">0</span>
        <div id="timeseries-colorbar" class="scatter-colorbar"></div>
        <span id="timeseries-colorbar-max" class="scatter-colorbar-bound">1</span>
      </div>
    </div>
    <div id="timeseries-categorical-wrap" class="scatter-colorbar-wrap scatter-colorbar-wrap--ts" hidden role="group" aria-label="Categorical color legend">
      <span id="timeseries-categorical-name" class="scatter-colorbar-name">Category</span>
      <div id="timeseries-categorical-legend" class="scatter-distribution-legend" style="margin-top: 8px;"></div>
    </div>
  </div>
</main>
```

---

## Analytics Drawer (right-side collapsible panel)

The analytics drawer is a right-side panel that slides in when "Bands, anomalies, cleanup" is clicked. It is rendered as a separate sticky `<div>` in the page but is toggled via `id="open-analytics-panel-btn"`.

From the snapshot, the drawer contains:

```html
<div id="timeseries-analytics-drawer" class="overlay-panel analytics-drawer" hidden>
  <div class="overlay-panel-header">
    <span class="overlay-panel-title">Analytics</span>
    <button id="close-analytics-panel-btn" class="overlay-panel-close" aria-label="Close">×</button>
  </div>
  <div class="overlay-panel-body">
    <!-- Rolling bands -->
    <div class="overlay-section">
      <div class="overlay-section-title">Rolling bands</div>
      <label class="overlay-toggle-label">
        <input type="checkbox" id="rolling-bands-toggle">
        <span>Show rolling mean ± σ bands</span>
      </label>
      <div class="overlay-field">
        <label for="rolling-window-input">Window size</label>
        <input type="number" id="rolling-window-input" value="50" min="2" step="1">
      </div>
    </div>

    <!-- Anomaly detection -->
    <div class="overlay-section">
      <div class="overlay-section-title">Anomalies</div>
      <label class="overlay-toggle-label">
        <input type="checkbox" id="anomaly-toggle">
        <span>Enable anomaly detection regions</span>
      </label>
      <div class="overlay-field">
        <label for="anomaly-method-select">Method</label>
        <select id="anomaly-method-select">
          <option value="zscore" selected>Z-score</option>
          <option value="iqr">IQR</option>
        </select>
      </div>
      <div class="overlay-field">
        <label for="anomaly-threshold-input">Threshold</label>
        <input type="number" id="anomaly-threshold-input" value="3" min="0.5" step="0.5">
      </div>
    </div>

    <!-- Dataset tools -->
    <div class="overlay-section">
      <div class="overlay-section-title">Dataset tools</div>
      <button class="btn btn-sm" id="transform-btn">Transform…</button>
      <button class="btn btn-sm" id="outliers-btn">Outliers…</button>
    </div>
  </div>
</div>
```

---

## CSS Classes

Styles are spread across multiple CSS modules:

| Element | CSS Module | Key Classes |
|---|---|---|
| Series toolbar row | `toolbar.css` | `.toolbar--series`, `.series-toggles` |
| Draw toolbar | `toolbar.css` | `.draw-toolbar`, `.draw-select` |
| Labels/Notes/Analytics triggers | `toolbar.css` | `.toolbar-panel-open`, `.toolbar-disclosure__value` |
| Export buttons | `toolbar.css` | `.export-toolbar`, `.toolbar-kbd` |
| Zoom controls | `toolbar.css` | `.zoom-toolbar`, `.zoom-range-badge` |
| Main chart container | `layout.css` | `.main` |
| Empty state | `chart.css` | `.plot-empty-state`, `.plot-empty-illustration` |
| Loading overlay | `loading-indicator.css` | `.chart-loading-overlay`, `.chart-loading-spinner` |
| Colorbars | `scatter.css` | `.scatter-colorbar-wrap`, `.scatter-colorbar`, `.scatter-distribution-legend` |
| Analytics drawer | `controls.css` or `chart.css` | `.overlay-panel`, `.analytics-drawer`, `.overlay-section` |

---

## JavaScript Modules

### `frontend/src/pages/timeseriesPage.ts`

`createTimeseriesPageController(deps)` — main controller factory:

- `fetchAndRender()` — fetches time range data and renders the chart
- `onZoomRangeChange(newStart, newEnd, sourceKind)` — handles zoom events
- `renderCurrentData()` — re-renders with current state (no fetch)
- `emitChartRangeChange(sourceKind)` — dispatches `edatime:chart-range-change` for cross-page sync

**Empty state controller:** `createEmptyStateController` from `ui/emptyState.ts`, configured with:
- `rootId: 'timeseries-empty-state'`
- `titleId: 'timeseries-empty-title'`
- `messageId: 'timeseries-empty-message'`
- `resetButtonId: 'timeseries-reset-range-btn'`

**Spectral filter preview:** If `appState.spectralFilterPreview` is set, the preview signal is appended as an additional series `[column name] [filtered]` to the chart.

**Zoom history:** `appState.zoomHistory` stores up to 5 previous view snapshots for back-navigation.

### `frontend/src/app.ts` — Timeseries initialization (lines ~150–250)

- `createTimeseriesPageController({ fetchData, buildRangeControls, updateAnalysisYRange, updateAnalysisZoom, getCurrentView, fetchAndRenderAnalytics })`
- `ensureTimeseriesReady()` — lazy-initializes the page on first visit
- Keyboard shortcuts: `Alt+2` → `showPage('timeseries')`, `Shift+R` → reset zoom, `Shift+Z` → zoom out, `Shift+C` → clear adaptive filters

### `frontend/src/bootstrap/timeseriesBootstrap.ts`

Wires the toolbar controls (draw tool, zoom buttons, export buttons, panel triggers) and column chip rendering.

### `frontend/src/bootstrap/analyticsOverlay.ts`

`computeFrontendRollingBands(filtered, selectedCols, window)` — computes rolling mean ± σ bands entirely in the browser for overlay rendering.

### `frontend/src/chart/DataChart.ts`

The WebGPU-accelerated chart. `updateDataMulti(data, displayCols)` renders multi-series traces. Supports drawing overlays, colorbar updates, annotations.

### `frontend/src/ui/analyticsDrawer.ts`

Manages the analytics drawer open/close, rolling band toggle, anomaly detection toggle, transform and outliers dialogs.

### `frontend/src/ui/annotationPanel.ts`

Manages the "Notes / Annotations" toolbar panel.

---

## Column Chips

Populated in `app.ts` via:

```typescript
// For each column in appState.metadata.columns that is numeric/time:
const chip = document.createElement('label');
chip.className = 'series-toggle-label';
chip.dataset.column = col.name;
// checkbox, colored swatch, column name span
// toggle checked state → appState.selectedCols update → timeseriesPage.renderCurrentData()
```

Series collapse state: `appState.seriesListCollapsed` boolean; toggle via `collapse-series-btn`.

---

## Colorbars

Numeric colorbar (`timeseries-colorbar-wrap`) is shown when `appState.selectedColorColumn` is a numeric column. Updated by `DataChart.ts` (see `updateColorbarForColumn`).

Categorical legend (`timeseries-categorical-wrap`) is shown when `appState.selectedColorColumn` is a categorical/string column.

---

## Backend API

**Fetch time range data:**
```
GET /api/timeseries/range?start=<ISO>&end=<ISO>&width=<px>&cols=<comma,sep,names>&colorCol=<colname>
```

Response:
```json
{
  "ts": [1538784000000, 1538784060000, ...],
  "values": { "colA": [...], "colB": [...] },
  "series": { "colA": {"x": [...], "y": [...]}, "colB": {...} },
  "colorByColumn": { "numericColName": {"min": 0, "max": 1, "gradient": ["#0d0887", ...]}, "catColName": {"categories": ["A","B"], "colors": [...]} }
}
```

**Rolling bands computation** (frontend-only, no backend call):
```typescript
computeFrontendRollingBands(filtered, selectedCols, windowSize) → { ts: number[], mean: number[], upper: number[], lower: number[] }
```

**Anomaly detection** (backend):
```
POST /api/analytics/anomalies
Body: { "column": "colA", "start": "ISO", "end": "ISO", "method": "zscore", "threshold": 3 }
Response: { "regions": [{ "start": 1538784060000, "end": 1538784120000, "score": 4.2 }, ...] }
```

---

## State Dependencies

| State Key | Source | Effect |
|---|---|---|
| `appState.selectedCols` | Chip toggles | Triggers `fetchAndRender()` |
| `appState.currentStart/End` | Zoom / range controls | Passed as query params to `/api/timeseries/range` |
| `appState.selectedColorColumn` | Color column selector | Changes colorbar + re-renders |
| `appState.rollingEnabled` + `rollingWindow` | Analytics drawer | Triggers `computeFrontendRollingBands()` |
| `appState.anomalyEnabled` + `anomalyMethod` + `anomalyThreshold` | Analytics drawer | Calls `/api/analytics/anomalies` |
| `appState.spectralFilterPreview` | FFT page "Preview" button | Appends filtered series to chart |
| `appState.zoomHistory` | Zoom events | Enables zoom-reset back-navigation |
| `appState.chart` | `DataChart` instance | Used for `setXRange`, `updateDataMulti`, overlay render |

---

## Keyboard Shortcuts (Timeseries-only)

| Key | Action |
|---|---|
| `Alt+2` | Navigate to timeseries page |
| `Shift+R` | Reset zoom to initial view |
| `Shift+Z` | Zoom out one level |
| `Shift+C` | Clear adaptive line filters |
| `P` | Export chart as PNG |
| `E` | Export filtered data as CSV |

---

## Complete HTML Copy (for recreation)

```html
<section class="page" id="page-timeseries" data-page-name="timeseries" hidden>
  <!-- Row 1: Series chips -->
  <div class="toolbar toolbar--series">
    <div class="toolbar-group" role="group" aria-label="Series selection tools">
      <span class="toolbar-label">Series</span>
      <input type="text" id="column-filter-input" name="column-filter" class="column-filter-input"
        placeholder="Filter columns…" aria-label="Filter columns">
      <button class="btn btn-ghost btn-sm" id="collapse-series-btn" type="button" title="Collapse series list">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,6 8,10 12,6"/></svg>
      </button>
      <div class="series-toggles" id="column-toggles"></div>
    </div>
  </div>

  <!-- Row 2: Draw | Labels | Notes | Export | Analytics | Zoom -->
  <div class="toolbar toolbar--tools">
    <div class="toolbar-group draw-toolbar" role="group" aria-label="Drawing tools">
      <span class="toolbar-label">Draw</span>
      <select id="draw-tool" name="draw-tool" class="draw-select" aria-label="Draw tool">
        <option value="none">None (Pan)</option>
        <option value="arrow">Arrow</option>
        <option value="box">Box</option>
      </select>
      <input type="color" id="draw-color" name="draw-color" value="#ff0055" title="Color" aria-label="Draw color">
      <input type="number" id="draw-width" name="draw-width" value="2" min="1" max="10" title="Thickness" aria-label="Draw thickness">
      <button class="btn btn-ghost btn-sm" id="draw-clear-btn" type="button" title="Clear drawings">Clear Drawings</button>
      <button class="btn btn-ghost btn-sm" id="adaptive-clear-btn" type="button" title="Clear adaptive line filters (Shift+C)">Clear Column Filter</button>
    </div>
    <div class="toolbar-group labels-toolbar toolbar-group--sep" role="group" aria-label="Chart label controls">
      <button class="btn btn-ghost btn-sm toolbar-panel-open" id="open-labels-panel-btn" type="button" title="Edit chart title and axis labels">
        <span class="toolbar-label">Labels</span>
        <span class="toolbar-disclosure__value">Title + axes</span>
      </button>
    </div>
    <div class="toolbar-group annotations-toolbar toolbar-group--sep" role="group" aria-label="Note and annotation tools">
      <button class="btn btn-ghost btn-sm toolbar-panel-open" id="open-notes-panel-btn" type="button" title="Open annotation tools">
        <span class="toolbar-label">Notes</span>
        <span class="toolbar-disclosure__value">Annotations</span>
      </button>
    </div>
    <div class="toolbar-group export-toolbar toolbar-group--push" role="group" aria-label="Export chart and data options">
      <button class="btn btn-ghost btn-sm" id="export-png-btn" type="button" title="Export chart as PNG (P)" aria-label="Export chart as PNG">PNG <kbd class="toolbar-kbd">P</kbd></button>
      <button class="btn btn-ghost btn-sm" id="export-csv-btn" type="button" title="Export filtered data as CSV (E)" aria-label="Export filtered data as CSV">CSV <kbd class="toolbar-kbd">E</kbd></button>
      <button class="btn btn-ghost btn-sm toolbar-panel-open" id="open-export-options-btn" type="button" title="More export options">
        <span class="toolbar-label">More</span>
        <span class="toolbar-disclosure__value">SVG, JSON, Parquet</span>
      </button>
    </div>
    <div class="toolbar-group analytics-toolbar toolbar-group--sep toolbar-group--push" role="group" aria-label="Analytics controls">
      <button class="btn btn-ghost btn-sm toolbar-panel-open" id="open-analytics-panel-btn" type="button" title="Open analytics controls">
        <span class="toolbar-label">Analytics</span>
        <span class="toolbar-disclosure__value">Bands, anomalies, cleanup</span>
      </button>
    </div>
    <div class="toolbar-group zoom-toolbar" role="group" aria-label="Zoom controls">
      <button class="btn btn-ghost btn-sm" id="zoom-out-btn" type="button" title="Zoom out">−</button>
      <span class="zoom-range-badge" id="zoom-range-badge">—</span>
      <button class="btn btn-ghost btn-sm" id="zoom-reset-btn" type="button" title="Reset zoom to initial view">↺</button>
    </div>
  </div>

  <main class="main" id="main">
    <div id="main-chart"></div>

    <div id="timeseries-empty-state" class="plot-empty-state" data-empty-reason="no-columns-selected">
      <div class="plot-empty-illustration" aria-hidden="true">
        <svg viewBox="0 0 80 48" width="120" height="72" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="1" width="78" height="46" rx="8" opacity="0.12" />
          <path d="M12 34 L26 22 L36 28 L50 16 L68 32" />
          <circle cx="12" cy="34" r="2" fill="currentColor" />
          <circle cx="26" cy="22" r="2" fill="currentColor" />
          <circle cx="36" cy="28" r="2" fill="currentColor" />
          <circle cx="50" cy="16" r="2" fill="currentColor" />
          <circle cx="68" cy="32" r="2" fill="currentColor" />
        </svg>
      </div>
      <strong id="timeseries-empty-title">Select one or more series</strong>
      <span id="timeseries-empty-message">Click a column chip above or use Upload to add dataset series to the chart. Start with 2–3 related columns for a clearer first view.</span>
      <div class="plot-empty-actions">
        <button class="btn btn-primary btn-sm" id="timeseries-empty-upload-btn" type="button" aria-label="Open upload page">Upload data</button>
        <button class="btn btn-sm" id="timeseries-reset-range-btn" type="button" hidden>Reset to dataset range</button>
      </div>
    </div>

    <div id="main-chart-loading" class="chart-loading-overlay" hidden role="status" aria-live="polite" aria-label="Chart loading indicator">
      <div class="chart-loading-spinner"></div>
      <span class="chart-loading-label">Loading data…</span>
    </div>

    <div class="scatter-overlay-stack" id="timeseries-overlays">
      <div id="timeseries-colorbar-wrap" class="scatter-colorbar-wrap scatter-colorbar-wrap--ts" hidden role="group" aria-label="Numeric color column scale">
        <span id="timeseries-colorbar-name" class="scatter-colorbar-name">Color</span>
        <div class="scatter-colorbar-scale">
          <span id="timeseries-colorbar-min" class="scatter-colorbar-bound">0</span>
          <div id="timeseries-colorbar" class="scatter-colorbar"></div>
          <span id="timeseries-colorbar-max" class="scatter-colorbar-bound">1</span>
        </div>
      </div>
      <div id="timeseries-categorical-wrap" class="scatter-colorbar-wrap scatter-colorbar-wrap--ts" hidden role="group" aria-label="Categorical color legend">
        <span id="timeseries-categorical-name" class="scatter-colorbar-name">Category</span>
        <div id="timeseries-categorical-legend" class="scatter-distribution-legend" style="margin-top: 8px;"></div>
      </div>
    </div>
  </main>
</section>
```

---

## Feature Implementation Reference

This section documents all features implemented by the reference chart (`old_frontend/src/chart/DataChart.ts`) to guide re-implementation in the new frontend.

### Constants

| Constant | Value | Usage |
|---|---|---|
| `CHART_GRID` | `{ left: 120, right: 30, top: 16, bottom: 36 }` | Chart margins |
| `COLOR_BUCKETS` | `64` | Color batching granularity for color-by-column |
| `minDragPx` | `8` | Minimum drag for box-select zoom |
| `clickThresholdPx` | `4` | Maximum drag for click (not zoom) |
| `DEFAULT_ROLLING_WINDOW` | `50` | Sliding window size for rolling bands |
| `wheelZoomFactor` | `1.25` (in) / `0.8` (out) | Scroll wheel zoom factors |
| `zoomHistoryMax` | `5` | Maximum zoom history entries |

### 1. Interaction Features

#### 1.1 Box-Select Zoom
- **Function:** `initBoxZoom()` in `chartInteractions.ts`
- **Behavior:** Left-button drag draws selection rectangle; `≥8px` triggers zoom, `<4px` triggers click
- **CSS:** `border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15)`
- **Flow:** `pointerdown` → `pointermove` (updates box) → `pointerup` (fires `onZoom(min, max, 'user')`)
- **Data conversion:** `dragToDataRange()` converts CSS pixels to data range via plot area bounds

#### 1.2 Wheel Zoom
- **Function:** `initWheelZoom()` in `chartInteractions.ts`
- **Behavior:** Scroll zooms centered on cursor position
- **Factor:** `1.25` (zoom in, `deltaY > 0`) or `0.8` (zoom out, `deltaY < 0`)
- **Focal point:** `xNorm = (clientX - rect.left - plotLeft) / plotWidth`

#### 1.3 Double-Click Zoom-Out
- **Behavior:** Double-click without shift/ctrl fires `onZoomOutCallback`
- **Use:** Resets zoom to full dataset range

#### 1.4 Zoom History
- **Storage:** `appState.zoomHistory[]` (max 5 entries)
- **Entry:** `{ xMin, xMax, yMin, yMax }` snapshot of current view
- **Update:** On each zoom, `deps.getCurrentView()` pushes to history

#### 1.5 Draw Mode
- **Modes:** `'none'` (default), `'arrow'`, `'box'`
- **Activation:** `DataChart.setDrawMode(mode: string, color?: string, width?: number)`
- **Overlay:** When mode ≠ `'none'`, canvas overlay gets `pointer-events: auto`
- **Draw item:** `{ type, color, width, startX, startY, endX, endY }`

#### 1.6 Arrow Drawing
- **Render:** `_drawArrow()` on overlay canvas
- **Head:** 10px, angle ±30° from endpoint via `atan2`

#### 1.7 Box Drawing
- **Render:** `ctx.rect()` with clamped coordinates

#### 1.8 Crosshair & Tooltip
- **Event:** `chartInstance.on('crosshairMove', callback)` (ChartGPU)
- **Formatter:** `formatTimeTooltip()` for header; `formatTwoDecimals()` for values
- **Deduplication:** Via `baseSeriesName()` + `seen` Set

---

### 2. Visual Features

#### 2.1 Series Rendering
- **Entry:** `DataChart.updateDataMulti(dataObj: FilteredDataObject, columns: string[])`
- **Filtering:** Columns named `ts`, `timestamp`, `time` (case-insensitive) excluded
- **Downsampling markers:** When `dataObj._meta?.downsampled === false`, adds circle point annotations (≤500 points)

#### 2.2 Color-by-Column
- **Activation:** `appState.selectedColorColumn` set + `colorByColumn[colName]` array matches points length
- **Function:** `buildColorizedSeries()` in `colorScale.ts`
- **Batching:** 64 buckets to avoid creating thousands of ChartGPU series
- **Palettes:** viridis, plasma, magma, coolwarm, inferno (64 colors each)
- **Categorical:** `categoryColorFor()` assigns palette colors per category

#### 2.3 Numeric Colorbar
- **Elements:** `timeseries-colorbar-name`, `timeseries-colorbar-min`, `timeseries-colorbar`, `timeseries-colorbar-max`
- **Gradient:** `linear-gradient(90deg, viridis_colors)` on background
- **Trigger:** `scaleInfo.isNumeric === true`

#### 2.4 Categorical Legend
- **Elements:** `timeseries-categorical-name`, `timeseries-categorical-legend`
- **Items:** Swatch + label per category, via `categoryColorFor()`

#### 2.5 Rolling Bands
- **Data:** `RollingBandData[]` — `{ column, ts, mean, upper1, lower1, upper2, lower2 }`
- **Computation:** `computeFrontendRollingBands()` — sliding window centered, `Math.floor((windowSize-1)/2)` half-width
- **Formula:** `std = sqrt(max(0, sumSq/cnt - m*m))`; bounds = m ± std (1σ), m ± 2std (2σ)
- **Render:** `_renderRollingBandsToCtx()`
  - 2σ band: `rgba(100, 180, 255, 0.22)` filled polygon
  - 1σ band: `rgba(100, 180, 255, 0.38)` filled polygon
  - Mean line: `rgba(180, 220, 255, 0.90)`, width `1.5 * min(scale.x, scale.y)`, dashed `[6, 3]`

#### 2.6 Anomaly Regions
- **Data:** `AnomalyRegionData[]` — `{ column, method, start_ms, end_ms, score }`
- **Fetch:** `fetchAnomalyRegions()` → `appState.anomalyRegions`
- **Render:** `_renderAnomalyRegionsToCtx()`
  - Fill: `rgba(255, 74, 110, 0.15)`
  - Stroke: `rgba(255, 74, 110, 0.5)`
  - Clamp to visible range; min width 2px

#### 2.7 Annotations
- **Types:** `'note'`, `'callout'`, `'region'`, `'line'`, `'bookmark'`
- **Storage:** localStorage key `'edatime-annotations'` as JSON
- **Interface:** `id, type, title, content, timeRange {start,end}, position {x,y}, columns, color, page`
- **Render:** `_renderAnnotationsToCtx()`
  - Bookmark (`start === end`): vertical line + triangle marker + title
  - Note/region: shaded rect with dashed border + title
- **API:** `annotations.ts` — `createAnnotation()`, `updateAnnotation()`, `deleteAnnotation()`, `getAnnotationsForPage()`

#### 2.8 Adaptive Line Filters
- **Data:** `AdaptiveLineFilter[]` — `{ column, x1, y1, x2, y2, keepAbove }`
- **Preview:** `pendingAdaptivePoint` — single dot or two-point line
- **Render:** `_renderAdaptiveFilterLinesToCtx()`
  - Line: `rgba(0, 200, 150, 0.95)` if `keepAbove`, else `rgba(255, 74, 110, 0.95)`, dashed `[8, 6]`
  - Label: `"column keep above"` or `"column keep below"`
  - Pending dot: cyan `rgba(0, 212, 255, 0.95)` with white stroke
- **Y computation:** `buildAdaptiveLineY(filter, tsMs)` — linear interpolation

#### 2.9 Text Overlays (Chart Labels)
- **Elements:** `chart-title-overlay`, `chart-xlabel-overlay`, `chart-ylabel-overlay`
- **Init:** `_initTextOverlays()` creates absolute-positioned divs
- **Sync:** `_syncTextOverlays()` — sets `textContent`, shows if non-empty

---

### 3. Canvas Overlay System

- **Factory:** `createCanvasOverlay(container, onResize)` → `{ canvas, observer }`
- **Style:** `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:6`
- **DPR:** `window.devicePixelRatio` passed as scale `{x, y}` to all render methods
- **Render order:** `ChartOverlays.renderAll()` → rolling bands → anomaly regions → adaptive filters → annotations

---

### 4. Export Features

| Format | Function | Details |
|--------|----------|---------|
| PNG | `exportPNG()` | DPR-scaled canvas, downloads as `edatime_chart.png` |
| SVG | `exportSVG()` | PNG embedded + drawings as `<rect>`/`<path>`, includes `_exportSVGDrawings()` |
| HTML | `exportHTML()` | Single-page with embedded PNG |
| CSV | (in toolbar) | Exports filtered data via `/api/export` |

---

### 5. State Management

| State | Location | Key Fields |
|-------|----------|------------|
| `appState.selectedCols` | `state.ts` | Active time series columns |
| `appState.selectedColorColumn` | `state.ts` | Column for color-by |
| `appState.columnRanges` | `state.ts` | Per-column `{ from, to }` y-value ranges |
| `appState.adaptiveLineFilters` | `state.ts` | Active line filters |
| `appState.rollingBands` | `analyticsState.ts` | Rolling band data array |
| `appState.anomalyRegions` | `analyticsState.ts` | Anomaly region data array |
| `appState.rollingEnabled` | `analyticsState.ts` | Toggle for rolling bands overlay |
| `appState.anomalyEnabled` | `analyticsState.ts` | Toggle for anomaly regions overlay |
| `appState.zoomHistory` | `state.ts` | Zoom back-navigation stack |

---

### 6. Backend API Contracts

| Feature | Endpoint | Response |
|---------|----------|----------|
| Time series data | `GET /api/data?start=&end=&width=&columns=` | Arrow IPC |
| Rolling bands | `GET /api/analytics/rolling?start=&end=&columns=&window=` | `{ bands: [{ column, ts, mean, upper1, lower1, upper2, lower2 }] }` |
| Anomaly regions | `GET /api/analytics/anomalies?start=&end=&columns=&method=&threshold=` | `{ method, threshold, regions: [{ start_ms, end_ms, score }] }` |
| FFT | `GET /api/analytics/fft?start=&end=&columns=&max_points=` | `{ results: [{ frequencies, magnitudes, psd }] }` |
| Spectrogram | `GET /api/analytics/spectrogram?...` | Spectral data |
| Spectral filter | `POST /api/analytics/spectral-filter` | Filtered series preview |
| Export CSV | `GET /api/export/parquet?...` | Parquet file (also supports CSV format param) |

---

### 7. Missing Features in New Frontend

Features implemented in `old_frontend` but not yet in `frontend/src/`:

| # | Feature | Old Implementation | Gap |
|---|---------|---------------------|-----|
| 1 | Drawing (arrow/box) | `setDrawMode()`, `_drawings[]`, canvas overlay | UI exists, no handler |
| 2 | Annotations | `__edatimeAnnotations`, `_renderAnnotationsToCtx()` | Not implemented |
| 3 | Color-by-column | `buildColorizedSeries()`, colorbar UI | Per-series colors only |
| 4 | Rolling band overlay | `computeFrontendRollingBands()` + canvas render | AnalyticsDrawer toggle not wired |
| 5 | Anomaly region overlay | `fetchAnomalyRegions()` + canvas render | Not wired to chart |
| 6 | Mouse selection zoom | `initBoxZoom()` | Not implemented |
| 7 | Wheel zoom | `initWheelZoom()` | Not implemented |
| 8 | Chart title/axis labels | `_initTextOverlays()`, `setChartText()` | Panel not built |
| 9 | Export handlers | `exportPNG()`, `exportSVG()`, `exportHTML()` | Buttons exist, no handler |
| 10 | Zoom badge | `zoom-range-badge` element | Shows "—" |
| 11 | Adaptive line filters | `adaptiveLineFilters[]`, `buildAdaptiveLineY()` | Not implemented |
| 12 | Downsampling markers | `AnnotationConfig` point markers | Not implemented |
| 13 | Spectral filter preview | `spectralFilterPreview` series | Not implemented |
| 14 | Column range filter modal | `ColumnFilterModal` component | Exists but not wired to data flow |
| 15 | Zoom history navigation | `zoomHistory[]` | `zoomIn/zoomOut` exist but history not updated |

---

### 8. Key Method Signatures

```typescript
// Main chart entry
DataChart.updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void

// Coordinate conversion
DataChart.cssPointToData(clientX: number, clientY: number): { x: number; y: number } | null

// Zoom callbacks
DataChart.onZoomCallback(start: number, end: number, sourceKind: string): void
DataChart.onYRangeCallback(min: number, max: number, sourceKind: string): void

// Chart events
DataChart.onCrosshairMove(callback: (payload: ChartGPUCrosshairMovePayload) => void): void
DataChart.onClick(callback: (payload: ChartGPUEventPayload) => void): void

// Draw mode
DataChart.setDrawMode(mode: 'none' | 'arrow' | 'box', color?: string, width?: number): void
DataChart.clearDrawings(): void

// Export
DataChart.exportPNG(): Promise<void>
DataChart.exportSVG(): Promise<void>
DataChart.exportHTML(): Promise<void>

// Overlay factories
createCanvasOverlay(container: HTMLElement, onResize: () => void): { canvas: HTMLCanvasElement, observer: ResizeObserver }
initBoxZoom(opts: BoxZoomOptions): HTMLElement
initWheelZoom(opts: WheelZoomOptions): void

// Analytics computation
computeFrontendRollingBands(data: FilteredDataObject, cols: string[], windowSize: number): RollingBandData[]
fetchAnomalyRegions(fetchAnomalies: Function, signal?: AbortSignal): Promise<void>
```

---

## Screenshots

- `docs/screenshots/timeseries.png` — empty state (no columns selected)
- `docs/screenshots/timeseries-loaded.png` — (capture after loading a dataset)

---

## Notes

- The timeseries page does **not** have its own dedicated CSS module. All styles come from `toolbar.css`, `chart.css`, `layout.css`, `chips.css`, `scatter.css`, `controls.css`, and `loading-indicator.css`.
- The analytics drawer is technically outside `<main>` but is visually part of the page. It is rendered in the outer page wrapper and toggled via `hidden` attribute.
- "Transform…" and "Outliers…" buttons open modal dialogs (not yet fully documented here).