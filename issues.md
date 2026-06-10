# EdaTime UI/UX Issues - Found During Testing

**Date:** 2026-06-09
**Tested with:** Sample ETTm2 dataset (69,680 rows, 8 columns: date, HUFL, HULL, MUFL, MULL, LUFL, LULL, OT)
**Environment:** http://127.0.0.1:3000 (Linux)

This document captures issues found during a systematic UI/UX test of the EdaTime time-series analytics application. No code changes were made during testing - all findings are observational.

---

## CRITICAL ISSUES (Block core functionality)

### Issue #1: Scatter page X and Y column selectors are EMPTY

**Severity:** CRITICAL — users cannot use the scatter page
**Page:** `#page=scatter`

**Description:** When opening the scatter page, the X and Y column dropdowns are completely empty. The dropdown opens, but `aria-controls="scatter-x-col__listbox"` has zero `<option>` children. The same applies to `scatter-y-col__listbox`. As a result, the user cannot select X or Y columns and the scatter chart never renders.

**Evidence:**
- `<div class="dropdown__menu" id="scatter-x-col__listbox" role="listbox"></div>` — empty innerHTML, 0 children
- `<div class="dropdown__menu" id="scatter-y-col__listbox" role="listbox"></div>` — empty innerHTML, 0 children
- `<span class="dropdown__label"></span>` — empty label
- Metadata API returns 8 columns: `["date", "HUFL", "HULL", "MUFL", "MULL", "LUFL", "LULL", "OT"]`
- State object `window.__edatime.state.scatter.metadata` is `null`
- Main element shows placeholder text: "Choose scatter axes" / "Choose X and Y numeric columns to render the scatter plot."

**Expected:** Dropdown should be populated with all numeric columns from the dataset, e.g. HUFL, HULL, MUFL, MULL, LUFL, LULL, OT.

**Impact:** Scatter page is essentially unusable.

---

## HIGH SEVERITY ISSUES

### Issue #2: Multiple chart canvases stacked in `#main-chart`

**Severity:** HIGH — visual glitch / performance impact
**Page:** `#page=timeseries`

**Description:** The `#main-chart` container has 20 children, indicating two chart instances are rendered on top of each other. Each instance has 2 canvases (main + overlay) + tooltips/overlays, so 2 instances × 10 elements = 20.

**Evidence:**
- Element count under `#main-chart` is 20 (typical single chart: 10 elements with 2 canvases + overlays)
- Children 0-9 and 10-19 are duplicate patterns of 2 canvases + overlays + tooltips

**Expected:** Only one chart instance should exist at a time.

**Impact:** Potential performance overhead, possible double-rendering of hover/tooltip events, and unclear which canvas is the active one.

---

### Issue #3: Analytics drawer state desync — `body.drawer-open` blocks interactions

**Severity:** HIGH — affects all page interactions when analytics drawer was previously open
**Page:** All pages after visiting timeseries

**Description:** The `<body class="drawer-open">` class remains applied even after the analytics drawer is closed (or remains set when the drawer is technically hidden but still occupies DOM space). The body has `class="drawer-open"` with the drawer having `offsetWidth: 300, offsetHeight: 1030, position: fixed, right: 0` — i.e., it visually occupies the right side of the screen.

Additionally, the drawer appears to be set to `body.drawer-open` even when the user has not opened it explicitly (it may auto-open or persist between page navigations). When `body.drawer-open` is set, the body element blocks pointer events on underlying controls.

**Evidence:**
- Body class: `drawer-open`
- Drawer style: `display: flex; position: fixed; right: 0; width: 300px; height: 1030px; z-index: 200`
- `mcp_playwright_browser_click` tool times out with error: `<body class="drawer-open">…</body> intercepts pointer events`
- After clicking the drawer's close button: `bodyClass: ""`, drawer is no longer `open`

**Expected:** Body should only have `drawer-open` class when the drawer is actually open and visible, and closing the drawer should remove the class.

**Workaround:** Call `document.getElementById('analytics-close-btn').click()` to dismiss the drawer programmatically.

**Impact:** All click-based UI interactions (combobox, buttons) become unreachable until the drawer is explicitly closed.

---

### Issue #4: Analytics controls state desync — checkbox checked but state unchanged

**Severity:** HIGH — feature appears broken
**Page:** `#page=timeseries` (analytics drawer)

**Description:** Clicking the "Show mean ± σ bands" checkbox in the analytics drawer sets the checkbox's `checked` attribute to `true` in the DOM, but `window.__edatime.state.rollingEnabled` remains `false`. The change event handler is bound (data-bound="1") but the state subscription doesn't update.

**Evidence:**
- DOM: `<input type="checkbox" id="rolling-enabled" data-bound="1" checked>`
- State: `window.__edatime.state.rollingEnabled === false`
- Direct assignment `window.__edatime.state.rollingEnabled = true` works correctly
- `setRollingEnabled(true)` is called but analyticsState does not reflect this

**Expected:** Toggling the checkbox should update `rollingEnabled` (and `anomalyEnabled` similarly for the anomaly checkbox) in the app state.

**Impact:** Rolling bands and anomaly detection features are non-functional.

---

### Issue #5: Duplicate `aria-label` on rolling-enabled controls

**Severity:** MEDIUM — accessibility violation
**Page:** `#page=timeseries` (analytics drawer)

**Description:** Two elements have the same `aria-label="Show rolling mean ± σ bands"`:
- `#rolling-enabled` (the analytics drawer checkbox)
- `#rolling-enabled-modal` (presumably the modal/menu version)

**Expected:** Each control should have a unique accessible label, or one of them should be removed if duplicate.

**Impact:** Screen readers and accessibility tools may not be able to distinguish these controls.

---

## MEDIUM SEVERITY ISSUES

### Issue #6: The scatter page is in `Choose scatter axes` state on first load (expected)

**Severity:** INFORMATIONAL
**Page:** `#page=scatter`

**Description:** When first navigating to the scatter page, the user is shown a placeholder: "Choose scatter axes" / "Choose X and Y numeric columns to render the scatter plot." This is the expected empty state, but it depends on Issue #1 being fixed before it can be tested.

---

### Issue #7: Many combobox listboxes are empty on first inspection

**Severity:** MEDIUM
**Page:** Various

**Description:** When inspecting all listboxes on the page (40 total combobox elements with `role="listbox"`), several were found to have empty option lists:
- `scatter-x-col__listbox` — empty
- `scatter-y-col__listbox` — empty
- `spectrogram-col-select__listbox` — empty
- `causal-compare-run-a__listbox` — empty
- `causal-compare-run-b__listbox` — empty
- `drift-detail-col-select__listbox` — empty
- `drift-window-list` — empty
- `column-filter-col__listbox` — empty

**Expected:** Column listboxes should be populated when the dataset is loaded, even before the user opens the dropdown.

**Impact:** Related to Issue #1 — these listboxes may also fail to populate when the user opens the dropdown.

---

### Issue #8: Analytics drawer visible content shows before user opens it

**Severity:** MEDIUM
**Page:** `#page=timeseries`

**Description:** The analytics drawer appears to be in the DOM (visible: 300×1030px, fixed, right: 0) and the body has `class="drawer-open"`. The user did not open the drawer, suggesting the drawer is auto-shown or its state persists from a previous session.

**Expected:** Drawer should be hidden by default, and the `body.drawer-open` class should only be set when the user explicitly opens the drawer.

**Impact:** Issues #3 and #8 are likely the same root cause.

---

## LOW SEVERITY / OBSERVATIONS

### Issue #9: Series column filter input works

**Severity:** INFORMATIONAL (works as expected)
**Page:** `#page=timeseries`

**Description:** Typing in the column filter textbox on the timeseries page filters the series chips correctly. Confirmed "HULL" filters down to that series.

---

### Issue #10: Navigation buttons work via direct `.click()`

**Severity:** INFORMATIONAL
**Page:** All pages

**Description:** All sidebar navigation buttons work correctly when clicked via `button.click()` (bypassing the body intercepts issue). The router correctly switches between pages.

---

## Console Messages

No errors or warnings observed in the browser console during the test session.

---

## Summary of Critical Bugs

| # | Issue | Page | Severity |
|---|-------|------|----------|
| 1 | Scatter X/Y column selectors empty | Scatter | CRITICAL |
| 2 | Multiple chart canvases in #main-chart | Timeseries | HIGH |
| 3 | `body.drawer-open` blocks interactions | All | HIGH |
| 4 | Analytics state desync on checkbox toggle | Timeseries | HIGH |
| 5 | Duplicate `aria-label` on rolling-enabled | Timeseries | MEDIUM |
| 7 | Many column listboxes empty | Various | MEDIUM |
| 8 | Analytics drawer auto-opens | Timeseries | MEDIUM |

---

## Test Plan Coverage

### Completed
- [x] Home page (sample data buttons, recommended workflow, keyboard shortcuts)
- [x] Upload page (file/database tabs, column profile table)
- [x] Timeseries page (chart, series chips, analytics drawer, column filter)
- [x] Scatter page (X/Y selectors, render mode, distribution mode, link chart range, density controls) — all broken (Issue #1)

### Pending
- [ ] Correlations page (heatmap)
- [ ] FFT/PSD page
- [ ] Spectrogram page
- [ ] Causal Graph page
- [ ] Drift Analysis page
- [ ] Settings page
- [ ] Timeseries chart interactions (zoom, adaptive filters, exports)
- [ ] Analytics controls (rolling bands, anomaly detection, transform, outliers)
- [ ] Keyboard shortcuts (Ctrl+click, drag, double-click)
- [ ] All export actions (PNG, CSV, JSON, Parquet, SVG)
- [ ] Adaptive filters via Ctrl+click on chart

---

## NEW FINDINGS (Continued Testing)

### Issue #11: `/api/drift/stats` returns 422 — frontend/backend field naming mismatch

**Severity:** CRITICAL — Drift Analysis is non-functional
**Page:** `#page=drift`

**Description:** The frontend sends snake_case field names in the POST request body to `/api/drift/stats`, but the Rust backend expects camelCase. The endpoint returns `422 Unprocessable Entity` and never returns any data.

**Evidence (Network request body sent by frontend):**
```json
{
  "window": "daily",
  "reference_start": "2016-07-01T00:00:00.000Z",
  "reference_end": "2017-06-28T21:52:00.000Z",
  "column": "HUFL"
}
```

**Backend error response (response body):**
```
Failed to deserialize the JSON body into the target type: missing field `referenceStart` at line 1 column 122
```

**Expected:** Either:
- Frontend should send `referenceStart` / `referenceEnd` (camelCase) to match the backend's expected schema, OR
- Backend should accept `reference_start` / `reference_end` (snake_case) via `#[serde(alias = "reference_start")]`

**Impact:** The Compute Drift button never produces results; the page always shows "No drift analysis yet" even after clicking Compute with columns selected.

---

### Issue #12: Drift column picker label not updated after "All" / "Single" / "None"

**Severity:** MEDIUM — visual feedback broken
**Page:** `#page=drift`

**Description:** When the user clicks the "All" button to select all 7 numeric columns, the visible label `#drift-col-picker-label` still shows "–" (en-dash), giving no visual feedback that any columns are selected. The hidden `<select id="drift-col-select">` correctly contains the selected options, but the visible trigger label does not reflect this.

**Evidence:**
- Click "All" → `drift-col-select.selectedOptions = ["HUFL", "HULL", "MUFL", "MULL", "LUFL", "LULL", "OT"]`
- But `#drift-col-picker-label.textContent === "–"` (unchanged)
- The list view also shows just text "7 columns" (no checkboxes), with no per-column UI

**Expected:** The label should display something like "7 selected" or the actual list of selected column names, and the picker should have per-column checkboxes with checked state.

**Impact:** Users cannot tell which columns are selected for drift analysis.

---

### Issue #13: Drift column picker shows raw text instead of checkboxes

**Severity:** MEDIUM — picker has no per-column UI
**Page:** `#page=drift`

**Description:** The drift column picker panel is supposed to let the user toggle individual columns, but it only displays the raw text "7 columns" inside `#drift-col-picker-list`, with no individual checkbox controls. The "All" / "Single" / "None" buttons are the only way to change selection.

**Evidence:**
- HTML: `<div id="drift-col-picker-list" ...>7 columns</div>` (after clicking "All")
- 0 checkboxes inside the list
- The first time, it shows "HUFL" as text — this is clearly a single label, not a checkbox

**Expected:** The picker should have a checkbox per column so users can choose exactly which columns to include.

**Impact:** Users cannot pick arbitrary subsets of columns for drift analysis.

---

### Issue #14: Settings is a modal, not a page (URL `?page=settings` opens modal)

**Severity:** INFORMATIONAL
**Page:** URL `http://127.0.0.1:3000/#page=settings`

**Description:** Navigating to `#page=settings` via URL doesn't show a "page-settings" section. Instead, the Settings is implemented as a modal (`#settings-modal`). There is no `<section class="page" id="page-settings">` element in the DOM. Clicking the Settings nav button or gear icon opens the modal.

**Evidence:**
- DOM contains `page-home`, `page-upload`, `page-timeseries`, `page-scatter`, `page-fft`, `page-spectrogram`, `page-heatmap`, `page-causal`, `page-drift` — but NO `page-settings`
- `#settings-modal` is a `<div class="modal-backdrop settings-modal">` with role="dialog"

**Expected:** Documented as informational; the modal pattern is intentional.

---

### Issue #15: FFT page stuck on "Loading data..."

**Severity:** HIGH — feature appears broken
**Page:** `#page=fft`

**Description:** The FFT/PSD page is stuck in a perpetual "Loading data…" state. The main content area shows the loading text indefinitely and never renders the FFT plot.

**Evidence:**
- After navigating to `#page=fft` and waiting 8+ seconds, the main area still shows: "Loading data…"
- No console errors observed
- Likely related to a page initialization issue similar to Issue #1 (Scatter)

**Expected:** The page should initialize the FFT calculation and render the spectrum chart.

**Impact:** FFT/PSD analysis is unusable.

---

### Issue #16: Spectrogram page stuck on "Loading data..."

**Severity:** HIGH — feature appears broken
**Page:** `#page=spectrogram`

**Description:** Same as Issue #15 — the Spectrogram page is stuck in a perpetual "Loading data…" state, even after waiting.

**Evidence:**
- Main content area shows: "Loading data…"
- The spectrogram column select (`spectrogram-col-select__listbox`) is also empty

**Expected:** The page should initialize and render the spectrogram.

**Impact:** Spectrogram analysis is unusable.

---

### Issue #17: Causal Graph page stuck on "Loading data..."

**Severity:** HIGH — feature appears broken
**Page:** `#page=causal`

**Description:** Same as Issues #15 and #16 — the Causal Graph page is stuck in a perpetual "Loading data…" state.

**Evidence:**
- Main content area shows: "Loading data…" indefinitely

**Expected:** The page should initialize and show the causal graph controls or compute UI.

**Impact:** Causal analysis is unusable.

---

### Issue #18: Heatmap page works correctly (positive finding)

**Severity:** INFORMATIONAL
**Page:** `#page=heatmap`

**Description:** The Correlations heatmap page works as expected. It correctly shows the correlation matrix for all numeric columns (7x7 = 49 cells), with values ranging from -0.60 to 1.00. Clicking a non-diagonal cell navigates to the scatter page (which is broken — see Issue #1).

**Evidence:**
- 49 heatmap cells rendered
- Cell titles: "HUFL × HULL: 0.67 — click to explore in Scatter", etc.
- Cells have `data-row` and `data-col` attributes
- Cell click navigates to `#page=scatter`

**Note:** The aria-label of the cells is set via the `title` attribute, not the `aria-label` attribute, which may impact screen reader behavior.

---

### Issue #19: Many analytics page listboxes are empty by default

**Severity:** MEDIUM
**Page:** Various

**Description:** Beyond the scatter X/Y listboxes (Issue #1), many other column-related listboxes on analytics pages are also empty by default:
- `spectrogram-col-select__listbox` — empty (0 children)
- `drift-detail-col-select__listbox` — empty
- `causal-compare-run-a__listbox` — empty
- `causal-compare-run-b__listbox` — empty
- `column-filter-col__listbox` — empty
- `time-column-select__listbox` — only "Auto-detect"
- `db-table-select__listbox` — only "— connect first —"

**Expected:** Column listboxes should be populated when the dataset is loaded.

**Impact:** These controls may be non-functional when the user opens the dropdowns.

---

## Console Log Findings

A summary of new console errors observed during testing:
- 14 errors total, all from `POST http://127.0.0.1:3000/api/drift/stats` returning 422
- The error is: `Failed to deserialize the JSON body into the target type: missing field 'referenceStart' at line 1 column 122`


---

## FINDINGS (Session 2 - Continued)

### Issue #20: Series chip deactivation does not update state

**Severity:** MEDIUM — selectedCols desync with chip UI
**Page:** `#page=timeseries`

**Description:** When the user clicks a series chip to deactivate it (e.g., clicking the "HULL" chip when it was active), the chip's `active` class is correctly removed, but `window.__edatime.state.selectedCols` is NOT updated — HULL remains in the array.

**Evidence:**
- Initial state: `selectedCols = ["HUFL", "HULL", "MUFL"]` (chips showed HULL and MUFL active)
- Click HULL chip → `hull.classList.contains("active") === false` (UI updated)
- But state: `selectedCols = ["HUFL", "HULL", "MUFL"]` (HULL still in array, no change)
- Click HUFL chip → `hull.classList.contains("active") === true` (UI updated)  
- State: `selectedCols = ["HUFL", "HULL", "MUFL"]` (correctly added)

**Expected:** Both activation and deactivation should update `selectedCols`.

**Impact:** Inconsistent state between DOM and app state, possibly causing chart re-renders to use stale data.

---

### Issue #21: PNG/CSV/JSON export buttons exist but no network request observed

**Severity:** INFORMATIONAL
**Page:** `#page=timeseries`

**Description:** The export buttons (`#export-png-btn`, `#export-csv-btn`, `#open-export-options-btn`) are present in the DOM and have `title` attributes like "Export chart as PNG (P)" / "Export filtered data as CSV (E)" / "More export options". Clicking them in the test session did not generate any network requests or download actions.

**Note:** This may be because the export is a client-side action (downloading a generated blob) and does not require a server roundtrip. Without inspecting the download action, I cannot confirm whether the export works.

**Impact:** Unknown — needs further testing with downloads enabled in browser.

---

## Summary of All Issues (Updated)

| # | Issue | Page | Severity |
|---|-------|------|----------|
| 1 | Scatter X/Y column selectors empty | Scatter | CRITICAL |
| 2 | Multiple chart canvases in #main-chart | Timeseries | HIGH |
| 3 | `body.drawer-open` blocks interactions | All | HIGH |
| 4 | Analytics checkbox state desync | Timeseries | HIGH |
| 5 | Duplicate `aria-label` on rolling-enabled | Timeseries | MEDIUM |
| 7 | Many column listboxes empty | Various | MEDIUM |
| 8 | Analytics drawer auto-opens | Timeseries | MEDIUM |
| 11 | `/api/drift/stats` 422 — snake_case vs camelCase | Drift | CRITICAL |
| 12 | Drift column picker label not updated | Drift | MEDIUM |
| 13 | Drift column picker shows text instead of checkboxes | Drift | MEDIUM |
| 14 | Settings is a modal, not a page | n/a | INFORMATIONAL |
| 15 | FFT page stuck on "Loading data..." | FFT | HIGH |
| 16 | Spectrogram page stuck on "Loading data..." | Spectrogram | HIGH |
| 17 | Causal Graph page stuck on "Loading data..." | Causal | HIGH |
| 18 | Heatmap works correctly | Heatmap | INFORMATIONAL (positive) |
| 19 | Many analytics listboxes empty | Various | MEDIUM |
| 20 | Series chip deactivation doesn't update state | Timeseries | MEDIUM |
| 21 | Export buttons exist but no network request | Timeseries | INFORMATIONAL |

