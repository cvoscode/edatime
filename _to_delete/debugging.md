# EdaTime App Debugging Notes

**Date:** 2026-05-23  
**App URL:** http://localhost:3002  
**Dataset tested:** ETTm2.csv (69,680 rows × 8 columns)

---

## Pages Tested & Observations

### ✅ Home Page
- Loads correctly with sample dataset buttons (ETTm2, Sinusoidal, Weather)
- No errors observed

### ✅ Upload Page
- File preview works after loading ETTm2.csv
- "Upload & Ingest" button triggers progress indicator
- Shows: 69,680 rows × 8 columns with column profiles (min/max/datetime)
- Time range detected: 2016-07-01 00:00 to 2018-06-26 19:45
- Column checkboxes work (date, HUFL, HULL, LUFL, LULL, MUFL, MULL, OT)
- No errors in console after ingest completes

### ✅ Scatter Page
- X/Y column selectors work (HUFL/HULL defaults)
- "Plot" button executes and shows: "Pearson: 0.6705", "Spearman: 0.6953"
- Shows "69,680 points" after plotting
- Mode selector (Scatter/Density) present
- Color and Size column selectors present but not tested in depth
- No errors observed

### ✅ Heatmap Page
- Displays 7×7 correlation matrix for all columns
- Pearson/Spearman metric switcher present
- Zoom slider (100%) present
- Clickable cells that link to Scatter view
- No errors observed

### ❌ FFT Page — **ERROR FOUND**
**Error:** `ReferenceError: fetchFft is not defined`

When user selects a series checkbox in the FFT page, the app throws:
```
FFT fetch failed: ReferenceError: fetchFft is not defined
    at Le (http://localhost:3002/assets/FftPage.BKHP2BEf.js:1:3404)
```

**Location:** `frontend/src/pages/FftPage.tsx` — the `onChange` handler for series checkboxes calls `fetchFft`, which is not defined.

**Status:** The `fetchFft` function needs to be implemented or imported in `FftPage.tsx`.

### ⚠️ Drift Page — **ERROR FOUND (422)**
**Error:** `Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)`

When user clicks "Compute" on the Drift page, the backend returns a 422 error. This likely means:
- The API endpoint `/api/drift` or similar is missing or malformed
- The request payload doesn't match backend expectations
- The backend doesn't implement drift detection yet

**Status:** Backend route for drift detection needs to be checked/implemented.

### ⚠️ Causal Page
- Shows "No causal graph computed" placeholder — expected since no compute run yet
- Column selection and method parameters visible
- No errors triggered during inspection

### ❌ Timeseries Page — **NOT LOADING (STUCK AT LOADING)**
**Status:** Chart stays in `data-status="loading"` forever

When navigating to Timeseries after upload:
- Chart container shows `data-status="loading"` but never completes
- No API calls visible in network tab
- No console errors emitted (apart from constructor/init messages)
- The `useChartEngine` hook sets status to `loading` but never resolves to `ready`

**Likely cause:** The `/api/data` endpoint may not be getting called, or there's a state management issue where the chart doesn't know the dataset is loaded.

**Note:** On first load (before any upload), the chart shows "No dataset loaded" which is correct. After uploading, it should fetch data from `/api/data` but appears not to.

### ✅ Settings Page
- Theme switcher (Dark/Light/Follow System) visible
- Color scale selector (Viridis/Plasma/Inferno/Coolwarm/RdBu) visible  
- Plot appearance (Auto/Light/Dark) visible
- Keyboard shortcuts reference shown
- About section with version info (v0.1.0)
- No errors observed

---

## Summary of Issues

| Page | Status | Issue |
|------|--------|-------|
| Home | ✅ OK | — |
| Upload | ✅ OK | — |
| Scatter | ✅ OK | — |
| Heatmap | ✅ OK | — |
| FFT | ❌ BROKEN | `fetchFft is not defined` — frontend JS error |
| Drift | ❌ BROKEN | 422 response from backend on Compute |
| Causal | ⚠️ UNTESTED | No compute run attempted |
| Timeseries | ❌ BROKEN | Chart stuck in loading state after upload |
| Settings | ✅ OK | — |

---

## Required Fixes (Priority Order)

1. **FFT page**: Implement `fetchFft` function in `FftPage.tsx`
2. **Timeseries page**: Investigate why chart stays in loading — likely missing `/api/data` fetch call after dataset load
3. **Drift page**: Check backend route and request format for drift detection API

---

## Console Log Observations

- `[TimeseriesPage] CONSTRUCTOR called` — normal initialization
- `[TimeseriesChart] CONSTRUCTOR called` — normal initialization  
- `[ChartView] CONSTRUCTOR called` — normal initialization
- `[useChartEngine] effect fired, ref: true parent: yes result: false status: loading` — repeatedly shown
- `FFT fetch failed: ReferenceError: fetchFft is not defined` — confirmed error

---

## Backend Routes Checked (inferred from behavior)

- `GET /api/data` — should return Arrow IPC time-series data (Timeseries page broken)
- `GET /api/scatter/points` — returning points (Scatter works)
- `GET /api/metadata` — likely working (Scatter/Heatmap show data)
- `POST /api/upload` — working (upload completes)
- `GET /api/drift` or similar — returning 422
- FFT endpoint — not implemented (frontend error)