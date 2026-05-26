# EdaTime Frontend Issues Review

Date: 2026-05-26  
Reviewer perspective: data scientist using the app for exploratory time-series analysis  
Environment: local Vite frontend at `http://localhost:5174`, backend API at `http://127.0.0.1:3000`  
Dataset: ETTm2, 69,680 rows, 7 numeric columns, `date` time column

## Data Scientist Workflow Tested

- Confirmed backend metadata for the preloaded ETTm2 dataset.
- Opened the home page and reviewed the recommended workflow.
- Checked upload/profile behavior with an already-loaded dataset.
- Explored the timeseries page with all numeric traces, labels, export controls, and responsive mobile viewport.
- Reviewed correlation heatmap output and metric controls.
- Opened scatter analysis with default HUFL/HULL pair and reviewed chart controls.
- Tested FFT/PSD page column selection and export availability.
- Ran drift compute with default settings.
- Tested causal discovery defaults and compute behavior.
- Reviewed settings language, theme/color controls, keyboard shortcuts, route transitions, and console output.

## Prioritized Issues

### 1. Upload Page Does Not Clearly Surface Loaded Dataset

Severity: Medium  
Affected page: `/upload`

Observed behavior: The backend had ETTm2 loaded, but the upload page still showed the empty-state copy `Select a file to preview columns`. This makes the page feel as if no dataset is active, even though metadata is available elsewhere in the app.

Expected behavior: When a dataset is already loaded, the upload/profile page should show the current dataset profile by default, including row count, column count, time column, and column profiles.

Evidence: API metadata reported 69,680 rows and columns `date`, `HUFL`, `HULL`, `MUFL`, `MULL`, `LUFL`, `LULL`, `OT`, while the upload page displayed the empty preview state.

Suggested remediation: On mount, hydrate the upload profile grid from `fetchMetadata()` when a dataset exists, and make the current dataset state visually distinct from the file-preview state.

### 2. FFT Column Selection Is Not Operable

Severity: High  
Affected page: `/fft`

Observed behavior: The FFT page listed available numeric columns but stayed at `0 bins · Select columns`. Export buttons remained disabled. The series checkbox inputs existed in the DOM but were not visible or normally clickable; Playwright reported the column checkboxes as hidden/offscreen.

Expected behavior: A user should be able to select one or more numeric columns and immediately compute or display FFT/PSD bins. Column controls should be visible, accessible, and keyboard/mouse operable.

Evidence: The page rendered a visible chart canvas and column names, but the state did not change after attempting to interact with the first series checkbox. The hidden checkbox inputs had no accessible labels.

Suggested remediation: Replace hidden/offscreen checkbox mechanics with visible chip or checkbox controls that expose checked state, accessible names, and a reliable click target. Consider selecting the first numeric column by default.

### 3. Causal Discovery Defaults Lead To Immediate Failure

Severity: Medium  
Affected page: `/causal`

Observed behavior: The causal page rendered numeric column chips, but clicking `Compute` with defaults produced `Select at least 2 columns for causal discovery.`

Expected behavior: The default state should either select at least two columns, disable `Compute` until enough columns are selected, or guide the user directly to selecting a valid set.

Evidence: The default workflow allowed an invalid compute action as the first obvious next step.

Suggested remediation: Disable `Compute` with helper text until at least two columns are active, or preselect a sensible default pair from the numeric columns.

### 4. Toasts Persist Across Routes And Become Contextless

Severity: Medium  
Affected area: global navigation and route transitions

Observed behavior: Toasts from drift and causal workflows remained visible after navigating to other pages, including mobile timeseries. This made messages such as drift results or causal warnings appear unrelated to the current page.

Expected behavior: Page-scoped feedback should clear or become visually tied to its source when the user navigates away.

Evidence: After running drift compute and causal compute, their toasts were still present on later pages.

Suggested remediation: Add route-scoped toast cleanup, source labels, or a distinction between global persistent notices and page-local transient feedback.

### 5. Multiple Controls Lack Accessible Names

Severity: Medium  
Affected pages: `/upload`, `/timeseries`, `/heatmap`, `/scatter`, `/fft`, `/drift`, `/causal`

Observed behavior: Several selects, checkboxes, and icon-only buttons had no accessible name. This affects screen reader users and also makes automated testing brittle.

Expected behavior: Every interactive control should have an accessible name that describes its action or field purpose.

Evidence: Unlabeled controls appeared in page inspection, including heatmap metric/zoom controls, scatter X/Y/color/size/mode selects, drift window/date/sort fields, causal method/test/parameter fields, and multiple series chip checkboxes.

Suggested remediation: Add explicit labels or `aria-label` values to each control, and make chip checkbox labels include the column name and current action.

### 6. Mobile Timeseries View Is Too Cramped For Analysis

Severity: Medium  
Affected page: `/timeseries` at narrow viewport

Observed behavior: At a 390px-wide viewport, the sidebar, trace controls, toolbar, chart label modal, toasts, and chart canvases all competed for space. The chart canvases were reduced to roughly 170px wide, which is not enough for meaningful inspection.

Expected behavior: Mobile should prioritize the chart and expose controls through compact drawers or route-level panels. Modals and toasts should not cover the primary analysis area.

Evidence: Mobile timeseries showed full navigation, all controls, label modal content, and unrelated toasts alongside very small canvases.

Suggested remediation: Collapse analysis controls behind page-level drawers on small screens, hide or compact sidebar labels, and ensure chart overlays close or reflow before rendering the chart.

### 7. Console Output Is Noisy During Normal Use

Severity: Low  
Affected area: development/runtime diagnostics

Observed behavior: Normal navigation produced many debug logs from app initialization, chart setup, data fetching, ECharts initialization, and timeseries rendering. A Solid warning also appeared: `cleanups created outside a createRoot or render will never be run`.

Expected behavior: Expected app use should keep console output minimal, with warnings reserved for actionable issues.

Evidence: Console output included repeated `[App]`, `[TimeseriesPage]`, `[useChartEngine]`, `[EChartsAdapter]`, and data-transform debug messages during ordinary page visits.

Suggested remediation: Gate debug logs behind a development flag or app-level debug setting, and investigate the Solid cleanup warning so it does not mask more serious runtime problems.

### 8. Settings Copy Feels Too Casual For Professional Analysis

Severity: Low  
Affected page: `/settings`

Observed behavior: Settings copy used phrases such as `Tweak things until it feels just right`, `Your eyes will thank you`, and `Once you memorize these, you'll feel like a pro. No cap.`

Expected behavior: A professional data-science tool should use concise, neutral copy that supports trust and clarity.

Evidence: Settings page language stood out from the more work-focused analytics pages.

Suggested remediation: Replace casual copy with clear operational labels and descriptions, for example `Configure appearance, chart palettes, and keyboard shortcuts.`

## Worked Well

- The app correctly detected the preloaded dataset metadata from the backend.
- Timeseries and scatter charts initialized through ECharts in the tested environment.
- Heatmap rendered a useful correlation matrix for all 7 numeric variables.
- Drift compute produced a timeline and window detail after running.
- The app includes useful data-science workflows: profiling, timeseries inspection, correlation screening, scatter analysis, FFT, drift, and causal discovery.

## Suggested Next Pass

- Fix FFT selection first because it blocks an entire analysis workflow.
- Then improve loaded-dataset visibility on upload/profile and causal default validity.
- Run an accessibility pass over controls after those interaction fixes, since many issues share the same chip/select labeling pattern.
