# EdaTime Issues Found During Testing

Date: 2026-05-21
App Version: v0.1.0
Tester: Claude (data scientist workflow simulation)

---

## Issue 1: Timeseries Page - Chart Fails to Render

**Severity:** High

**Location:** `/#/timeseries`

**Description:** When loading the ETTm2 dataset (69,680 rows × 7 columns) and navigating to the Timeseries page, the chart fails to render with a DOM node error.

**Error from console:**
```
[ERROR] [useChartEngine] init failed: NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.
    at jt (http://127.0.0.1:3000/assets/index.q-uo5DuH.js:2:23865)
    ...
[ERROR] [useChartEngine] init completed, chartStatus now: error
```

**Additional context:**
- WebGPU was checked but ECharts was selected as the rendering engine
- The chart controls (series selection, drawing tools, zoom controls) all appear correctly
- The data is loaded (visible in the series list with correct column names and colors)
- The main chart area is empty

---

## Issue 2: FFT Page - No Data Displayed

**Severity:** Medium

**Location:** `/#/fft`

**Description:** The FFT page shows "0 bins · Select columns" and all export buttons (PNG, SVG, CSV) are disabled, even though the ETTm2 dataset is loaded and HUFL-HULL columns are shown as available series.

**Expected behavior:** Should be able to select columns and compute FFT.

**Actual behavior:** Cannot select columns, no FFT bins shown, exports disabled.

---

## Issue 3: Drift Page - Compute Button Does Nothing

**Severity:** High

**Location:** `/#/drift`

**Description:** Clicking the "Compute" button on the Drift page has no visible effect. The page shows column buttons (HUFL, HULL, etc.), window selection (Daily), and reference date fields, but clicking "Compute" does not trigger any chart generation or data processing.

**Expected behavior:** Should compute drift analysis and display timeline chart.

**Actual behavior:** Nothing happens - no chart appears, no error shown.

---

## Issue 4: Scatter Page - Chart Not Visible

**Severity:** Medium

**Location:** `/#/scatter`

**Description:** The scatter page shows controls (X/Y column selectors, Color by, Size, Mode), displays "69,680 points" and correlation values (Pearson: 0.6705, Spearman: 0.6953), but the actual chart is not visible in the main area.

**Expected behavior:** Should display a scatter plot of HUFL vs HULL.

**Actual behavior:** Chart area appears empty. Title warning says "Title is not supported in WebGPU mode. Axis labels are supported."

---

## Issue 5: Navigation - Console Errors Persist Across All Pages

**Severity:** Low

**Location:** All pages

**Description:** Every page load shows 9-10 console errors and 1 warning. The errors appear to be related to chart initialization. This suggests a shared charting component issue that affects all pages using charts.

---

## Pages That Worked Correctly

- **Upload Page:** Successfully loaded ETTm2 sample dataset, preview showed correct column info (69,680 rows × 8 columns)
- **Heatmap Page:** Correlation matrix displayed correctly with Pearson correlations (7×7 variables)
- **Settings Page:** Theme and color scale options displayed correctly
- **Causal Page:** Interface loaded with method/column selectors

---

## Summary

The core issue appears to be **chart rendering initialization failure** - the `useChartEngine` hook fails when trying to insert the chart into the DOM. This affects:
1. Timeseries (fails completely)
2. FFT (no data displayed)
3. Scatter (no visible chart)
4. Drift (compute does nothing - possibly chart related)

The Heatmap page works because it may use a simpler rendering path that doesn't go through the same chart engine.
