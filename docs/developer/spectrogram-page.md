# Spectrogram Page

**Page ID:** `spectrogram`
**Route:** `#page=spectrogram`
**Entry:** Sidebar nav (⌥8) or home card navigation
**CSS Module:** `frontend/css/modules/chart.css` (shared)

---

## Purpose

Time-frequency heatmap (spectrogram) for a single numeric column. Shows how the frequency content of a signal changes over time using short-time FFT. Heavier computation than FFT page; start with narrower time ranges.

---

## HTML Structure

### Toolbar (lines 692–727)

```html
<section class="page" id="page-spectrogram" data-page-name="spectrogram" hidden>
  <div class="toolbar">
    <div class="toolbar-group">
      <span class="toolbar-label">Spectrogram</span>
      <label class="scatter-inline-label" for="spectrogram-col-select">Column</label>
      <select id="spectrogram-col-select" class="modal-select" aria-label="Column"></select>
      <label class="scatter-inline-label" for="spectrogram-win-size">Window</label>
      <select id="spectrogram-win-size" class="modal-select" aria-label="FFT window size">
        <option value="64">64</option>
        <option value="128">128</option>
        <option value="256" selected>256</option>
        <option value="512">512</option>
        <option value="1024">1024</option>
      </select>
      <label class="scatter-link-toggle" for="spectrogram-log-scale">
        <input id="spectrogram-log-scale" type="checkbox" checked>
        <span>Log scale</span>
      </label>
    </div>
    <div class="toolbar-group toolbar-group--push">
      <details class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">Image + HTML</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button id="spectrogram-export-png-btn" class="btn btn-ghost btn-sm" type="button">PNG</button>
          <button id="spectrogram-export-svg-btn" class="btn btn-ghost btn-sm" type="button">SVG</button>
          <button id="spectrogram-export-html-btn" class="btn btn-ghost btn-sm" type="button">HTML</button>
        </div>
      </details>
      <button id="spectrogram-zoom-reset-btn" class="btn btn-ghost btn-sm" type="button">Reset zoom</button>
      <button id="spectrogram-compute-btn" class="btn btn-accent btn-sm" type="button">Compute</button>
      <span class="toolbar-label" id="spectrogram-status">Select a column and press Compute.</span>
    </div>
  </div>

  <!-- Page guidance -->
  <div class="page-guidance page-guidance--advanced">
    <span class="page-guidance__item"><strong>Best for</strong> Regime changes, non-stationary periodic behavior,
      and seeing when energy shifts over time.</span>
    <span class="page-guidance__item"><strong>Needs</strong> One numeric column, a focused time range, and a
      window size matched to the pattern duration you care about.</span>
    <span class="page-guidance__item"><strong>Cost</strong> Heavier than FFT because each compute rebuilds a
      time-frequency grid. Start with a narrower range before scaling up.</span>
  </div>

  <main class="main main--chart">
    <div id="spectrogram-chart" style="width:100%;height:100%;display:block;"></div>
    <div id="spectrogram-empty-state" class="plot-empty-state" data-empty-reason="no-columns-selected">
      <strong>No spectrogram yet</strong>
      <span>Pick a numeric column, keep the current time range, and click Compute.</span>
    </div>
    <div id="spectrogram-loading" class="chart-loading-overlay" hidden>
      <div class="chart-loading-spinner"></div>
      <span class="chart-loading-label">Computing spectrogram…</span>
    </div>
  </main>
</section>
```

---

## CSS Classes

| Class | Element |
|---|---|
| `.main--chart` | Main area with chart-specific styling |
| `.spectrogram-chart` | Container div for the spectrogram canvas |
| `.spectrogram-empty-state` | Empty state overlay |
| `.spectrogram-loading` | Loading overlay |

---

## JavaScript Modules

### `frontend/src/spectrogram/spectrogramPage.ts` (assumed)

`initSpectrogramPage()` — wires:
- Column select dropdown → populated with numeric columns
- Window size select (64, 128, 256, 512, 1024)
- Log scale checkbox
- "Compute" button → calls backend spectrogram API, renders heatmap
- Export buttons → canvas export
- Zoom reset → `chart.resetZoom()`

### Backend API

**Compute spectrogram:**
```
POST /api/spectrogram/compute
Body: {
  "column": "colA",
  "start": "ISO",
  "end": "ISO",
  "windowSize": 256,
  "logScale": true
}
Response: {
  "frequencies": [...],      // Y axis (Hz)
  "times": [...],            // X axis (timestamps)
  "power": [[...], ...]      // 2D matrix of power values
}
```

---

## Complete HTML Copy

```html
<section class="page" id="page-spectrogram" data-page-name="spectrogram" hidden>
  <div class="toolbar">
    <div class="toolbar-group">
      <span class="toolbar-label">Spectrogram</span>
      <label class="scatter-inline-label" for="spectrogram-col-select">Column</label>
      <select id="spectrogram-col-select" class="modal-select" aria-label="Column"></select>
      <label class="scatter-inline-label" for="spectrogram-win-size">Window</label>
      <select id="spectrogram-win-size" class="modal-select" aria-label="FFT window size">
        <option value="64">64</option>
        <option value="128">128</option>
        <option value="256" selected>256</option>
        <option value="512">512</option>
        <option value="1024">1024</option>
      </select>
      <label class="scatter-link-toggle" for="spectrogram-log-scale">
        <input id="spectrogram-log-scale" type="checkbox" checked>
        <span>Log scale</span>
      </label>
    </div>
    <div class="toolbar-group toolbar-group--push">
      <details class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">Image + HTML</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button id="spectrogram-export-png-btn" class="btn btn-ghost btn-sm" type="button">PNG</button>
          <button id="spectrogram-export-svg-btn" class="btn btn-ghost btn-sm" type="button">SVG</button>
          <button id="spectrogram-export-html-btn" class="btn btn-ghost btn-sm" type="button">HTML</button>
        </div>
      </details>
      <button id="spectrogram-zoom-reset-btn" class="btn btn-ghost btn-sm" type="button">Reset zoom</button>
      <button id="spectrogram-compute-btn" class="btn btn-accent btn-sm" type="button">Compute</button>
      <span class="toolbar-label" id="spectrogram-status">Select a column and press Compute.</span>
    </div>
  </div>

  <div class="page-guidance page-guidance--advanced">
    <span class="page-guidance__item"><strong>Best for</strong> Regime changes, non-stationary periodic behavior, and seeing when energy shifts over time.</span>
    <span class="page-guidance__item"><strong>Needs</strong> One numeric column, a focused time range, and a window size matched to the pattern duration you care about.</span>
    <span class="page-guidance__item"><strong>Cost</strong> Heavier than FFT because each compute rebuilds a time-frequency grid. Start with a narrower range before scaling up.</span>
  </div>

  <main class="main main--chart">
    <div id="spectrogram-chart" style="width:100%;height:100%;display:block;"></div>
    <div id="spectrogram-empty-state" class="plot-empty-state" data-empty-reason="no-columns-selected">
      <strong>No spectrogram yet</strong>
      <span>Pick a numeric column, keep the current time range, and click Compute.</span>
    </div>
    <div id="spectrogram-loading" class="chart-loading-overlay" hidden>
      <div class="chart-loading-spinner"></div>
      <span class="chart-loading-label">Computing spectrogram…</span>
    </div>
  </main>
</section>
```

---

## Screenshots

- `docs/screenshots/spectrogram.png` — empty state

---

## Notes

- Unlike FFT (which can show multiple traces overlaid), Spectrogram is always single-column.
- Window size affects frequency resolution: larger windows give finer frequency resolution but coarser time resolution, and vice versa.
- Log scale on the power (color intensity) axis helps visualize wide dynamic ranges.