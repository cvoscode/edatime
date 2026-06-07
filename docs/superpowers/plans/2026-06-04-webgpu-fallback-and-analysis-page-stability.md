# WebGPU Fallback And Analysis Page Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add usable non-WebGPU fallbacks for scatter and FFT, make the settings route open the existing modal, and prevent FFT/spectrogram analysis pages from collapsing their chart viewport.

**Architecture:** Keep the current page runtimes and controls intact, but replace direct WebGPU-only failure paths with adapter-style fallbacks. Use ECharts as the non-WebGPU renderer for scatter and FFT because those pages already rely on chart-like interactions and need a real visual output, while fixing page layout at the shell/CSS layer so chart containers receive stable height.

**Tech Stack:** TypeScript, Vitest, ECharts, existing page runtime helpers, Playwright browser verification, Rust dev server via `make dev`

---

### Task 1: Codify The Broken Behavior

**Files:**
- Modify: `frontend/src/scatter/runtime.test.ts`
- Modify: `frontend/src/pages/fftPage.test.ts`
- Create: `frontend/src/ui/pageNavigation.test.ts`

- [ ] **Step 1: Write the failing scatter fallback expectation**

Add a test in `frontend/src/scatter/runtime.test.ts` that asserts the empty state does **not** report `gpu-unavailable` once a fallback chart object exists for scatter.

- [ ] **Step 2: Run the scatter runtime test to verify the current failure surface**

Run: `npm test -- frontend/src/scatter/runtime.test.ts`
Expected: current tests pass, and the new assertion either fails or requires production code support.

- [ ] **Step 3: Write the failing FFT fallback test**

Add a test in `frontend/src/pages/fftPage.test.ts` that makes `FftChart.init()` reject with a WebGPU error and asserts the page still installs a fallback chart path and keeps the empty state/render hooks usable.

- [ ] **Step 4: Run the FFT page test to verify it fails**

Run: `npm test -- frontend/src/pages/fftPage.test.ts`
Expected: FAIL because `initFftPage()` currently assumes `FftChart` will initialize successfully.

- [ ] **Step 5: Write the failing settings-route test**

Create `frontend/src/ui/pageNavigation.test.ts` to assert clicking the `data-page="settings"` nav item opens the modal helper instead of only hiding/showing page sections.

- [ ] **Step 6: Run the page-navigation test to verify it fails**

Run: `npm test -- frontend/src/ui/pageNavigation.test.ts`
Expected: FAIL because `initPageNavigation()` currently treats settings like a normal page.

### Task 2: Add Reusable ECharts Fallbacks

**Files:**
- Create: `frontend/src/chart/EchartsLineChart.ts`
- Create: `frontend/src/chart/EchartsScatterChart.ts`
- Modify: `frontend/src/pages/fftPage.ts`
- Modify: `frontend/src/scatter/scatterPage.ts`

- [ ] **Step 1: Implement a focused ECharts line fallback for FFT**

Create `frontend/src/chart/EchartsLineChart.ts` with a small wrapper that:
- initializes an ECharts instance
- supports `updateData(traces, mode, logScale)`
- supports `clear()`, `resize()`, and `destroy()`
- exposes a no-op `resetView()` / `getIsZoomed()` compatible surface for the FFT page

- [ ] **Step 2: Implement a focused ECharts scatter fallback**

Create `frontend/src/chart/EchartsScatterChart.ts` with a small wrapper that:
- initializes an ECharts scatter instance in `#scatter-chart`
- accepts the existing scatter option payload
- supports `setOption()`, `resize()`, `dispose()`
- safely no-ops on `onPerformanceUpdate`

- [ ] **Step 3: Wire the FFT page to fall back to ECharts**

Update `frontend/src/pages/fftPage.ts` so `initFftPage()`:
- tries `FftChart.init()`
- on failure logs a warning, swaps to `EchartsLineChart`
- keeps chip rendering, export binding, and status updates functional

- [ ] **Step 4: Wire the scatter page to fall back to ECharts**

Update `frontend/src/scatter/scatterPage.ts` so `renderScatter()`:
- still probes WebGPU once
- creates `EchartsScatterChart` when WebGPU is unavailable
- avoids the current empty-state dead end for `gpu-unavailable`

- [ ] **Step 5: Re-run the targeted tests**

Run:
- `npm test -- frontend/src/pages/fftPage.test.ts`
- `npm test -- frontend/src/scatter/runtime.test.ts`

Expected: PASS

### Task 3: Make The Settings Route Open The Existing Modal

**Files:**
- Modify: `frontend/src/ui/pageNavigation.ts`
- Modify: `frontend/src/ui/settingsPanel.ts`
- Test: `frontend/src/ui/pageNavigation.test.ts`

- [ ] **Step 1: Add an explicit settings-route branch**

Update `frontend/src/ui/pageNavigation.ts` so `showPage('settings')` opens the existing settings modal helper and leaves the current content page visible instead of showing an empty shell.

- [ ] **Step 2: Export the minimal route-safe modal entrypoint if needed**

If necessary, expose a small helper from `frontend/src/ui/settingsPanel.ts` that page navigation can call without re-binding panel events.

- [ ] **Step 3: Run the settings navigation test**

Run: `npm test -- frontend/src/ui/pageNavigation.test.ts`
Expected: PASS

### Task 4: Stabilize FFT And Spectrogram Chart Height

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/css/modules/layout.css`
- Modify: `frontend/css/modules/chart.css`
- Modify: `frontend/src/pages/spectrogramChartRuntime.ts`

- [ ] **Step 1: Add page-specific structure hooks**

Update `frontend/index.html` so FFT and spectrogram pages can be styled independently, for example by adding page-specific classes to the page root and/or chart `main` container.

- [ ] **Step 2: Make advanced analysis pages scroll instead of collapsing the chart**

Update `frontend/css/modules/layout.css` and/or `frontend/css/modules/chart.css` so pages with tall toolbars/guidance use:
- `overflow: auto` on the page
- a minimum chart region height
- a non-zero flex basis for the chart container

- [ ] **Step 3: Make spectrogram init enforce a usable minimum canvas height**

Update `frontend/src/pages/spectrogramChartRuntime.ts` so readiness checks and resize recovery ensure the chart container gets a real minimum height before ECharts initializes or resizes.

- [ ] **Step 4: Re-run the page-level tests that touch these areas**

Run:
- `npm test -- frontend/src/pages/fftPage.test.ts`
- `npm test -- frontend/src/pages/spectrogramPage.test.ts`

Expected: PASS

### Task 5: Verify In Browser

**Files:**
- Modify: none

- [ ] **Step 1: Start the dev server**

Run: `make dev`
Expected: server listens on `http://127.0.0.1:3000`

- [ ] **Step 2: Reproduce the previously broken pages**

Verify in a browser:
- upload `ETTm2.csv`
- `Timeseries` still renders
- `Scatter` renders with fallback on non-WebGPU
- `FFT / PSD` shows a usable fallback chart instead of a console-thrown dead area
- `Spectrogram` keeps a full-height chart area after compute
- `Settings` nav opens the modal instead of showing a blank page

- [ ] **Step 3: Run the relevant test batch**

Run: `npm test -- frontend/src/scatter/runtime.test.ts frontend/src/pages/fftPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/ui/pageNavigation.test.ts`
Expected: PASS
