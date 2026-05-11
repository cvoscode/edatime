# Scatter Page

**Page ID:** `scatter`
**Route:** `#page=scatter`
**Entry:** Sidebar nav (⌥3) or home card navigation, or jump from Correlations/Heatmap
**CSS Module:** `frontend/css/modules/scatter.css`

---

## Purpose

Detailed pairwise scatter/density plot with matrix view. Inspect X/Y correlation, color-by a third column, view marginal distributions, and access FFT of the current time range inline in the matrix view.

---

## HTML Structure

### Toolbar (lines 398–482)

```html
<section class="page" id="page-scatter" data-page-name="scatter" hidden>
  <div class="toolbar scatter-toolbar">
    <!-- View toggle: Plot | Matrix -->
    <div class="toolbar-group">
      <span class="toolbar-label">View</span>
      <div class="btn-toggle-group scatter-view-toggle" role="group" aria-label="Scatter page view">
        <button type="button" class="btn active" id="scatter-view-plot-btn" aria-pressed="true"
          data-scatter-view="plot">Plot</button>
        <button type="button" class="btn" id="scatter-view-matrix-btn" aria-pressed="false"
          data-scatter-view="matrix">Matrix</button>
      </div>
    </div>

    <!-- Analytics controls: X, Y, Mode, Distribution, Link range -->
    <div class="toolbar-group" id="scatter-analytics-group">
      <span class="toolbar-label">Analytics</span>
      <label class="scatter-inline-label" for="scatter-x-col">X</label>
      <select id="scatter-x-col" class="modal-select" aria-label="Scatter X column"></select>
      <label class="scatter-inline-label" for="scatter-y-col">Y</label>
      <select id="scatter-y-col" class="modal-select" aria-label="Scatter Y column"></select>
      <span id="scatter-mode-label" class="toolbar-label">Mode</span>
      <select id="scatter-render-mode" class="modal-select" aria-label="Scatter render mode">
        <option value="density" selected>Density</option>
        <option value="scatter">Scatter</option>
      </select>
      <label class="scatter-inline-label" for="scatter-diagonal-mode">Distribution</label>
      <select id="scatter-diagonal-mode" class="modal-select" aria-label="Distribution plot mode">
        <option value="histogram" selected>Histogram</option>
        <option value="kde">KDE</option>
        <option value="boxplot">Box Plot</option>
      </select>
      <label class="scatter-link-toggle" for="scatter-link-brush">
        <input id="scatter-link-brush" type="checkbox" checked>
        <span>Link chart range</span>
      </label>
    </div>

    <!-- Color controls (disclosure menu) -->
    <div class="toolbar-group toolbar-group--push">
      <details id="scatter-color-controls" class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Color</span>
          <span class="toolbar-disclosure__value">By column</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <select id="scatter-color-column" class="modal-select" aria-label="Scatter color-by column">
            <option value="">None</option>
          </select>
          <select id="scatter-color-scale" class="modal-select" aria-label="Scatter color scale">
            <option value="viridis">Viridis</option>
            <option value="plasma">Plasma</option>
            <option value="inferno">Inferno</option>
          </select>
        </div>
      </details>

      <!-- Density controls -->
      <div id="scatter-density-controls" class="scatter-toolbar-group-inline">
        <span class="toolbar-label">Density</span>
        <label class="scatter-inline-label" for="scatter-bin-size">Bins</label>
        <input id="scatter-bin-size" type="range" min="2" max="64" step="1" value="10" style="width:110px;"
          aria-label="Scatter bin size">
        <span id="scatter-bin-size-value" class="range-value">10</span>
        <select id="scatter-colormap" class="modal-select" aria-label="Density colormap">
          <option value="viridis">Viridis</option>
          <option value="inferno">Inferno</option>
          <option value="plasma">Plasma</option>
        </select>
        <select id="scatter-normalization" class="modal-select" aria-label="Density normalization">
          <option value="linear">Linear</option>
          <option value="log">Log</option>
        </select>
      </div>

      <!-- Export menu (disclosure) -->
      <details class="toolbar-disclosure toolbar-disclosure--end scatter-export-group">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">PNG, CSV, JSON</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button class="btn btn-ghost btn-sm" id="scatter-export-png-btn" type="button">PNG</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-svg-btn" type="button">SVG</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-html-btn" type="button">HTML</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-csv-btn" type="button">CSV</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-json-btn" type="button">JSON</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-parquet-btn" type="button">Parquet</button>
        </div>
      </details>
    </div>
  </div>
```

### Analysis toolbar — stats bar (lines 484–492)

```html
  <div class="analysis-toolbar scatter-stats-bar">
    <span id="scatter-total-points">Total points: —</span>
    <span id="scatter-binned-points">Visible points: —</span>
    <span id="scatter-active-filter-badge" class="scatter-filter-badge" hidden></span>
    <span id="scatter-current-pair" class="scatter-filter-badge">Pair: X vs Y</span>
    <span id="scatter-pearson">Pearson: —</span>
    <span id="scatter-spearman">Spearman: —</span>
    <button class="btn btn-ghost btn-sm" id="scatter-open-causal-btn" type="button">Open in Causal</button>
  </div>
```

### Suggestions bar (lines 494–504)

```html
  <div class="range-toolbar scatter-suggestions-bar">
    <span id="scatter-suggestions-label" class="toolbar-label">Suggestions (|corr| ≥ 0.70)</span>
    <div class="scatter-suggestions-controls">
      <label class="scatter-inline-label" for="scatter-suggestion-threshold">Threshold</label>
      <input id="scatter-suggestion-threshold" type="range" min="0.30" max="0.95" step="0.05" value="0.70"
        aria-label="Correlation suggestion threshold">
      <span id="scatter-suggestion-threshold-value" class="range-value">0.70</span>
      <span id="scatter-active-pair-label" class="scatter-filter-badge">Inspecting X vs Y</span>
    </div>
    <div id="scatter-suggestions" class="scatter-suggestions"></div>
  </div>
```

### Plot view (lines 506–535)

```html
  <div class="scatter-view" data-scatter-view-panel="plot">
    <main class="main">
      <canvas id="scatter-marginal-x" class="scatter-marginal-x" aria-hidden="true" hidden></canvas>
      <div id="scatter-chart"></div>
      <div id="scatter-empty-state" class="plot-empty-state" hidden>
        <strong id="scatter-empty-title">Choose scatter axes</strong>
        <span id="scatter-empty-message">Choose X and Y numeric columns to render the scatter plot.</span>
        <div class="plot-empty-actions">
          <button class="btn btn-sm" id="scatter-reset-range-btn" type="button" hidden>Reset to dataset range</button>
          <button class="btn btn-sm" id="scatter-clear-filters-btn" type="button" hidden>Clear active filters</button>
        </div>
      </div>
      <div id="scatter-chart-loading" class="chart-loading-overlay" hidden>
        <div class="chart-loading-spinner"></div>
      </div>
      <div id="scatter-right-panel" class="scatter-right-panel" hidden>
        <canvas id="scatter-marginal-y" class="scatter-marginal-y-right" aria-hidden="true"></canvas>
        <div id="scatter-colorbar-wrap" class="scatter-colorbar-vertical" hidden>
          <span id="scatter-colorbar-max" class="scatter-colorbar-vtick">1.00</span>
          <canvas id="scatter-colorbar" class="scatter-colorbar-vbar" aria-hidden="true"></canvas>
          <span id="scatter-colorbar-min" class="scatter-colorbar-vtick">0.00</span>
          <span id="scatter-colorbar-name" class="scatter-colorbar-vname">Color</span>
        </div>
      </div>
      <div id="scatter-correlation-overlay" class="scatter-correlation-overlay" hidden></div>
      <div id="scatter-error" class="scatter-error" hidden></div>
    </main>
  </div>
```

### Matrix view (lines 537–577)

```html
  <div class="scatter-view" data-scatter-view-panel="matrix" hidden>
    <div class="scatter-panel">
      <div class="scatter-panel-head">
        <span class="toolbar-label">Scatter Matrix</span>
        <span id="scatter-matrix-status" class="scatter-panel-status">Shows pairwise scatter plots with configurable diagonal distributions.</span>
        <div class="scatter-matrix-controls">
          <span class="scatter-inline-label">Cells</span>
          <div class="btn-toggle-group" role="group" aria-label="Matrix cell render mode">
            <button type="button" class="btn active" id="scatter-matrix-mode-scatter" aria-pressed="true"
              data-matrix-mode="scatter">Scatter</button>
            <button type="button" class="btn" id="scatter-matrix-mode-density" aria-pressed="false"
              data-matrix-mode="density">Density</button>
          </div>
          <input type="hidden" id="scatter-matrix-mode" value="scatter">
          <label class="scatter-inline-label" for="scatter-matrix-cell-size">Size</label>
          <input id="scatter-matrix-cell-size" type="range" min="80" max="320" step="20" value="160"
            style="width:90px;" aria-label="Matrix cell size">
          <span id="scatter-matrix-cell-size-value" class="range-value">160</span>
          <label class="scatter-link-toggle" for="scatter-matrix-link-range">
            <input id="scatter-matrix-link-range" type="checkbox" aria-label="Link chart time range to scatter matrix">
            <span>Link range</span>
          </label>
        </div>
      </div>
      <div id="scatter-matrix" class="scatter-matrix"></div>
      <div id="scatter-matrix-loading" class="chart-loading-overlay" hidden>
        <div class="chart-loading-spinner"></div>
        <span class="chart-loading-label">Loading scatter…</span>
      </div>
    </div>
    <div class="scatter-panel scatter-matrix-fft-panel" id="scatter-matrix-fft-panel" hidden>
      <div class="scatter-panel-head">
        <span class="toolbar-label">FFT / PSD</span>
        <span id="scatter-matrix-fft-status" class="scatter-panel-status"></span>
      </div>
      <div id="scatter-matrix-fft-charts" class="scatter-matrix-fft-charts"></div>
    </div>
  </div>
</section>
```

---

## CSS Classes

From `frontend/css/modules/scatter.css`:

| Class | Element |
|---|---|
| `.scatter-toolbar` | Main toolbar container |
| `.scatter-view-toggle` | Plot/Matrix toggle button group |
| `.scatter-inline-label` | Labels like X, Y, Mode, Bins |
| `.scatter-link-toggle` | Checkbox + text inline control |
| `.scatter-density-controls` | Bin size / colormap / normalization controls |
| `.scatter-export-group` | Export disclosure menu |
| `.scatter-stats-bar` | Analysis toolbar with stats |
| `.scatter-filter-badge` | Badge showing current pair, active filter |
| `.scatter-suggestions-bar` | Correlation suggestions row |
| `.scatter-suggestions` | Chip list of suggested pairs |
| `.scatter-view` | View container (plot or matrix), toggled via `hidden` |
| `.scatter-marginal-x` | Top marginal histogram canvas |
| `.scatter-marginal-y-right` | Right marginal histogram canvas |
| `.scatter-colorbar-vertical` | Vertical colorbar when color-by is active |
| `.scatter-colorbar-vtick` | Min/max labels on vertical colorbar |
| `.scatter-correlation-overlay` | Pearson/Spearman overlay text |
| `.scatter-error` | Error display area |
| `.scatter-matrix` | Grid of matrix cells |
| `.scatter-matrix-fft-panel` | Inline FFT panel at bottom of matrix view |
| `.scatter-matrix-fft-charts` | FFT charts container |
| `.scatter-panel` | Panel wrapper for matrix sections |
| `.scatter-panel-head` | Header row of matrix panel |
| `.scatter-panel-status` | Status/instruction text |

---

## JavaScript Modules

### `frontend/src/scatter/scatterPage.ts` (679 lines)

`initScatterPage()` — initializes the scatter page:

- **View management:** toggles between Plot view and Matrix view via `data-scatter-view` attributes. Only one view is visible at a time.
- **X/Y column selectors:** populated with all numeric columns from `appState.metadata`
- **Render mode:** `density` (2D histogram heatmap) or `scatter` (raw points)
- **Diagonal mode:** `histogram`, `kde`, or `boxplot` for diagonal cells in matrix
- **Color-by:** sets `appState.selectedColorColumn` and re-renders
- **Brush linking:** when `scatter-link-brush` is checked, time range brush on scatter syncs to timeseries page via `edatime:chart-range-change` event
- **Matrix FFT panel:** inline FFT charts below the matrix, shown when `scatter-matrix-fft-panel` is not hidden; populated via `scatter-matrix-fft-charts`
- **Open in Causal:** calls `openScatterPairInCausal()` → navigates to causal page with pre-selected pair

### Key state / events

| Event | Handler | Effect |
|---|---|---|
| `edatime:chart-range-change` | Matrix view range link | Refetches scatter data for new range |
| `edatime:workflow-refresh` | `initScatterPage` | Updates suggestion chips |
| `scatter:x-col` change | — | Triggers scatter re-render |
| `scatter:y-col` change | — | Triggers scatter re-render |
| `scatter-view-plot-btn` click | — | Shows plot view, hides matrix |
| `scatter-view-matrix-btn` click | — | Shows matrix view, hides plot |

### Backend API

**Scatter data fetch:**
```
POST /api/scatter/range
Body: { "xCol": "colA", "yCol": "colB", "start": "ISO", "end": "ISO",
        "width": 1200, "colorCol": "colC" | null,
        "renderMode": "density"|"scatter",
        "binSize": 10, "normalization": "linear"|"log" }
Response: { "x": [...], "y": [...], "colorBy": [...] }  // for scatter mode
         { "density": [[...]], "xedges": [...], "yedges": [...] }  // for density mode
```

**Correlation suggestions:**
```
GET /api/correlations/suggestions?threshold=0.70
Response: { "pairs": [{ "x": "colA", "y": "colB", "pearson": 0.85 }, ...] }
```

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Alt+3` | Navigate to scatter page |
| `Alt+4` | Open scatter matrix view (same page, switches view) |

---

## Complete HTML Copy (for recreation)

```html
<section class="page" id="page-scatter" data-page-name="scatter" hidden>
  <div class="toolbar scatter-toolbar">
    <div class="toolbar-group">
      <span class="toolbar-label">View</span>
      <div class="btn-toggle-group scatter-view-toggle" role="group" aria-label="Scatter page view">
        <button type="button" class="btn active" id="scatter-view-plot-btn" aria-pressed="true" data-scatter-view="plot">Plot</button>
        <button type="button" class="btn" id="scatter-view-matrix-btn" aria-pressed="false" data-scatter-view="matrix">Matrix</button>
      </div>
    </div>
    <div class="toolbar-group" id="scatter-analytics-group">
      <span class="toolbar-label">Analytics</span>
      <label class="scatter-inline-label" for="scatter-x-col">X</label>
      <select id="scatter-x-col" class="modal-select" aria-label="Scatter X column"></select>
      <label class="scatter-inline-label" for="scatter-y-col">Y</label>
      <select id="scatter-y-col" class="modal-select" aria-label="Scatter Y column"></select>
      <span id="scatter-mode-label" class="toolbar-label">Mode</span>
      <select id="scatter-render-mode" class="modal-select" aria-label="Scatter render mode">
        <option value="density" selected>Density</option>
        <option value="scatter">Scatter</option>
      </select>
      <label class="scatter-inline-label" for="scatter-diagonal-mode">Distribution</label>
      <select id="scatter-diagonal-mode" class="modal-select" aria-label="Distribution plot mode">
        <option value="histogram" selected>Histogram</option>
        <option value="kde">KDE</option>
        <option value="boxplot">Box Plot</option>
      </select>
      <label class="scatter-link-toggle" for="scatter-link-brush">
        <input id="scatter-link-brush" type="checkbox" checked>
        <span>Link chart range</span>
      </label>
    </div>
    <div class="toolbar-group toolbar-group--push">
      <details id="scatter-color-controls" class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Color</span>
          <span class="toolbar-disclosure__value">By column</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <select id="scatter-color-column" class="modal-select" aria-label="Scatter color-by column"><option value="">None</option></select>
          <select id="scatter-color-scale" class="modal-select" aria-label="Scatter color scale">
            <option value="viridis">Viridis</option><option value="plasma">Plasma</option><option value="inferno">Inferno</option>
          </select>
        </div>
      </details>
      <div id="scatter-density-controls" class="scatter-toolbar-group-inline">
        <span class="toolbar-label">Density</span>
        <label class="scatter-inline-label" for="scatter-bin-size">Bins</label>
        <input id="scatter-bin-size" type="range" min="2" max="64" step="1" value="10" style="width:110px;" aria-label="Scatter bin size">
        <span id="scatter-bin-size-value" class="range-value">10</span>
        <select id="scatter-colormap" class="modal-select" aria-label="Density colormap">
          <option value="viridis">Viridis</option><option value="inferno">Inferno</option><option value="plasma">Plasma</option>
        </select>
        <select id="scatter-normalization" class="modal-select" aria-label="Density normalization">
          <option value="linear">Linear</option><option value="log">Log</option>
        </select>
      </div>
      <details class="toolbar-disclosure toolbar-disclosure--end scatter-export-group">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">PNG, CSV, JSON</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button class="btn btn-ghost btn-sm" id="scatter-export-png-btn" type="button">PNG</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-svg-btn" type="button">SVG</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-html-btn" type="button">HTML</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-csv-btn" type="button">CSV</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-json-btn" type="button">JSON</button>
          <button class="btn btn-ghost btn-sm" id="scatter-export-parquet-btn" type="button">Parquet</button>
        </div>
      </details>
    </div>
  </div>

  <div class="analysis-toolbar scatter-stats-bar">
    <span id="scatter-total-points">Total points: —</span>
    <span id="scatter-binned-points">Visible points: —</span>
    <span id="scatter-active-filter-badge" class="scatter-filter-badge" hidden></span>
    <span id="scatter-current-pair" class="scatter-filter-badge">Pair: X vs Y</span>
    <span id="scatter-pearson">Pearson: —</span>
    <span id="scatter-spearman">Spearman: —</span>
    <button class="btn btn-ghost btn-sm" id="scatter-open-causal-btn" type="button">Open in Causal</button>
  </div>

  <div class="range-toolbar scatter-suggestions-bar">
    <span id="scatter-suggestions-label" class="toolbar-label">Suggestions (|corr| ≥ 0.70)</span>
    <div class="scatter-suggestions-controls">
      <label class="scatter-inline-label" for="scatter-suggestion-threshold">Threshold</label>
      <input id="scatter-suggestion-threshold" type="range" min="0.30" max="0.95" step="0.05" value="0.70" aria-label="Correlation suggestion threshold">
      <span id="scatter-suggestion-threshold-value" class="range-value">0.70</span>
      <span id="scatter-active-pair-label" class="scatter-filter-badge">Inspecting X vs Y</span>
    </div>
    <div id="scatter-suggestions" class="scatter-suggestions"></div>
  </div>

  <!-- Plot view -->
  <div class="scatter-view" data-scatter-view-panel="plot">
    <main class="main">
      <canvas id="scatter-marginal-x" class="scatter-marginal-x" aria-hidden="true" hidden></canvas>
      <div id="scatter-chart"></div>
      <div id="scatter-empty-state" class="plot-empty-state" hidden>
        <strong id="scatter-empty-title">Choose scatter axes</strong>
        <span id="scatter-empty-message">Choose X and Y numeric columns to render the scatter plot.</span>
        <div class="plot-empty-actions">
          <button class="btn btn-sm" id="scatter-reset-range-btn" type="button" hidden>Reset to dataset range</button>
          <button class="btn btn-sm" id="scatter-clear-filters-btn" type="button" hidden>Clear active filters</button>
        </div>
      </div>
      <div id="scatter-chart-loading" class="chart-loading-overlay" hidden><div class="chart-loading-spinner"></div></div>
      <div id="scatter-right-panel" class="scatter-right-panel" hidden>
        <canvas id="scatter-marginal-y" class="scatter-marginal-y-right" aria-hidden="true"></canvas>
        <div id="scatter-colorbar-wrap" class="scatter-colorbar-vertical" hidden>
          <span id="scatter-colorbar-max" class="scatter-colorbar-vtick">1.00</span>
          <canvas id="scatter-colorbar" class="scatter-colorbar-vbar" aria-hidden="true"></canvas>
          <span id="scatter-colorbar-min" class="scatter-colorbar-vtick">0.00</span>
          <span id="scatter-colorbar-name" class="scatter-colorbar-vname">Color</span>
        </div>
      </div>
      <div id="scatter-correlation-overlay" class="scatter-correlation-overlay" hidden></div>
      <div id="scatter-error" class="scatter-error" hidden></div>
    </main>
  </div>

  <!-- Matrix view -->
  <div class="scatter-view" data-scatter-view-panel="matrix" hidden>
    <div class="scatter-panel">
      <div class="scatter-panel-head">
        <span class="toolbar-label">Scatter Matrix</span>
        <span id="scatter-matrix-status" class="scatter-panel-status">Shows pairwise scatter plots with configurable diagonal distributions.</span>
        <div class="scatter-matrix-controls">
          <span class="scatter-inline-label">Cells</span>
          <div class="btn-toggle-group" role="group" aria-label="Matrix cell render mode">
            <button type="button" class="btn active" id="scatter-matrix-mode-scatter" aria-pressed="true" data-matrix-mode="scatter">Scatter</button>
            <button type="button" class="btn" id="scatter-matrix-mode-density" aria-pressed="false" data-matrix-mode="density">Density</button>
          </div>
          <input type="hidden" id="scatter-matrix-mode" value="scatter">
          <label class="scatter-inline-label" for="scatter-matrix-cell-size">Size</label>
          <input id="scatter-matrix-cell-size" type="range" min="80" max="320" step="20" value="160" style="width:90px;" aria-label="Matrix cell size">
          <span id="scatter-matrix-cell-size-value" class="range-value">160</span>
          <label class="scatter-link-toggle" for="scatter-matrix-link-range">
            <input id="scatter-matrix-link-range" type="checkbox" aria-label="Link chart time range to scatter matrix">
            <span>Link range</span>
          </label>
        </div>
      </div>
      <div id="scatter-matrix" class="scatter-matrix"></div>
      <div id="scatter-matrix-loading" class="chart-loading-overlay" hidden>
        <div class="chart-loading-spinner"></div>
        <span class="chart-loading-label">Loading scatter…</span>
      </div>
    </div>
    <div class="scatter-panel scatter-matrix-fft-panel" id="scatter-matrix-fft-panel" hidden>
      <div class="scatter-panel-head">
        <span class="toolbar-label">FFT / PSD</span>
        <span id="scatter-matrix-fft-status" class="scatter-panel-status"></span>
      </div>
      <div id="scatter-matrix-fft-charts" class="scatter-matrix-fft-charts"></div>
    </div>
  </div>
</section>
```

---

## Screenshots

- `docs/screenshots/scatter.png` — empty state with guided workflow
- `docs/screenshots/heatmap.png` — (correlations page, related)
- `docs/screenshots/scatter-matrix.png` — (matrix view, not yet captured)

---

## Notes

- Scatter page does **not** lazy-load via `pageLoaders.ts` — it is included in the main bundle (frequently used).
- The "Open in Causal" button pre-selects the current X/Y pair on the causal page.
- Correlation suggestions are computed server-side and filtered by `threshold` slider. The suggestions bar shows chips for each promising pair; clicking a chip sets X and Y columns and triggers render.
- Matrix view FFT panel is an inline time-frequency analysis that appears below the matrix when a cell is selected and the panel is not hidden.