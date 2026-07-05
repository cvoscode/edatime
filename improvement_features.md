# Improvement Features Ledger

## 2026-05-21

### Issue: ChartGPU Fallback Not Working in Auto Mode

**Impact:** High  
**Effort:** Medium

**Description:**  
When ChartGPU fails to initialize in auto mode (e.g., `NotFoundError: Failed to execute 'insertBefore' on 'Node'`), the fallback to ECharts doesn't trigger properly. The error occurs deep inside ChartGPU's internal code during blob URL import, before our try-catch can capture it.

**Evidence:**
```
[ChartRegistry] Auto mode, checkWebGPUAdapterAvailable: true
[ChartRegistry] Final engine selection: ChartGPU
[useChartEngine] init failed: NotFoundError: Failed to execute 'insertBefore' on 'Node':
    at jt (http://127.0.0.1:3000/assets/index.DDgZZHls.js:2:23865)
```

**Missing expected log:** `[ChartRegistry] ChartGPU init failed, falling back to ECharts:`

**Root cause:** The error originates from ChartGPU's own initialization (`jt` function) before our wrapper's try-catch can intercept it.

**Current behavior:** ChartGPU selected in auto mode → init fails → chart status set to 'error' → no data rendered

**Desired behavior:** ChartGPU selected in auto mode → init fails → fallback to ECharts → chart renders with data

**Affected files:**
- `frontend/src/components/chart/ChartRegistry.ts` - fallback logic present but not catching the error
- `frontend/src/components/chart/ChartGPUAdapter.ts` - error thrown before try-catch
- `frontend/src/hooks/useChartEngine.ts` - catches error and sets status to 'error'

**Next steps:**
1. Make ChartGPU more resilient to DOM initialization issues
2. Ensure fallback triggers reliably when ChartGPU init fails at any stage
3. Add better error logging to identify exact failure point
4. Consider making 'echarts' the default in auto mode until ChartGPU is more stable

---

### Issue: Backend Data Not Loaded on Startup

**Impact:** High  
**Effort:** Low

**Description:**  
When the backend server starts, it doesn't automatically load a default dataset. The frontend shows "No data loaded" until user uploads data via the UI.

**Current state:** `GET /api/metadata` returns `{"revision":0,"total_rows":0,...}`

**Expected:** ETTm2.csv or similar dataset loaded on startup for demo/development purposes.

---

### Issue: Browser Service Worker Caching Old Frontend

**Impact:** Medium  
**Effort:** Low

**Description:**  
When rebuilding the frontend, the browser may serve old cached content via service worker, making it appear the rebuild didn't take effect.

**Workaround:** Open new browser page with `forceNew: true` or disable SW in dev.

**Fix:** Ensure service worker cache busting works correctly with versioned assets.

---

## 2026-07-05 — ETTm2 walkthrough

Audited the app end-to-end with the ETTm2 sample dataset. Full list with
fix plans lives in `issue.md` at the repo root. Ledger entries below are
the high-impact findings surfaced from that pass.

### Issue: Scatter shows "No scatter points found" when "Link chart range" is on but no time filter is set

**Impact:** High  
**Effort:** Low

**Description:**  
With Link chart range enabled and no active viewport / adaptive filter,
scatter shows the empty-state copy "No scatter points found — No points
match active filters (1 column, 0 adaptive)." even though the density
backdrop contains data. Toggling the checkbox off recovers points.

**Fix plan:** F1 in `issue.md`.

### Issue: Scatter Y-axis range is wrong (positive-only) for HULL with a stripe at y = 1.49

**Impact:** High  
**Effort:** Low

**Description:**  
HULL range is `min=-29.32, max=36.44` but the scatter Y-axis shows
ticks at `1.49, 13.44, 25.40, 37.36` and a long horizontal bright
stripe is visible at the floor.

**Fix plan:** F2 in `issue.md`.

### Issue: Correlation matrix colormap appears inverted for positive values

**Impact:** High  
**Effort:** Medium

**Description:**  
Diagonal `1.00` cells render dark red, off-diagonal `0.67` cells render
white/pale, and `0.91` cells render lighter than `0.67`. The mapping
seems reversed for the `[0, 1]` half of the diverging colormap.

**Fix plan:** F3 in `issue.md`.

### Issue: Drift page uses an off-by-2-hour timestamp for Start/End and flags every window RED

**Impact:** High  
**Effort:** Medium

**Description:**  
Default reference shows `01/07/2016 02:00 → 28/06/2017 23:52`, while the
dataset spans `2016-07-01 00:00:00 → 2018-06-26 19:45:00`. Resulting
output flags `363/363` windows RED across all 7 columns with identical
"Strongest reasons: psi_major, wasserstein, ks, es" — likely a
degenerate comparison driven by the misaligned reference.

**Fix plan:** F4 + F5 in `issue.md`.

### Issue: Timeseries legend overlaps Y-axis labels when zoomed in

**Impact:** High  
**Effort:** Low

**Description:**  
After zooming (e.g. `7d`), the floating trace legend renders on top of
the Y-axis tick labels (`61.11`, `46.53`), making both unreadable.

**Fix plan:** F8 in `issue.md`.

### Issue: Timeseries "X of N active" counter is stale after toggling chips

**Impact:** Medium  
**Effort:** Low

**Description:**  
Toggling MUFL on updates the legend/trace but the inline text still
reads `3 of 7 active`.

**Fix plan:** F6 in `issue.md`.

### Issue: Timeseries chips and "Filter columns" row layout is broken when chips overflow

**Impact:** Medium  
**Effort:** Low

**Description:**  
With ≥5 chips selected the chips overflow above the toolbar row, leaving
the SERIES label isolated. Should be a single horizontally-scrolling
group.

**Fix plan:** F7 in `issue.md`.

### Issue: Spectrogram X-axis labels rotated nearly vertical, color range dominated by yellow

**Impact:** Medium  
**Effort:** Low

**Description:**  
Time labels at ~90° rotation fight each other; with default normalize
"None", the heatmap is mostly bright yellow because the data range
(-3.998..0.575 log10) is not adapted to the visible data.

**Fix plan:** F12 in `issue.md`.

### Issue: FFT Y-axis "log10(Magnitude)" shows negative values

**Impact:** Medium  
**Effort:** Low

**Description:**  
Magnitudes are non-negative, so log10 should be ≥ 0. The axis shows
`0.164, -0.615, -1.393, -2.171, -2.949`, suggesting log is being
applied after an unexpected shift or the axis is offset.

**Fix plan:** F11 in `issue.md`.

### Issue: Causal workflow banner shows an empty action box with only ✕

**Impact:** Medium  
**Effort:** Low

**Description:**  
On the Causal page the guided-workflow card renders a small empty box
containing only an ✕ button. Other pages (Upload, Scatter) correctly
render an "Open …" action button.

**Fix plan:** F13 in `issue.md`.

### Issue: Drift Columns picker doesn't look like a multi-select

**Impact:** Medium  
**Effort:** Low

**Description:**  
The columns pill renders as a single-value combobox until opened;
users miss that it is a multi-select.

**Fix plan:** F10 in `issue.md`.

### Issue: Timeseries negative values hidden when Pin lower bound is on by default

**Impact:** Medium  
**Effort:** Low

**Description:**  
HULL values below zero (real min -29.32) are clipped at 0 with
"Pin lower bound" enabled by default — losing visibility of negative
excursions and outliers.

**Fix plan:** F9 in `issue.md`.

### Issue: Home sample card description may clip on Sinusoidal card

**Impact:** Low  
**Effort:** Low

**Fix plan:** F15 in `issue.md`.

### Issue: Timeseries "Viewing X%" indicator shows a fraction briefly after Quick Range

**Impact:** Low  
**Effort:** Low

**Fix plan:** F14 in `issue.md`.

### Issue: Settings, drawing tools, analytics modal, annotations, additional exports not exercised in this pass

**Impact:** Unknown  
**Effort:** N/A

**Next steps:** Schedule a follow-up walkthrough and file any new issues.

**Fix plan:** F17 in `issue.md`.