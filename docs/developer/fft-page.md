# FFT / PSD Page

**Page ID:** `fft`
**Route:** `#page=fft`
**Entry:** Sidebar nav (⌥6) or home card navigation
**CSS Module:** `frontend/css/modules/chart.css` (shared)

---

## Purpose

Frequency-domain analysis of selected time-series traces. Compute FFT magnitude or power spectral density (PSD) for 1–3 selected traces. Supports spectral filtering (low-pass, high-pass, band-pass, band-stop) with a "Preview" button that overlays the filtered signal on the Timeseries chart.

---

## HTML Structure

### Toolbar (lines 581–631)

```html
<section class="page" id="page-fft" data-page-name="fft" hidden>
  <div class="toolbar">
    <!-- FFT mode + log scale -->
    <div class="toolbar-group">
      <span class="toolbar-label">FFT / Power Spectral Density</span>
      <label class="scatter-inline-label" for="fft-mode-select">Mode</label>
      <select id="fft-mode-select" class="modal-select" aria-label="FFT display mode">
        <option value="magnitude">Magnitude</option>
        <option value="psd">PSD</option>
      </select>
      <label class="scatter-link-toggle" for="fft-log-scale">
        <input id="fft-log-scale" type="checkbox" checked>
        <span>Log scale</span>
      </label>
    </div>

    <!-- Spectral filter controls -->
    <div class="toolbar-group toolbar-group--sep">
      <span class="toolbar-label">Filter</span>
      <select id="fft-filter-type" class="modal-select" aria-label="Spectral filter type"
        title="Apply frequency-domain filter to preview on timeseries">
        <option value="none">Off</option>
        <option value="lowpass">Low-pass</option>
        <option value="highpass">High-pass</option>
        <option value="bandpass">Band-pass</option>
        <option value="bandstop">Band-stop</option>
      </select>
      <label class="scatter-inline-label" for="fft-filter-low-hz" title="Low cutoff (Hz)">Low Hz</label>
      <input id="fft-filter-low-hz" type="number" class="modal-input" min="0" step="0.001" placeholder="0"
        style="width:68px;" title="Low frequency cutoff (Hz)">
      <label class="scatter-inline-label" for="fft-filter-high-hz" title="High cutoff (Hz)">High Hz</label>
      <input id="fft-filter-high-hz" type="number" class="modal-input" min="0" step="0.001" placeholder="auto"
        style="width:68px;" title="High frequency cutoff (Hz)">
      <button id="fft-filter-apply-btn" class="btn btn-ghost btn-sm" type="button"
        title="Preview filtered signal on timeseries page">Preview</button>
      <span id="fft-filter-status" class="scatter-panel-status" style="font-size:11px;"></span>
    </div>

    <!-- Export + zoom -->
    <div class="toolbar-group toolbar-group--push">
      <details class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">Image + CSV</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button id="fft-export-png-btn" class="btn btn-ghost btn-sm" type="button">PNG</button>
          <button id="fft-export-svg-btn" class="btn btn-ghost btn-sm" type="button">SVG</button>
          <button id="fft-export-html-btn" class="btn btn-ghost btn-sm" type="button">HTML</button>
          <button id="fft-export-csv-btn" class="btn btn-ghost btn-sm" type="button">CSV</button>
        </div>
      </details>
      <button id="fft-zoom-reset-btn" class="btn btn-ghost btn-sm" type="button" hidden>↩ Zoom out</button>
      <span class="toolbar-label" id="fft-status">Select a column chip below.</span>
    </div>
  </div>

  <!-- Page guidance (Best for / Needs / Cost) -->
  <div class="page-guidance page-guidance--advanced">
    <span class="page-guidance__item"><strong>Best for</strong> Stable periodic structure, dominant frequencies,
      and quick filter previews after you narrow the trace list.</span>
    <span class="page-guidance__item"><strong>Needs</strong> One to three numeric traces and a meaningful time
      zoom from the Timeseries page.</span>
    <span class="page-guidance__item"><strong>Cost</strong> Fast enough for iteration. Move to Spectrogram when
      the frequency content changes over time.</span>
  </div>

  <!-- Trace selection bar (chips) -->
  <div class="fft-traces-bar" id="fft-traces-bar" hidden></div>

  <main class="main">
    <div id="fft-chart" style="width:100%;height:100%;"></div>
    <div id="fft-empty-state" class="plot-empty-state" data-empty-reason="no-columns-selected">
      <strong>Select one or more traces</strong>
      <span>Choose column chips below to compute FFT or PSD overlays for this range.</span>
    </div>
    <div id="fft-chart-loading" class="chart-loading-overlay" hidden>
      <div class="chart-loading-spinner"></div>
      <span class="chart-loading-label">Computing FFT…</span>
    </div>
  </main>
</section>
```

---

## CSS Classes

| Class | Element |
|---|---|
| `.page-guidance` | "Best for / Needs / Cost" info row |
| `.page-guidance--advanced` | Modifier for advanced analysis pages |
| `.fft-traces-bar` | Horizontal scrollable bar of trace chips |
| `.fft-chart` | Container div for the FFT line chart |
| `.scatter-panel-status` | Used for filter status text |
| `.toolbar-disclosure__menu` | Dropdown menu for export options |

---

## JavaScript Modules

### `frontend/src/fft/fftPage.ts` (assumed)

`initFftPage()` — wires:
- Mode select (`magnitude` vs `psd`) — re-renders chart
- Log scale checkbox — re-renders chart with log Y axis
- Filter type + Low/High Hz inputs + Preview button
  - "Preview" calls backend filter API then sets `appState.spectralFilterPreview` and overlays on timeseries
- Export menu items → chart canvas export
- Zoom reset button → `chart.resetZoom()`
- Trace chips bar → click to toggle trace inclusion

### Backend API

**Compute FFT:**
```
POST /api/fft/compute
Body: {
  "columns": ["colA", "colB"],
  "start": "ISO",
  "end": "ISO",
  "mode": "magnitude"|"psd",
  "logScale": true
}
Response: {
  "frequencies": [0.0, 0.1, 0.2, ...],
  "traces": [
    { "column": "colA", "values": [...] },
    { "column": "colB", "values": [...] }
  ]
}
```

**Spectral filter preview:**
```
POST /api/fft/filter
Body: {
  "column": "colA",
  "start": "ISO",
  "end": "ISO",
  "filterType": "lowpass"|"highpass"|"bandpass"|"bandstop",
  "lowHz": 0.5,
  "highHz": 2.0
}
Response: { "ts": [...], "values": [...], "column": "colA" }
```

---

## Complete HTML Copy

```html
<section class="page" id="page-fft" data-page-name="fft" hidden>
  <div class="toolbar">
    <div class="toolbar-group">
      <span class="toolbar-label">FFT / Power Spectral Density</span>
      <label class="scatter-inline-label" for="fft-mode-select">Mode</label>
      <select id="fft-mode-select" class="modal-select" aria-label="FFT display mode">
        <option value="magnitude">Magnitude</option>
        <option value="psd">PSD</option>
      </select>
      <label class="scatter-link-toggle" for="fft-log-scale">
        <input id="fft-log-scale" type="checkbox" checked>
        <span>Log scale</span>
      </label>
    </div>
    <div class="toolbar-group toolbar-group--sep">
      <span class="toolbar-label">Filter</span>
      <select id="fft-filter-type" class="modal-select" aria-label="Spectral filter type">
        <option value="none">Off</option>
        <option value="lowpass">Low-pass</option>
        <option value="highpass">High-pass</option>
        <option value="bandpass">Band-pass</option>
        <option value="bandstop">Band-stop</option>
      </select>
      <label class="scatter-inline-label" for="fft-filter-low-hz">Low Hz</label>
      <input id="fft-filter-low-hz" type="number" class="modal-input" min="0" step="0.001" placeholder="0" style="width:68px;">
      <label class="scatter-inline-label" for="fft-filter-high-hz">High Hz</label>
      <input id="fft-filter-high-hz" type="number" class="modal-input" min="0" step="0.001" placeholder="auto" style="width:68px;">
      <button id="fft-filter-apply-btn" class="btn btn-ghost btn-sm" type="button">Preview</button>
      <span id="fft-filter-status" class="scatter-panel-status" style="font-size:11px;"></span>
    </div>
    <div class="toolbar-group toolbar-group--push">
      <details class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">Image + CSV</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button id="fft-export-png-btn" class="btn btn-ghost btn-sm" type="button">PNG</button>
          <button id="fft-export-svg-btn" class="btn btn-ghost btn-sm" type="button">SVG</button>
          <button id="fft-export-html-btn" class="btn btn-ghost btn-sm" type="button">HTML</button>
          <button id="fft-export-csv-btn" class="btn btn-ghost btn-sm" type="button">CSV</button>
        </div>
      </details>
      <button id="fft-zoom-reset-btn" class="btn btn-ghost btn-sm" type="button" hidden>↩ Zoom out</button>
      <span class="toolbar-label" id="fft-status">Select a column chip below.</span>
    </div>
  </div>

  <div class="page-guidance page-guidance--advanced">
    <span class="page-guidance__item"><strong>Best for</strong> Stable periodic structure, dominant frequencies, and quick filter previews after you narrow the trace list.</span>
    <span class="page-guidance__item"><strong>Needs</strong> One to three numeric traces and a meaningful time zoom from the Timeseries page.</span>
    <span class="page-guidance__item"><strong>Cost</strong> Fast enough for iteration. Move to Spectrogram when the frequency content changes over time.</span>
  </div>

  <div class="fft-traces-bar" id="fft-traces-bar" hidden></div>

  <main class="main">
    <div id="fft-chart" style="width:100%;height:100%;"></div>
    <div id="fft-empty-state" class="plot-empty-state" data-empty-reason="no-columns-selected">
      <strong>Select one or more traces</strong>
      <span>Choose column chips below to compute FFT or PSD overlays for this range.</span>
    </div>
    <div id="fft-chart-loading" class="chart-loading-overlay" hidden>
      <div class="chart-loading-spinner"></div>
      <span class="chart-loading-label">Computing FFT…</span>
    </div>
  </main>
</section>
```

---

## Screenshots

- `docs/screenshots/fft.png` — empty state with guidance text

---

## Notes

- FFT page shares the `fft-traces-bar` with the Causal page (both use it for column chip selection).
- The "Preview" button is the key integration point with the Timeseries page: it applies a frequency-domain filter and sets `appState.spectralFilterPreview = { column, ts, values }`, which the timeseries chart picks up and renders as an additional `[filtered]` trace.
- Zoom on the FFT chart is independent of the timeseries zoom; it applies to the frequency axis only.