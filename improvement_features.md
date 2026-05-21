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