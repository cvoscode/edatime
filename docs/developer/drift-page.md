# Drift Analysis Page

**Page ID:** `drift`
**Route:** `#page=drift`
**Entry:** Sidebar nav (⌥0) or home card navigation
**CSS Module:** `frontend/css/modules/drift.css`

---

## Purpose

Compare a reference time window against subsequent windows to detect distribution shifts (drift). Uses PSI (Population Stability Index) and other metrics to flag minor and major drift. View drift as timeline overview + per-window detail charts with stats.

---

## HTML Structure

### Toolbar (lines 886–1012)

```html
<section class="page" id="page-drift" data-page-name="drift" hidden>
  <div class="toolbar drift-toolbar">
    <!-- Column picker + window + detail view -->
    <div class="toolbar-group">
      <span class="toolbar-label">Drift Analysis</span>
      <span class="scatter-inline-label">Columns</span>
      <!-- Custom column picker dropdown -->
      <div class="drift-col-picker" id="drift-col-picker-wrap">
        <button type="button" id="drift-col-picker-btn" class="btn btn-sm drift-col-picker-trigger"
          aria-haspopup="true" aria-expanded="false" aria-controls="drift-col-picker-panel">
          <span id="drift-col-picker-label">–</span>
          <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
            stroke-linejoin="round" width="10" height="6" aria-hidden="true">
            <polyline points="1 1 5 5 9 1" />
          </svg>
        </button>
        <div id="drift-col-picker-panel" class="drift-col-picker-panel" hidden role="dialog"
          aria-label="Select columns"
          style="position:absolute;top:calc(100% + 4px);left:0;z-index:300;background:var(--surface-2,#141c2e);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:10px;padding:8px;min-width:180px;max-height:300px;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.55);">
          <div class="drift-col-picker-actions"
            style="display:flex;gap:5px;padding-bottom:7px;margin-bottom:7px;border-bottom:1px solid var(--border,rgba(255,255,255,.1));">
            <button id="drift-cols-all" type="button" class="btn btn-xs">All</button>
            <button id="drift-cols-single" type="button" class="btn btn-xs">Single</button>
            <button id="drift-cols-none" type="button" class="btn btn-xs">None</button>
          </div>
          <div id="drift-col-picker-list" class="drift-col-picker-list" role="group" aria-label="Numeric columns"
            style="display:flex;flex-direction:column;gap:2px;">
            <!-- populated by driftPage.ts -->
          </div>
        </div>
      </div>
      <!-- hidden select for backward-compat JS -->
      <select id="drift-col-select" style="display:none;" multiple aria-hidden="true" tabindex="-1"></select>
      <label class="scatter-inline-label" for="drift-window-select">Window</label>
      <select id="drift-window-select" class="modal-select" style="width:82px;" aria-label="Temporal window size">
        <option value="hourly">Hourly</option>
        <option value="daily" selected>Daily</option>
        <option value="weekly">Weekly</option>
      </select>
      <label class="scatter-inline-label" for="drift-plot-type">Detail View</label>
      <select id="drift-plot-type" class="modal-select" style="width:130px;" aria-label="Plot style">
        <option value="box">Box plot</option>
        <option value="violin">Violin</option>
        <option value="ecdf">ECDF overlay</option>
        <option value="histogram">Histogram overlay</option>
      </select>
    </div>

    <!-- Reference window -->
    <div class="toolbar-group toolbar-group--sep">
      <span class="toolbar-label">Reference</span>
      <label class="scatter-inline-label" for="drift-ref-preset">Preset</label>
      <select id="drift-ref-preset" class="modal-select" style="width:140px;" aria-label="Reference window preset">
        <option value="30">First 30%</option>
        <option value="50" selected>First 50%</option>
        <option value="70">First 70%</option>
        <option value="custom">Custom</option>
      </select>
      <label class="scatter-inline-label" for="drift-ref-start">Start</label>
      <input id="drift-ref-start" type="datetime-local" class="modal-input" style="width:168px;" />
      <label class="scatter-inline-label" for="drift-ref-end">End</label>
      <input id="drift-ref-end" type="datetime-local" class="modal-input" style="width:168px;" />
    </div>

    <!-- Zoom controls -->
    <div class="toolbar-group toolbar-group--sep">
      <span class="toolbar-label">Zoom</span>
      <span class="toolbar-label">Drag in chart to box-zoom</span>
      <button id="drift-zoom-reset-btn" class="btn btn-sm" type="button" title="Reset chart zoom">Reset</button>
    </div>

    <!-- Compute + Export -->
    <div class="toolbar-group toolbar-group--push">
      <button id="drift-compute-btn" class="btn btn-accent btn-sm" type="button">Compute</button>
      <details class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">Timeline, detail, stats</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button id="drift-export-png" class="btn btn-sm" type="button" title="Export timeline as PNG (P)" disabled>PNG</button>
          <button id="drift-export-detail-png" class="btn btn-sm" type="button" title="Export detail panel as PNG" disabled>Detail</button>
          <button id="drift-export-csv" class="btn btn-sm" type="button" title="Export stats as CSV (E)" disabled>CSV</button>
          <button id="drift-export-json" class="btn btn-sm" type="button" title="Export full response as JSON (J)" disabled>JSON</button>
        </div>
      </details>
      <span class="toolbar-label" id="drift-status" role="status" aria-live="polite">Select one or more columns and reference window, then press Compute.</span>
    </div>
  </div>

  <!-- Page guidance -->
  <div class="page-guidance page-guidance--advanced">
    <span class="page-guidance__item"><strong>Best for</strong> Comparing a stable reference period against later windows to spot baseline shifts and degraded operating ranges.</span>
    <span class="page-guidance__item"><strong>Needs</strong> One or more numeric columns plus a trustworthy reference window from the beginning of the dataset or a known baseline interval.</span>
    <span class="page-guidance__item"><strong>Cost</strong> Moderate. Keep the column list short when iterating, then widen it once the reference setup looks right.</span>
  </div>

  <main class="main main--chart">
    <div class="drift-layout">
      <!-- Left: macro timeline + legend -->
      <div class="drift-timeline-panel">
        <div class="drift-timeline-canvas-wrap">
          <div id="drift-timeline-chart" role="img" aria-label="Drift timeline chart"></div>
        </div>
        <div class="drift-legend">
          <span class="drift-window-badge drift-window-badge--green"></span><span>No drift</span>
          <span class="drift-window-badge drift-window-badge--yellow"></span><span>Minor drift (PSI ≥ 0.1)</span>
          <span class="drift-window-badge drift-window-badge--red"></span><span>Major drift</span>
        </div>
      </div>

      <!-- Right: detail panel -->
      <div class="drift-detail-panel">
        <div class="drift-detail-header-row">
          <div id="drift-detail-header" class="drift-detail-header">Window Detail</div>
          <select id="drift-detail-col-select" class="modal-select" aria-label="Column for detail panel"></select>
        </div>
        <div id="drift-detail-chart" role="img" aria-label="Drift detail chart"></div>
        <div id="drift-detail-stats" class="drift-detail-stats" role="region" aria-live="polite" aria-label="Drift window details">
          <span style="color:var(--text-muted);font-size:0.72rem;">Select a window to see stats</span>
        </div>
        <div class="drift-list-controls">
          <span class="toolbar-label">Sort</span>
          <select id="drift-sort-select" class="modal-select" aria-label="Sort drift windows">
            <option value="time-asc" selected>Time: oldest first</option>
            <option value="time-desc">Time: newest first</option>
            <option value="psi-desc">PSI: highest first</option>
            <option value="wasserstein-desc">Wasserstein: highest first</option>
            <option value="severity-desc">Severity: red to green</option>
          </select>
        </div>
        <div id="drift-window-list" class="drift-window-list" role="listbox" aria-label="Drift windows list">
          <!-- populated by driftPage.ts -->
        </div>
      </div>
    </div>

    <div id="drift-empty" class="plot-empty-state" data-empty-reason="no-compute">
      <strong>No drift analysis yet</strong>
      <span>Select a column, adjust the reference window, and press Compute.</span>
    </div>
    <div id="drift-loading" class="chart-loading-overlay" hidden>
      <div class="chart-loading-spinner"></div>
      <span class="chart-loading-label">Computing drift…</span>
    </div>
  </main>
</section>
```

---

## CSS Classes

From `frontend/css/modules/drift.css`:

| Class | Element |
|---|---|
| `.drift-toolbar` | Main toolbar container |
| `.drift-col-picker` | Custom column picker wrapper (relative positioned) |
| `.drift-col-picker-trigger` | Button that opens the column picker dropdown |
| `.drift-col-picker-panel` | Dropdown panel with checkboxes for column selection |
| `.drift-col-picker-actions` | All/Single/None buttons in picker header |
| `.drift-col-picker-list` | List of column checkboxes |
| `.drift-layout` | Two-column layout: timeline (left) + detail (right) |
| `.drift-timeline-panel` | Left panel containing the timeline chart |
| `.drift-timeline-canvas-wrap` | Container for the timeline canvas |
| `.drift-legend` | Horizontal legend below timeline |
| `.drift-window-badge` | Small colored badge (green/yellow/red) |
| `.drift-window-badge--green` | No drift badge |
| `.drift-window-badge--yellow` | Minor drift badge |
| `.drift-window-badge--red` | Major drift badge |
| `.drift-detail-panel` | Right panel with per-window detail |
| `.drift-detail-header-row` | Header row of detail panel |
| `.drift-detail-header` | "Window Detail" title |
| `.drift-detail-chart` | Detail chart canvas |
| `.drift-detail-stats` | Stats region below detail chart |
| `.drift-list-controls` | Sort controls above window list |
| `.drift-window-list` | Scrollable list of drift windows |

---

## JavaScript Modules

### `frontend/src/drift/driftPage.ts` (assumed)

`initDriftPage()` — wires:
- Custom column picker: opens dropdown on button click, populates checkboxes from `appState.metadata.columns` (numeric only)
- Window size select (`hourly`/`daily`/`weekly`)
- Detail view select (`box`/`violin`/`ecdf`/`histogram`)
- Reference preset select → auto-fills start/end datetime inputs
- Custom reference start/end datetime inputs
- Zoom reset button
- "Compute" → calls backend drift API
- Export buttons (enabled after compute)
- Sort select → reorders the window list
- Window list click → updates detail chart and stats panel

### Backend API

**Compute drift:**
```
POST /api/drift/compute
Body: {
  "columns": ["colA", "colB"],
  "window": "daily"|"hourly"|"weekly",
  "reference": {
    "start": "ISO-datetime",
    "end": "ISO-datetime"
  },
  "plotType": "box"|"violin"|"ecdf"|"histogram"
}
Response: {
  "windows": [
    {
      "start": "ISO",
      "end": "ISO",
      "psi": 0.12,
      "wasserstein": 0.05,
      "severity": "minor",
      "stats": { "mean": ..., "std": ..., "min": ..., "max": ... }
    },
    ...
  ],
  "referenceStats": { "colA": { ... }, "colB": { ... } }
}
```

---

## Complete HTML Copy

```html
<section class="page" id="page-drift" data-page-name="drift" hidden>
  <div class="toolbar drift-toolbar">
    <div class="toolbar-group">
      <span class="toolbar-label">Drift Analysis</span>
      <span class="scatter-inline-label">Columns</span>
      <div class="drift-col-picker" id="drift-col-picker-wrap">
        <button type="button" id="drift-col-picker-btn" class="btn btn-sm drift-col-picker-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="drift-col-picker-panel">
          <span id="drift-col-picker-label">–</span>
          <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="10" height="6" aria-hidden="true"><polyline points="1 1 5 5 9 1"/></svg>
        </button>
        <div id="drift-col-picker-panel" class="drift-col-picker-panel" hidden role="dialog" aria-label="Select columns" style="position:absolute;top:calc(100% + 4px);left:0;z-index:300;background:var(--surface-2,#141c2e);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:10px;padding:8px;min-width:180px;max-height:300px;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.55);">
          <div class="drift-col-picker-actions" style="display:flex;gap:5px;padding-bottom:7px;margin-bottom:7px;border-bottom:1px solid var(--border,rgba(255,255,255,.1));">
            <button id="drift-cols-all" type="button" class="btn btn-xs">All</button>
            <button id="drift-cols-single" type="button" class="btn btn-xs">Single</button>
            <button id="drift-cols-none" type="button" class="btn btn-xs">None</button>
          </div>
          <div id="drift-col-picker-list" class="drift-col-picker-list" role="group" aria-label="Numeric columns" style="display:flex;flex-direction:column;gap:2px;"></div>
        </div>
      </div>
      <select id="drift-col-select" style="display:none;" multiple aria-hidden="true" tabindex="-1"></select>
      <label class="scatter-inline-label" for="drift-window-select">Window</label>
      <select id="drift-window-select" class="modal-select" style="width:82px;" aria-label="Temporal window size">
        <option value="hourly">Hourly</option><option value="daily" selected>Daily</option><option value="weekly">Weekly</option>
      </select>
      <label class="scatter-inline-label" for="drift-plot-type">Detail View</label>
      <select id="drift-plot-type" class="modal-select" style="width:130px;" aria-label="Plot style">
        <option value="box">Box plot</option><option value="violin">Violin</option><option value="ecdf">ECDF overlay</option><option value="histogram">Histogram overlay</option>
      </select>
    </div>
    <div class="toolbar-group toolbar-group--sep">
      <span class="toolbar-label">Reference</span>
      <label class="scatter-inline-label" for="drift-ref-preset">Preset</label>
      <select id="drift-ref-preset" class="modal-select" style="width:140px;" aria-label="Reference window preset">
        <option value="30">First 30%</option><option value="50" selected>First 50%</option><option value="70">First 70%</option><option value="custom">Custom</option>
      </select>
      <label class="scatter-inline-label" for="drift-ref-start">Start</label>
      <input id="drift-ref-start" type="datetime-local" class="modal-input" style="width:168px;" />
      <label class="scatter-inline-label" for="drift-ref-end">End</label>
      <input id="drift-ref-end" type="datetime-local" class="modal-input" style="width:168px;" />
    </div>
    <div class="toolbar-group toolbar-group--sep">
      <span class="toolbar-label">Zoom</span>
      <span class="toolbar-label">Drag in chart to box-zoom</span>
      <button id="drift-zoom-reset-btn" class="btn btn-sm" type="button" title="Reset chart zoom">Reset</button>
    </div>
    <div class="toolbar-group toolbar-group--push">
      <button id="drift-compute-btn" class="btn btn-accent btn-sm" type="button">Compute</button>
      <details class="toolbar-disclosure toolbar-disclosure--end">
        <summary class="toolbar-disclosure__summary">
          <span class="toolbar-label">Export</span>
          <span class="toolbar-disclosure__value">Timeline, detail, stats</span>
        </summary>
        <div class="toolbar-disclosure__menu">
          <button id="drift-export-png" class="btn btn-sm" type="button" title="Export timeline as PNG (P)" disabled>PNG</button>
          <button id="drift-export-detail-png" class="btn btn-sm" type="button" title="Export detail panel as PNG" disabled>Detail</button>
          <button id="drift-export-csv" class="btn btn-sm" type="button" title="Export stats as CSV (E)" disabled>CSV</button>
          <button id="drift-export-json" class="btn btn-sm" type="button" title="Export full response as JSON (J)" disabled>JSON</button>
        </div>
      </details>
      <span class="toolbar-label" id="drift-status" role="status" aria-live="polite">Select one or more columns and reference window, then press Compute.</span>
    </div>
  </div>

  <div class="page-guidance page-guidance--advanced">
    <span class="page-guidance__item"><strong>Best for</strong> Comparing a stable reference period against later windows to spot baseline shifts and degraded operating ranges.</span>
    <span class="page-guidance__item"><strong>Needs</strong> One or more numeric columns plus a trustworthy reference window from the beginning of the dataset or a known baseline interval.</span>
    <span class="page-guidance__item"><strong>Cost</strong> Moderate. Keep the column list short when iterating, then widen it once the reference setup looks right.</span>
  </div>

  <main class="main main--chart">
    <div class="drift-layout">
      <div class="drift-timeline-panel">
        <div class="drift-timeline-canvas-wrap">
          <div id="drift-timeline-chart" role="img" aria-label="Drift timeline chart"></div>
        </div>
        <div class="drift-legend">
          <span class="drift-window-badge drift-window-badge--green"></span><span>No drift</span>
          <span class="drift-window-badge drift-window-badge--yellow"></span><span>Minor drift (PSI ≥ 0.1)</span>
          <span class="drift-window-badge drift-window-badge--red"></span><span>Major drift</span>
        </div>
      </div>
      <div class="drift-detail-panel">
        <div class="drift-detail-header-row">
          <div id="drift-detail-header" class="drift-detail-header">Window Detail</div>
          <select id="drift-detail-col-select" class="modal-select" aria-label="Column for detail panel"></select>
        </div>
        <div id="drift-detail-chart" role="img" aria-label="Drift detail chart"></div>
        <div id="drift-detail-stats" class="drift-detail-stats" role="region" aria-live="polite" aria-label="Drift window details">
          <span style="color:var(--text-muted);font-size:0.72rem;">Select a window to see stats</span>
        </div>
        <div class="drift-list-controls">
          <span class="toolbar-label">Sort</span>
          <select id="drift-sort-select" class="modal-select" aria-label="Sort drift windows">
            <option value="time-asc" selected>Time: oldest first</option>
            <option value="time-desc">Time: newest first</option>
            <option value="psi-desc">PSI: highest first</option>
            <option value="wasserstein-desc">Wasserstein: highest first</option>
            <option value="severity-desc">Severity: red to green</option>
          </select>
        </div>
        <div id="drift-window-list" class="drift-window-list" role="listbox" aria-label="Drift windows list"></div>
      </div>
    </div>
    <div id="drift-empty" class="plot-empty-state" data-empty-reason="no-compute">
      <strong>No drift analysis yet</strong>
      <span>Select a column, adjust the reference window, and press Compute.</span>
    </div>
    <div id="drift-loading" class="chart-loading-overlay" hidden>
      <div class="chart-loading-spinner"></div>
      <span class="chart-loading-label">Computing drift…</span>
    </div>
  </main>
</section>
```

---

## Screenshots

- `docs/screenshots/drift.png` — empty state with timeline structure visible

---

## Notes

- The column picker is a custom dropdown (not a native `<select multiple>`) for better UX with checkboxes and All/Single/None quick actions.
- Severity thresholds: green (PSI < 0.1), yellow (0.1 ≤ PSI < 0.2), red (PSI ≥ 0.2).
- The timeline chart shows all windows as vertical bands colored by severity. Clicking a band shows that window's detail.
- Detail chart can be box plot, violin, ECDF overlay, or histogram overlay depending on the `drift-plot-type` selection.
- Export buttons are disabled until after a successful compute.