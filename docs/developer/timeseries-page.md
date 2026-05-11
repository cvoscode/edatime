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

## Screenshots

- `docs/screenshots/timeseries.png` — empty state (no columns selected)
- `docs/screenshots/timeseries-loaded.png` — (capture after loading a dataset)

---

## Notes

- The timeseries page does **not** have its own dedicated CSS module. All styles come from `toolbar.css`, `chart.css`, `layout.css`, `chips.css`, `scatter.css`, `controls.css`, and `loading-indicator.css`.
- The analytics drawer is technically outside `<main>` but is visually part of the page. It is rendered in the outer page wrapper and toggled via `hidden` attribute.
- "Transform…" and "Outliers…" buttons open modal dialogs (not yet fully documented here).