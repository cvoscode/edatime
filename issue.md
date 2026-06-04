# Frontend Issues Found

## Summary
Issues found during testing of EdaTime app on 2026-06-03 with ETTm2 sample dataset (69,680 rows loaded).

---

## Issue 1: Scatter Plot Shows "WebGPU unavailable"
**Page:** Scatter
**Severity:** Medium
**Root Cause:** The scatter rendering pipeline is WebGPU-only with no Canvas 2D fallback. When `isGPUAvailable()` returns false (line 47-60 in `frontend/src/scatter/runtime.ts`), the empty state is set to `'gpu-unavailable'` which shows the WebGPU error message.

The `FallbackChart` class exists in `frontend/src/charts/fallback.ts` but is never instantiated or used as a fallback for the scatter page.

**Fix:** Modify `frontend/src/scatter/rendering.ts` to instantiate `FallbackChart` when WebGPU is unavailable, analogous to how `DataChart` uses a WebGPU adapter. The scatter runtime at line 86-87 checks `if (_gpuUnavailable && !appState.scatter.chart)` but Never falls back to a Canvas-based chart.

```typescript
// In scatter/rendering.ts, the init function should check for WebGPU availability
// and fall back to FallbackChart when WebGPU is not available:
// import { FallbackChart } from '../charts/fallback.ts';

// Example fix pattern:
if (_gpuUnavailable) {
  const fallback = new FallbackChart('scatter-chart');
  await fallback.init();
  appState.scatter.chart = fallback;
}
```

---

## Issue 2: Timeseries Page Empty Chart Area
**Page:** Timeseries
**Severity:** Medium
**Root Cause:** The chart area shows "Color 0 1 Category" text instead of actual line chart. The `DataChart` in `frontend/src/chart/DataChart.ts` uses WebGPU for rendering. When WebGPU is unavailable, the chart fails silently or renders an empty container.

The actual timeseries line charts are rendered by `DataChart` which wraps ChartGPU. In `frontend/src/app/bootstrap/ensureTimeseriesReady.ts`, if WebGPU is unavailable, the app sets a `gpuError` variable but doesn't fall back to a Canvas-based chart.

**Fix:** Implement a Canvas-based fallback in `DataChart.ts` similar to `FallbackChart`. When `checkWebGPU()` fails, instantiate a fallback renderer that uses 2D Canvas instead of WebGPU. The `updateDataMulti` method in `FallbackChart` shows the pattern for rendering line charts on Canvas.

---

## Issue 3: Spectrogram "Compute" Button Appears Non-Functional
**Page:** Spectrogram
**Severity:** Medium
**Root Cause:** Analysis of `frontend/src/pages/spectrogramChartRuntime.ts` shows that the compute button at line 279 sets `spectrogramResult` but the chart rendering calls `renderSpectrogramChart()` which requires `spectrogramResult` to be set. The network requests showed the spectrogram API was called successfully (`/api/analytics/spectrogram` returned 200).

This is likely a race condition or dimension issue. The code at lines 49-58 waits for `chartEl.clientWidth > 0` and `chartEl.clientHeight > 0`. If the page is not visible when Compute is clicked, the chart container may have zero dimensions and the `waitForSpectrogramChartReady()` timeout (6 attempts × ~16ms = ~100ms) may expire before the element has proper dimensions.

**Fix:** Increase the retry attempts in `waitForSpectrogramChartReady()` from 6 to 20 or more, OR add a fallback that forces dimensions before initializing:
```typescript
const ensureSpectrogramChartDimensions = () => {
    if (chartEl.clientHeight > 0) return;
    chartEl.style.minHeight = '420px';
    if (!chartEl.style.height || chartEl.style.height === '100%') {
        chartEl.style.height = '420px';
    }
};
```

Also verify the `spectrogram-chart` div has proper CSS dimensions set in the HTML.

---

## Issue 4: FFT Page Shows Empty Chart Area Until Column Selected
**Page:** FFT / PSD
**Severity:** Low (may be expected behavior)
**Root Cause:** This is actually **expected behavior**, not a bug**. The FFT page requires user interaction (clicking column chips) before any chart renders. The placeholder text is intentional. However, the UX could be improved by showing a sample/demo chart or better instructions.

If desire is to show a placeholder FFT chart, this would need to pre-compute a demo FFT or show a static illustration.

**Fix:** If this is unintended, add a default "click to select" animation or tutorial indicator. If it's acceptable as-is, close as "won't fix" or "working as designed."

---

## Issue 5: Upload Button "Refreshing stats…" Never Completes
**Page:** Upload
**Severity:** Low
**Root Cause:** After successful upload, the button's loading state isn't being cleared. Looking at the network behavior, the upload completed successfully (`/api/upload` returned 200). The issue is that `deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', false)` is never called after success, OR the callback that clears the button state fires but another process re-enables it.

This is likely a stale closure or race condition where `fetchAndRender` triggers a refresh which re-triggers the loading state.

**Fix:** Add defensive cleanup in the upload path:
```typescript
// After successful upload in frontend/src/features/upload/entrypoint.ts:
// Ensure loading state is cleared and not re-triggered
cleanupFunctions.push(() => {
    setLoading(false);
    buildRangeControls();
});
```

Search for where "Refreshing stats" is set and verify it's cleared in ALL code paths after upload completes.

---

## Issue 6: Settings Page is Empty
**Page:** Settings
**Severity:** Medium
**Root Cause:** The Settings page is a **modal dialog**, not a full page. When navigating to `#page=settings`, the app route exists but there's no dedicated settings page HTML content. The Settings button in the header opens a modal via `openSettingsModal()` in `frontend/src/ui/settingsPanel.ts`.

The snapshot showed empty content because clicking "Settings" in the sidebar navigates to the `#page=settings` route, but the actual settings UI is in a modal that needs to be opened by clicking the settings button (`settings-btn`), not by navigation.

**Fix:** Either:
1. **Close as "working as designed"** - Settings is intentionally a modal, not a page
2. **Or**: Add a `page-settings` route handler that automatically opens the modal when navigating to `#page=settings`

For option 2, add to the page routing:
```typescript
case 'settings':
    openSettingsModal();
    break;
```

---

## Issue 7: Analytics Panel Accessible on All Pages
**Page:** All pages
**Severity:** Low
**Root Cause:** The `AnalyticsDrawer` component is part of the shell layout (`frontend/src/app/shell.ts`) and is mounted globally, appearing on all pages. This is intentional design for consistency, but the controls (ROLLING BANDS, ANOMALIES, etc.) don't apply to all pages.

The analytics drawer uses `appState.selectedCols` and `appState.columnRanges` which don't exist or aren't meaningful on pages like Upload.

**Fix:** Two options:
1. **Hide analytics drawer on pages where it doesn't apply** (Upload, Settings)
2. **Make analytics drawer controls self-document their applicability** - gray out controls when no dataset is loaded

To implement option 1, modify the shell to conditionally render the analytics panel:
```typescript
// In shell.ts, check current page before showing analytics
const shouldShowAnalytics = !['upload', 'settings'].includes(currentPage);
if (shouldShowAnalytics) {
    renderAnalyticsDrawer();
}
```

---

## Previous Issue (Now Likely Resolved)
The original issue.md mentioned `RangeError: Maximum call stack size exceeded` in `buildRangeControls` and failing `/api/database/tables` requests. These were NOT observed during this testing session on port 5173. The app appears to be working better than described in the original issue. However, port 3000 was mentioned in the original issue which suggests it may have been testing a different configuration/server.

---

## Testing Environment
- URL: http://localhost:5173/js/
- Browser: VS Code internal browser (Chromium-based)
- Dataset: ETTm2 sample (69,680 rows, 7 numeric series)
- Test date: 2026-06-03

---

## Priority Fix Order
1. **Issue 2** (Timeseries chart) - High impact, users can't see their data, fallback to the Echarts plot
2. **Issue 1** (Scatter WebGPU) - High impact, scatter is completely unusable without WebGPU
3. **Issue 3** (Spectrogram) - Medium impact, feature doesn't work
4. **Issue 5** (Upload button) - Low impact but annoying UX
5. **Issue 6** (Settings) - Probably working as designed (modal dialog)
6. **Issue 4** (FFT) - Working as designed
7. **Issue 7** (Analytics panel) - Design decision, low priority
