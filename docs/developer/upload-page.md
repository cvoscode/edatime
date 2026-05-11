# Upload Page Documentation

## Overview

The Upload page (`page-upload`) handles all data ingestion into the application. It supports two ingestion paths:

1. **File upload** — CSV or Parquet files via drag-and-drop or file picker
2. **Database connection** — PostgreSQL or TimescaleDB via connection string

The page is divided into two main areas:
- **Upload panel** (left side) — Source selection, file drop zone, load options, and action buttons
- **File Preview** (bottom, full width) — Column profile table showing schema and statistics

---

## HTML Structure

```html
<section class="page page-upload" id="page-upload" data-page-name="upload">
```

### Layout

The page uses a 3-column CSS grid for the upload panel:

```
upload-inner (grid: minmax(260px,1fr) minmax(240px,1fr) minmax(200px,280px))
├── upload-source-tabs (spans all 3 columns)
├── upload-source-panel (file) (spans all 3 columns)
│   ├── drop-zone
│   ├── partial-section (load options)
│   └── upload-actions
└── upload-source-panel (database) (spans all 3 columns)
    └── db-section

upload-preview (below, full width)
├── upload-preview-head
└── profile-grid
```

---

## File Upload Panel

### Source Tabs

```html
<div class="upload-source-tabs" role="tablist" aria-label="Upload source">
  <button class="btn btn-sm active" id="upload-source-file-btn" type="button" role="tab"
    aria-selected="true" data-upload-source="file">File</button>
  <button class="btn btn-sm btn-ghost" id="upload-source-database-btn" type="button" role="tab"
    aria-selected="false" data-upload-source="database">Database</button>
</div>
```

**Behavior:** Clicking tabs shows/hides the corresponding panel (`file` or `database`). ARIA roles are set so screen readers understand the tab pattern.

### Drop Zone

```html
<div class="drop-zone" id="drop-zone" role="button" tabindex="0"
  aria-label="Drop CSV or Parquet file here or browse for a file">
  <svg>...</svg>
  <span class="dz-title">Drop CSV or Parquet here</span>
  <span class="dz-sub">or</span>
  <button class="btn btn-ghost" id="browse-btn" type="button">Browse file</button>
  <input type="file" id="file-upload" accept=".csv,.parquet" hidden>
  <span class="dz-filename" id="file-name-display" role="status" aria-live="polite"></span>
</div>
```

**Interactions:**
- Click anywhere on drop zone → opens file picker (except clicking Browse button)
- Drag file over zone → adds `.dragover` class (visual feedback)
- Drop file → triggers preview
- File picker change → triggers preview

**States:**
- Default: dashed border, muted icon
- Hover: accent border, accent icon, subtle glow
- Dragover: accent border (solid), scaled up slightly, brighter glow
- With file: shows filename in `.dz-filename` pill

### Load Options (Partial Section)

```html
<div class="partial-section">
  <div class="partial-section-title">Load options</div>

  <!-- Toggle -->
  <label class="toggle-row" id="partial-toggle-row">
    <span class="switch">
      <input type="checkbox" id="partial-enabled">
      <span class="switch-slider"></span>
    </span>
    <span>
      <div class="toggle-label-text">Partial load</div>
      <div class="toggle-sub">Limit the rows ingested from the file</div>
    </span>
  </label>

  <!-- Fields (shown when toggle is on) -->
  <div class="partial-fields" id="partial-fields">
    <div class="field-group">
      <label for="n-rows-input">Max rows to load</label>
      <div class="row">
        <input type="number" id="n-rows-input" placeholder="All rows" min="1" step="1000">
        <input type="range" id="n-rows-range" min="1000" max="5000000" step="1000" value="1000000">
        <span class="range-value" id="n-rows-display">1 000 000</span>
      </div>
    </div>
    <div class="field-group">
      <label for="skip-rows-input">Skip first N rows</label>
      <input type="number" id="skip-rows-input" placeholder="0" min="0" value="0">
      <div class="field-hint">Skip rows at the top of the file (e.g., header rows)</div>
    </div>
    <div class="field-group">
      <label>Time range (optional)</label>
      <div class="row row-time">
        <input type="datetime-local" id="time-start-input">
        <input type="datetime-local" id="time-end-input">
      </div>
      <div class="time-range-hint" id="time-range-hint">Detected range will appear after preview.</div>
    </div>
    <div class="field-group">
      <label for="time-column-select">Time column</label>
      <select id="time-column-select" class="modal-select">
        <option value="">Auto-detect</option>
      </select>
      <div class="field-hint">Required when file has multiple time-like columns</div>
    </div>
  </div>
</div>
```

**Partial fields visibility:** Controlled by `#partial-enabled` checkbox. When unchecked, `.partial-fields` has `max-height: 0; opacity: 0`. When checked, transitions to `max-height: 500px; opacity: 1`.

### Upload Actions

```html
<div class="upload-actions">
  <button class="btn btn-primary" id="upload-btn" type="button">
    Upload & Ingest
  </button>
  <div class="progress-bar-wrap" id="progress-wrap" style="display:none" role="progressbar">
    <div class="progress-bar" id="progress-bar"></div>
  </div>
  <div class="upload-status" id="upload-status" role="status" aria-live="polite"></div>
</div>
```

---

## Database Panel

```html
<div class="upload-source-panel" data-upload-source-panel="database" hidden>
  <div class="db-section">
    <div class="partial-section-title">Database Connection</div>
    <p class="toggle-sub">Connect to PostgreSQL or TimescaleDB...</p>

    <div class="db-fields" id="db-fields">
      <div class="field-group">
        <label for="db-backend-select">Backend</label>
        <select id="db-backend-select">
          <option value="timescale">TimescaleDB</option>
          <option value="postgres">PostgreSQL</option>
        </select>
      </div>
      <div class="field-group">
        <label for="db-connection-input">Connection string</label>
        <input type="text" id="db-connection-input" placeholder="postgres://user:pass@host/db">
      </div>
      <div class="field-group">
        <label for="db-schema-input">Schema</label>
        <input type="text" id="db-schema-input" value="public">
      </div>
      <div class="field-group" id="db-table-group">
        <label for="db-table-select">Table / Hypertable</label>
        <div class="db-table-row">
          <select id="db-table-select">
            <option value="">— connect first —</option>
          </select>
          <input type="text" id="db-table-input" placeholder="or type name">
        </div>
      </div>
      <div class="field-group">
        <label for="db-time-col-input">Time column</label>
        <input type="text" id="db-time-col-input" placeholder="Auto-detect">
      </div>
      <div class="db-btn-row">
        <button class="btn btn-primary" id="db-connect-btn">Connect</button>
        <button class="btn btn-primary" id="db-load-btn" disabled>Load data</button>
        <button class="btn btn-ghost" id="db-disconnect-btn" hidden>Disconnect</button>
      </div>
      <div class="upload-status" id="db-status"></div>
    </div>
  </div>
</div>
```

---

## File Preview / Profile Grid

```html
<div class="upload-preview">
  <div class="upload-preview-head">
    <span class="toolbar-label">File Preview</span>
    <span class="profile-mode-badge" id="profile-mode-badge" data-mode="dataset">Current dataset</span>
    <div class="upload-preview-selection">
      <button class="btn btn-select" id="profile-select-all-btn">All</button>
      <button class="btn btn-select" id="profile-select-none-btn">None</button>
    </div>
    <input type="text" id="profile-filter-input" class="column-filter-input" placeholder="Filter columns…">
    <span class="upload-preview-status" id="upload-preview-status">Select a file to preview columns</span>
  </div>

  <div class="profile-grid" id="profile-grid" role="table" aria-label="Column profile table">
    <div class="profile-grid-header" role="row">
      <div class="profile-col profile-col-check">
        <input id="profile-select-all-checkbox" type="checkbox" aria-label="Select all upload columns">
      </div>
      <div class="profile-col profile-col-name">Column</div>
      <div class="profile-col profile-col-type">Type</div>
      <div class="profile-col profile-col-count">Non-null</div>
      <div class="profile-col profile-col-count">Nulls</div>
      <div class="profile-col profile-col-num">Min</div>
      <div class="profile-col profile-col-num">Max</div>
      <div class="profile-col profile-col-hist">Distribution</div>
    </div>
    <div class="profile-grid-viewport" id="profile-grid-viewport">
      <div class="profile-grid-spacer" id="profile-grid-spacer">
        <div class="profile-grid-rows" id="profile-grid-rows"></div>
      </div>
    </div>
  </div>
</div>
```

**Profile mode badge states:**
- `data-mode="dataset"` — Shows current loaded dataset (green pill)
- `data-mode="preview"` — Shows pending upload preview (blue pill with pulse animation)

---

## CSS Styles

### Key Classes from `upload.css`

```css
/* Page */
.page-upload { flex: 1; overflow: auto; background: var(--bg-primary); }

/* Upload inner 3-column grid */
.upload-inner {
  padding: 20px 24px 24px;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(240px, 1fr) minmax(200px, 280px);
  gap: 20px;
  align-items: start;
}

/* Drop zone */
.drop-zone {
  border: 2px dashed var(--border-hi);
  border-radius: var(--radius-lg);
  padding: 36px 24px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer; min-height: 180px;
}
.drop-zone.dragover { border-color: var(--accent); border-style: solid; transform: scale(1.01); }

/* Toggle switch */
.switch { position: relative; width: 38px; height: 21px; }
.switch-slider { position: absolute; inset: 0; background: var(--surface-2); border-radius: 10px; }
.switch-slider::before { content: ''; position: absolute; width: 15px; height: 15px; left: 2px; top: 2px; background: var(--text-muted); border-radius: 50%; }
.switch input:checked + .switch-slider { background: var(--accent); }
.switch input:checked + .switch-slider::before { transform: translateX(17px); background: #fff; }

/* Partial fields animation */
.partial-fields {
  max-height: 0; opacity: 0; transition: all 0.3s ease;
}
.partial-fields.visible { max-height: 500px; opacity: 1; }

/* Upload actions */
.upload-actions .btn.btn-primary { width: 100%; justify-content: center; padding: 12px 20px; }

/* Status */
.upload-status { font-size: 0.75rem; }
.upload-status.success { color: var(--green); }
.upload-status.error { color: var(--red); }

/* Progress bar */
.progress-bar-wrap { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
.progress-bar { height: 100%; width: 0; background: linear-gradient(90deg, var(--accent), var(--cyan)); }

/* Profile grid */
.profile-grid {
  position: relative; display: grid;
  grid-template-rows: 34px 1fr;
  min-height: 300px;
}
.profile-grid-header {
  display: grid; grid-template-columns: var(--profile-grid-cols);
  background: var(--surface-1); border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 2;
}
.profile-grid-header { overflow-x: auto; }
.profile-grid-viewport { overflow: auto; position: relative; }
.profile-grid-row {
  display: grid; grid-template-columns: var(--profile-grid-cols);
  height: 36px; border-bottom: 1px solid var(--border-subtle);
}

/* Profile mode badge */
.profile-mode-badge[data-mode="dataset"] { background: rgba(0,200,150,0.12); color: var(--green); }
.profile-mode-badge[data-mode="preview"] { background: rgba(0,168,255,0.12); color: var(--accent); }
.profile-mode-badge[data-mode="preview"]::before { animation: profile-mode-pulse 1.5s ease-in-out infinite; }
```

---

## JavaScript Behavior

### Module: `upload.ts`

#### `initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid, deps)`

Entry point. Wires up all event listeners.

**Dependencies injected:**
- `hydrateColumnProfiles(metadata)` — Populates `appState.columnProfiles` from metadata
- `renderColumnProfilesGrid(resetScroll)` — Renders the virtualized profile grid
- `deps.buildColumnToggles()` — Rebuilds series chip toggles on Timeseries page
- `deps.buildRangeControls()` — Rebuilds time range controls

#### State Variables (local)

```typescript
let selectedFile: File | null = null;
let previewController: AbortController | null = null;
```

#### `validateSelectedFile(file: File | null): string | null`

Validates file before preview or upload:
1. File must be selected
2. Extension must be `.csv` or `.parquet`
3. Size must be ≤ 256 MB

#### `runFilePreview(file: File)`

Fetches column profiles by calling `POST /api/upload/preview` with `FormData` containing the file and optional `time_column`.

**On success:**
1. Sets `appState.metadata = previewMetadata`
2. Calls `hydrateColumnProfiles(previewMetadata)`
3. Calls `applyPreviewColumnSelection(previewMetadata)` — populates time column dropdown
4. Calls `renderColumnProfilesGrid(true)` — renders with scroll reset
5. Calls `applyPartialTimeRangeFromMetadata(previewMetadata, true)` — fills time range inputs
6. Calls `setProfileMode('preview')`

**On error:** Sets status with error message.

#### `applyPreviewColumnSelection(metadata: DatasetMetadata)`

1. Detects time column by searching for names matching `/date|time|ts|timestamp/i`
2. Sets `appState.previewSelectedColumns` to all column names
3. Populates `#time-column-select` dropdown with all columns + detected time column pre-selected
4. On dropdown change: updates `appState.previewTimeColumn` and re-runs preview

#### Upload Submit Flow

```
uploadBtn.click()
  └─ validateSelectedFile()
  └─ Build FormData:
       ├─ file
       ├─ n_rows (if partial enabled)
       ├─ skip_rows (if partial enabled and > 0)
       ├─ time_start (if set)
       ├─ time_end (if set)
       ├─ columns (JSON array of selected column names)
       └─ time_column
  └─ POST /api/upload
  └─ On success:
       ├─ Parse { rows, ... }
       ├─ Show success status
       ├─ Fetch fresh metadata via dataClientFetchMetadata()
       ├─ Update appState.metadata + appState.datasetRevision
       ├─ Reset upload state (clear file input)
       ├─ Set profile mode to 'dataset'
       ├─ Hydrate and render profile grid with new metadata
       ├─ Update header meta bar
       ├─ Rebuild column toggles + range controls
       └─ OR fall back to window.location.reload() on failure
  └─ On error: Show error status
```

#### `setStatus(msg, cls)` / `setUploadPreviewStatus(text, kind)`

Updates the status text element below the upload button or in the preview header.

**CSS classes:** `''` (default), `'success'` (green), `'error'` (red), `'loading'` (dim + optional spinner).

#### Database Connection Flow

```
dbConnectBtn.click()
  └─ POST /api/database/connect { connection_string, schema, load_snapshot: false }
  └─ On success:
       ├─ Enable #db-load-btn
       ├─ Show #db-disconnect-btn
       └─ Call refreshDbTables() → GET /api/database/tables

dbLoadBtn.click()
  └─ POST /api/database/load { schema, table, time_column, limit: 1_000_000 }
  └─ On success:
       └─ Dispatch 'edatime:dataset-changed' event
```

#### `switchUploadSource(source: 'file' | 'database')`

Toggles tab aria-selected state and shows/hides the corresponding panel.

---

### Module: `profile.ts`

#### `hydrateColumnProfiles(metadata: DatasetMetadata)`

Reads `metadata.column_profiles` (detailed stats including histograms) and `metadata.columns` (basic schema). Merges them into `appState.columnProfiles` as `ProfileRow[]`.

**ProfileRow shape:**
```typescript
interface ProfileRow {
    name: string;
    dtype: string;
    nonNullCount: number;
    nullCount: number;
    min: number | null;
    max: number | null;
    histCounts: number[];
}
```

#### `renderColumnProfilesGrid(resetScroll = false)`

Virtualized renderer using windowing:
- `PROFILE_ROW_HEIGHT = 38px`
- `PROFILE_OVERSCAN = 8` (rows to render above/below visible area)
- `viewport.scrollTop` determines visible window
- Only renders rows in `[start, end)` range
- Spacer div maintains full scroll height

#### Grid Column Definitions

```typescript
PROFILE_COLUMNS: ProfileColumnDef[] = [
    { key: 'selected',     label: '',            minWidth: 56,  defaultWidth: 56,  sortable: false },
    { key: 'name',         label: 'Column',      minWidth: 160, defaultWidth: 220, sortable: true  },
    { key: 'dtype',         label: 'Type',        minWidth: 110, defaultWidth: 120, sortable: true  },
    { key: 'nonNullCount', label: 'Non-null',    minWidth: 130, defaultWidth: 140, sortable: true  },
    { key: 'nullCount',     label: 'Null',        minWidth: 90,  defaultWidth: 100, sortable: true  },
    { key: 'min',          label: 'Min',         minWidth: 120, defaultWidth: 130, sortable: true  },
    { key: 'max',          label: 'Max',         minWidth: 120, defaultWidth: 130, sortable: true  },
    { key: 'histCounts',   label: 'Distribution', minWidth: 220, defaultWidth: 260, sortable: false },
];
```

#### `createHistogramCell(profile: ProfileRow): HTMLDivElement`

Creates a mini bar chart from `histCounts` array:
- Max count → 22px height bar
- Bars are `flex: 1; min-width: 1px` with gradient fill
- `height = Math.max(1, Math.round((count / maxCount) * 22))`

#### Sorting

`sortProfileRows(profiles, sortKey, sortDir)` sorts in place:
- String columns (`name`, `dtype`): locale-aware string comparison
- Numeric columns: numeric comparison, NaN sorts last
- Clicking a sortable column header cycles `asc` → `desc` → `asc`

#### Column Resizing

Each header cell (except the last) has a draggable resizer (`pointerdown`):
- `event.clientX - startX` delta applied to column width
- Minimum width from `PROFILE_COLUMNS[idx].minWidth`
- `profileGridColWidths` array updated and persisted

---

## App State (from `store/index.ts`)

```typescript
previewSelectedColumns: string[]       // Columns selected for next upload
previewTimeColumn: string | null      // Time column for next upload
profileGridBound: boolean             // Whether grid scroll listener is attached
profileGridHeaderBound: boolean       // Whether header sort/resize handlers are attached
profileGridSort: { key: string, dir: 'asc' | 'desc' }
profileGridColWidths: number[]        // Per-column pixel widths [56, 220, 120, 140, 100, 130, 130, 260]
columnProfiles: ProfileRow[]          // Current column profiles
```

---

## Backend API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/upload/preview` | POST | Scan file, return column profiles + metadata |
| `/api/upload` | POST | Ingest file, replace in-memory dataset |
| `/api/database/connect` | POST | Establish DB connection pool |
| `/api/database/connect` | DELETE | Close DB connection pool |
| `/api/database/tables` | GET | List tables in connected DB |
| `/api/database/load` | POST | Load table data into memory |
| `/api/database/status` | GET | Check existing DB connection state |

### Upload Preview Response

```json
{
  "metadata": {
    "total_rows": 69680,
    "columns": [{ "name": "HUFL", "dtype": "float64" }, ...],
    "numeric_columns": ["HUFL", "HULL", ...],
    "time_column": "timestamp",
    "time_range": { "min": 1535016000000, "max": 1538356800000 },
    "column_profiles": [
      {
        "name": "HUFL", "dtype": "float64",
        "count": 69680, "non_null_count": 69680, "null_count": 0,
        "min": -0.1, "max": 1.0,
        "histogram": { "bin_edges": [...], "counts": [...] }
      }, ...
    ]
  }
}
```

---

## CSS Custom Properties Used

```css
--bg-primary         /* Page background */
--surface-0         /* Card/panel backgrounds */
--surface-1          /* Slightly elevated surfaces */
--surface-2          /* Input backgrounds */
--border             /* Default borders */
--border-hi          /* Higher-contrast borders */
--border-subtle      /* Subtle dividers */
--text               /* Primary text */
--text-dim           /* Secondary/muted text */
--text-muted         /* Tertiary text */
--accent            /* Primary accent (cyan/blue) */
--cyan              /* Secondary accent */
--green             /* Success states */
--red               /* Error states */
--radius             /* Default border radius */
--radius-lg          /* Large radius */
--radius-pill        /* Pill-shaped radius */
```

---

## Accessibility

| Element | Feature |
|---------|---------|
| Drop zone | `role="button"`, `tabindex="0"`, `aria-label` |
| Source tabs | `role="tablist"`, `role="tab"`, `aria-selected` |
| Profile grid | `role="table"`, `aria-label`, `aria-describedby` caption |
| Checkboxes | `aria-label` on each, header checkbox has `aria-label="Select all upload columns"` |
| Status messages | `role="status"`, `aria-live="polite"` |
| Progress bar | `role="progressbar"`, `aria-valuemin/max/now` |
| Field labels | `for` attribute linking to input `id` |
| Time column hint | `field-hint` subtext explains when manual selection is needed |

---

## Initialization Sequence

```
initAppShell()
  └─ initUploadPanel(hydrate, render, deps)
        ├─ Wire drop zone click/keydown/dragover/dragleave/drop
        ├─ Wire browse button click
        ├─ Wire file input change
        ├─ Wire partial load toggle
        ├─ Sync n-rows range ↔ number input
        ├─ Wire All/None/checkall selection buttons
        ├─ Wire upload button click
        ├─ Wire source tab switches
        ├─ Wire db connect/load/disconnect buttons
        └─ Call applyPartialTimeRangeFromMetadata(appState.metadata, false)
           (loads current dataset time range if available)

initColumnProfilesGrid() [called separately in appShell]
  ├─ Wire viewport scroll → renderColumnProfilesGrid()
  ├─ ResizeObserver → renderColumnProfilesGrid()
  ├─ initProfileGridHeaderControls() → sort/resize handlers
  ├─ applyProfileGridColumnsTemplate()
  └─ Set profileGridBound = true
```

---

## Complete HTML Copy

```html
<section class="page page-upload" id="page-upload" data-page-name="upload">
  <div id="upload-panel" class="open">
    <div class="upload-inner">
      <!-- Source Tabs -->
      <div class="upload-source-tabs" role="tablist" aria-label="Upload source">
        <button class="btn btn-sm active" id="upload-source-file-btn" type="button" role="tab"
          aria-selected="true" data-upload-source="file">File</button>
        <button class="btn btn-sm btn-ghost" id="upload-source-database-btn" type="button" role="tab"
          aria-selected="false" data-upload-source="database">Database</button>
      </div>

      <!-- File Panel -->
      <div class="upload-source-panel upload-source-panel--file" data-upload-source-panel="file">

        <!-- Drop Zone -->
        <div class="drop-zone" id="drop-zone" role="button" tabindex="0"
          aria-label="Drop CSV or Parquet file here or browse for a file">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span class="dz-title">Drop CSV or Parquet here</span>
          <span class="dz-sub">or</span>
          <button class="btn btn-ghost" id="browse-btn" type="button">Browse file</button>
          <input type="file" id="file-upload" accept=".csv,.parquet" hidden>
          <span class="dz-filename" id="file-name-display" role="status" aria-live="polite"></span>
        </div>

        <!-- Load Options -->
        <div class="partial-section">
          <div class="partial-section-title">Load options</div>
          <label class="toggle-row" id="partial-toggle-row">
            <span class="switch">
              <input type="checkbox" id="partial-enabled" aria-label="Enable partial load options">
              <span class="switch-slider"></span>
            </span>
            <span>
              <div class="toggle-label-text">Partial load</div>
              <div class="toggle-sub">Limit the rows ingested from the file</div>
            </span>
          </label>
          <div class="partial-fields" id="partial-fields">
            <div class="field-group">
              <label for="n-rows-input">Max rows to load</label>
              <div class="row">
                <input type="number" id="n-rows-input" placeholder="All rows" min="1" step="1000" aria-label="Maximum rows to load">
                <input type="range" id="n-rows-range" min="1000" max="5000000" step="1000" value="1000000" aria-label="Max rows slider">
                <span class="range-value" id="n-rows-display">1 000 000</span>
              </div>
            </div>
            <div class="field-group">
              <label for="skip-rows-input">Skip first N rows</label>
              <div class="row">
                <input type="number" id="skip-rows-input" placeholder="0" min="0" value="0" aria-label="Skip first N rows">
              </div>
              <div class="field-hint">Skip rows at the top of the file (e.g., header rows)</div>
            </div>
            <div class="field-group">
              <label>Time range (optional)</label>
              <div class="row row-time">
                <input type="datetime-local" id="time-start-input" aria-label="Start time">
                <input type="datetime-local" id="time-end-input" aria-label="End time">
              </div>
              <div class="time-range-hint" id="time-range-hint">Detected range will appear after preview.</div>
            </div>
            <div class="field-group">
              <label for="time-column-select">Time column</label>
              <select id="time-column-select" class="modal-select" aria-label="Time column">
                <option value="">Auto-detect</option>
              </select>
              <div class="field-hint">Required when file has multiple time-like columns</div>
            </div>
          </div>
        </div>

        <!-- Upload Actions -->
        <div class="upload-actions">
          <button class="btn btn-primary" id="upload-btn" type="button" aria-describedby="upload-status">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 11V3M5 6l3-3 3 3" />
              <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" />
            </svg>
            Upload & Ingest
          </button>
          <div class="progress-bar-wrap" id="progress-wrap" style="display:none" role="progressbar"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Upload progress">
            <div class="progress-bar" id="progress-bar"></div>
          </div>
          <div class="upload-status" id="upload-status" role="status" aria-live="polite"></div>
        </div>
      </div>

      <!-- Database Panel -->
      <div class="upload-source-panel" data-upload-source-panel="database" hidden>
        <div class="db-section">
          <div class="partial-section-title">Database Connection</div>
          <p class="toggle-sub">Connect to PostgreSQL or TimescaleDB and load a table into the active dataset.</p>
          <div class="db-fields" id="db-fields">
            <div class="field-group">
              <label for="db-backend-select">Backend</label>
              <select id="db-backend-select" class="modal-select">
                <option value="timescale">TimescaleDB</option>
                <option value="postgres">PostgreSQL</option>
              </select>
            </div>
            <div class="field-group">
              <label for="db-connection-input">Connection string</label>
              <input type="text" id="db-connection-input" class="modal-input" placeholder="postgres://user:pass@host/db" aria-label="Connection string">
            </div>
            <div class="field-group">
              <label for="db-schema-input">Schema</label>
              <input type="text" id="db-schema-input" class="modal-input" placeholder="public" aria-label="Schema name" value="public">
            </div>
            <div class="field-group" id="db-table-group">
              <label for="db-table-select">Table / Hypertable</label>
              <div class="db-table-row">
                <select id="db-table-select" class="modal-select">
                  <option value="">— connect first —</option>
                </select>
                <input type="text" id="db-table-input" class="modal-input" placeholder="or type name" aria-label="Table name">
              </div>
            </div>
            <div class="field-group">
              <label for="db-time-col-input">Time column <span class="field-required">(required)</span></label>
              <input type="text" id="db-time-col-input" class="modal-input" placeholder="Auto-detect" aria-label="Time column">
            </div>
            <div class="db-btn-row">
              <button class="btn btn-primary" id="db-connect-btn" type="button">Connect</button>
              <button class="btn btn-primary" id="db-load-btn" type="button" disabled>Load data</button>
              <button class="btn btn-ghost" id="db-disconnect-btn" type="button" hidden>Disconnect</button>
            </div>
            <div class="upload-status" id="db-status"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- File Preview -->
    <div class="upload-preview">
      <div class="upload-preview-head">
        <span class="toolbar-label">File Preview</span>
        <span class="profile-mode-badge" id="profile-mode-badge" data-mode="dataset">Current dataset</span>
        <div class="upload-preview-selection">
          <button class="btn btn-select" id="profile-select-all-btn" type="button">All</button>
          <button class="btn btn-select" id="profile-select-none-btn" type="button">None</button>
        </div>
        <input type="text" id="profile-filter-input" class="column-filter-input" placeholder="Filter columns…" aria-label="Filter profile columns">
        <span class="upload-preview-status" id="upload-preview-status" role="status" aria-live="polite">Select a file to preview columns</span>
      </div>
      <span id="profile-grid-caption" class="sr-only">Column profile preview with selectable columns for upload ingestion.</span>
      <div class="profile-grid" id="profile-grid" role="table" aria-label="Column profile table" aria-describedby="profile-grid-caption">
        <div class="profile-grid-header" role="row">
          <div class="profile-col profile-col-check" role="columnheader">
            <input id="profile-select-all-checkbox" type="checkbox" aria-label="Select all upload columns">
          </div>
          <div class="profile-col profile-col-name" role="columnheader">Column</div>
          <div class="profile-col profile-col-type" role="columnheader">Type</div>
          <div class="profile-col profile-col-count" role="columnheader">Non-null</div>
          <div class="profile-col profile-col-count" role="columnheader">Nulls</div>
          <div class="profile-col profile-col-num" role="columnheader">Min</div>
          <div class="profile-col profile-col-num" role="columnheader">Max</div>
          <div class="profile-col profile-col-hist" role="columnheader">Distribution</div>
        </div>
        <div class="profile-grid-viewport" id="profile-grid-viewport" role="rowgroup">
          <div class="profile-grid-spacer" id="profile-grid-spacer">
            <div class="profile-grid-rows" id="profile-grid-rows"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

---

## Integration Points

| Caller | Function | Purpose |
|--------|----------|---------|
| `appShell.ts` | `initUploadPanel(...)` | Wires all upload UI |
| `appShell.ts` | `initColumnProfilesGrid()` | Wires virtualized grid scroll + resize |
| `appShell.ts` | `initAnalysisControls()` | Wires analytics drawer (bands, anomalies) |
| `timeseriesPage.ts` | `emitChartRangeChange()` | Broadcasts time range to other pages |
| `heatmapPage.ts` | On cell click | Sets scatter X/Y and navigates to scatter |
| `dataClient.ts` | `fetchMetadata()` | Gets fresh metadata after upload |
| `app.ts` | On `edatime:dataset-changed` | Triggers full app re-bootstrap |
| `guidedWorkflow.ts` | Tracks step | Guides user to Upload first if no dataset loaded |