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

---

## Layout notes (2026-07-11 refactor)

The spectrogram toolbar was refactored to fit a single row at ≥1280 px and
to mirror patterns already proven on the FFT page. See
`superpowers/plans/2026-07-11-spectrogram-ui-improvements.md` for the full
plan, before/after measurements, and verification matrix.

### Toolbar

- **Eyebrows hidden.** The segment-level labels (`Display`, `Export`, `Zoom`)
  are removed because each field already carries its own label (`Column`,
  `Window`, `Hop`, `Scale`, `Normalize`, `Clip`). Reclaiming ~120 px of
  horizontal space lets the toolbar fit one row from 1280 px upward.
- **Inline export icons.** The Export disclosure menu (`Format → Image + HTML`)
  was replaced with three flat buttons (PNG / SVG / HTML) inside the
  `.fft-export-icons` group. The pattern is shared verbatim with the FFT
  page; do not reintroduce a disclosure here without also reconsidering FFT.
- **Inline clip band.** `Clip method` and `Clip %` live inside
  `#spectrogram-clip-band` and the `.is-hidden` class is toggled by
  `syncClipEnabled()` in `spectrogramChartRuntime.ts`. Mirrors the FFT
  `.fft-filter-band` pattern.
- **Right-aligned actions cluster.** The actions segment carries the
  `toolbar-group--push` modifier so `Reset`, the export icons, and `Compute`
  stay grouped on the right edge at every viewport.

### Results context panel

`#spectrogram-summary` is a floating info card anchored to the top-right
of the chart. It cannot live inside `#spectrogram-chart` because ECharts
overwrites the chart container's children when it initializes; it lives
as a sibling of `.spectrogram-chart-row` inside `<main>` instead. The
runtime populates four fields:

- **Sample rate** — derived from `(times.length - 1) * 1000 / span`.
- **Nyquist** — half the sample rate.
- **Time points** — `times.length` formatted with `toLocaleString()`.
- **Freq bins** — `frequencies.length` formatted with `toLocaleString()`.

The pre-existing single-line summary text ("Spectrogram of HUFL · Window
96 · Hop 48 · z-score → [0,1] · Peak 11.57 µHz") is preserved on
`aria-label` for screen readers and tooltip-style disclosure.

### Colorbar

- Width increased from 72 px to **84 px** to keep `High / Low` tick
  labels readable at 1280–1600 px.
- Touch targets enlarged to 24 × 12 px (vertical) / 12 × 22 px (mobile)
  so the slider handles clear WCAG 2.5.5 baseline (≥24 × 24 in either
  dimension).
- The `Z-SCORE → [0,1]` annotation uses `text-overflow: ellipsis` at
  ≤720 px so it never overflows the colorbar track on small screens.

### Responsive ladder

| Width | Toolbar rows | Clip band | Colorbar | Sidebar |
|-------|--------------|-----------|----------|---------|
| ≥1280 px | 1 | inline (collapsed) | right side, 84 px | full labels |
| 1024–1279 px | 1 (some selects truncate) | inline | right side, 84 px | ellipsis |
| 720–1023 px | 2 | inline | right side, 84 px | ellipsis |
| 480–719 px | 2 | inline | below chart, horizontal | ellipsis |
| ≤480 px | 2 (stacked) | inline | below chart, compact | icons only |

### Conventions to preserve

- **No new dependencies, no Tailwind / CSS-in-JS.** All new rules are
  scoped under `#page-spectrogram` selectors and live in
  `frontend/css/modules/{layout,toolbar,chart,sidebar}.css`.
- **Inline Export icons are the standard.** Any new analysis page should
  use `.fft-export-icons` rather than re-introducing a disclosure.
- **Inline clip band is the standard.** `.fft-filter-band` (FFT) and
  `.spectrogram-clip-band` share the same `is-hidden` toggle pattern.
- **App-shell grid uses `minmax(220px, 1fr) minmax(0, 4fr)`.** This lets
  the sidebar collapse to its minimum without overflowing mid-word.
  See `frontend/css/modules/layout.css` `.app-layout` and the matching
  tablet overrides in `responsive.css`.
- Log scale on the power (color intensity) axis helps visualize wide dynamic ranges.