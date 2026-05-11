# Correlations (Heatmap) Page

**Page ID:** `heatmap`
**Route:** `#page=heatmap`
**Entry:** Sidebar nav (⌥7) or home card navigation
**CSS Module:** `frontend/css/modules/scatter.css` (shared with Scatter page)

---

## Purpose

Full correlation matrix heatmap across all numeric columns. Use to quickly identify strongly correlated pairs, then jump to Scatter for detailed inspection.

---

## HTML Structure

### Toolbar (lines 654–683)

```html
<section class="page" id="page-heatmap" data-page-name="heatmap" hidden>
  <div class="toolbar">
    <div class="toolbar-group">
      <span class="toolbar-label">Correlation Heatmap</span>
      <label class="scatter-inline-label" for="heatmap-metric">Metric</label>
      <select id="heatmap-metric" class="modal-select" aria-label="Correlation metric">
        <option value="pearson" selected>Pearson</option>
        <option value="spearman">Spearman</option>
      </select>
      <label class="scatter-inline-label" for="heatmap-cell-size">Size</label>
      <input id="heatmap-cell-size" type="range" min="24" max="72" step="4" value="36"
        aria-label="Heatmap cell size">
      <span id="heatmap-cell-size-value" class="range-value">36</span>
    </div>
    <div class="toolbar-group toolbar-group--push">
      <details class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">Image + CSV</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button id="heatmap-export-png-btn" class="btn btn-ghost btn-sm" type="button">PNG</button>
          <button id="heatmap-export-svg-btn" class="btn btn-ghost btn-sm" type="button">SVG</button>
          <button id="heatmap-export-html-btn" class="btn btn-ghost btn-sm" type="button">HTML</button>
          <button id="heatmap-export-csv-btn" class="btn btn-ghost btn-sm" type="button">CSV</button>
        </div>
      </details>
      <span class="toolbar-label" id="heatmap-status">Loading…</span>
    </div>
  </div>

  <main class="main main--padded">
    <div id="heatmap-container" class="heatmap-container"></div>
    <div id="heatmap-empty-state" class="plot-empty-state" data-empty-reason="no-data" hidden>
      Correlation heatmap will appear here once the dataset is available.
    </div>
  </main>
</section>
```

---

## CSS Classes

From `scatter.css` and `chart.css`:

| Class | Element |
|---|---|
| `.heatmap-container` | Grid container for the heatmap cells |
| `.main--padded` | Gives the main area padding |

The heatmap itself is rendered as an HTML table or canvas inside `heatmap-container` by the heatmap rendering module.

---

## JavaScript Modules

### `frontend/src/heatmap/heatmapPage.ts` (assumed location)

- `initHeatmapPage()` — initializes correlation computation
- Metric selector (`pearson` vs `spearman`) triggers re-computation
- Cell size slider updates CSS custom property or re-renders
- Cell click → navigates to scatter page with that pair pre-selected
- Export handlers call chart canvas export or data export

### Backend API

**Correlation matrix:**
```
GET /api/correlations/matrix?metric=pearson
Response: {
  "columns": ["colA", "colB", "colC"],
  "matrix": [[1.0, 0.72, -0.31], [0.72, 1.0, 0.45], [-0.31, 0.45, 1.0]]
}
```

**Correlation suggestions** (used by scatter page too):
```
GET /api/correlations/suggestions?threshold=0.70
Response: { "pairs": [{ "x": "colA", "y": "colB", "pearson": 0.85, "spearman": 0.81 }, ...] }
```

---

## Complete HTML Copy

```html
<section class="page" id="page-heatmap" data-page-name="heatmap" hidden>
  <div class="toolbar">
    <div class="toolbar-group">
      <span class="toolbar-label">Correlation Heatmap</span>
      <label class="scatter-inline-label" for="heatmap-metric">Metric</label>
      <select id="heatmap-metric" class="modal-select" aria-label="Correlation metric">
        <option value="pearson" selected>Pearson</option>
        <option value="spearman">Spearman</option>
      </select>
      <label class="scatter-inline-label" for="heatmap-cell-size">Size</label>
      <input id="heatmap-cell-size" type="range" min="24" max="72" step="4" value="36"
        aria-label="Heatmap cell size">
      <span id="heatmap-cell-size-value" class="range-value">36</span>
    </div>
    <div class="toolbar-group toolbar-group--push">
      <details class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">Image + CSV</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button id="heatmap-export-png-btn" class="btn btn-ghost btn-sm" type="button">PNG</button>
          <button id="heatmap-export-svg-btn" class="btn btn-ghost btn-sm" type="button">SVG</button>
          <button id="heatmap-export-html-btn" class="btn btn-ghost btn-sm" type="button">HTML</button>
          <button id="heatmap-export-csv-btn" class="btn btn-ghost btn-sm" type="button">CSV</button>
        </div>
      </details>
      <span class="toolbar-label" id="heatmap-status">Loading…</span>
    </div>
  </div>
  <main class="main main--padded">
    <div id="heatmap-container" class="heatmap-container"></div>
    <div id="heatmap-empty-state" class="plot-empty-state" data-empty-reason="no-data" hidden>
      Correlation heatmap will appear here once the dataset is available.
    </div>
  </main>
</section>
```

---

## Screenshots

- `docs/screenshots/heatmap.png` — empty state ("Not enough numeric columns")

---

## Notes

- Clicking a heatmap cell navigates to Scatter page with that pair auto-selected.
- The guided workflow on this page says "Use the heatmap to pick a promising relationship, then inspect it in Scatter."
- Color scale is typically a diverging scale (red = negative, white = 0, blue = positive) for correlation values in [-1, 1].