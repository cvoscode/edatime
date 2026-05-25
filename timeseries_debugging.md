# Timeseries Chart Not Loading - Root Cause Analysis

## Error Observed

```
[ERROR] [useChartEngine] init failed: NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.
    at jt (index.D6G8XFGJ.js:2:23865)
    at Rt (index.D6G8XFGJ.js:2:21644)
    ...
```

Chart engine falls back to `error` state. No chart renders.

---

## How the Chart System Works

### Architecture Overview

```
TimeseriesPage
  └── TimeseriesChart
        └── ChartView
              ├── useChartViewport (manages zoom/pan state)
              ├── useChartEngine    (initializes chart adapter)
              │     └── ChartRegistry.createAndInitChartAdapter()
              │           ├── selectEngine() → 'ChartGPU' | 'ECharts'
              │           └── EChartsAdapter.initialize()
              │                 └── echarts.init(workContainer, ...)
              └── CanvasOverlay (draw tool overlays)
```

### Component Hierarchy

1. **TimeseriesPage** (`frontend/src/pages/TimeseriesPage.tsx`)
   - Manages series selection, filters, toolbar state
   - Passes `options` (viewport, colors, rolling bands, etc.) to `TimeseriesChart`
   - Receives `onChartReady` and `onEngineReady` callbacks

2. **TimeseriesChart** (`frontend/src/features/timeseries/components/TimeseriesChart.tsx`)
   - Thin wrapper around `ChartView` with container ID `"timeseries-chart"`
   - Applies adaptive filter state and draw tool settings

3. **ChartView** (`frontend/src/components/chart/ChartView.tsx`)
   - The core chart container component
   - Owns a `containerRef` (HTMLDivElement) where the chart renders
   - Has a `selectionBoxRef` for zoom box selection
   - Uses two hooks: `useChartViewport` and `useChartEngine`

4. **useChartEngine** (`frontend/src/hooks/useChartEngine.ts`)
   - Manages chart lifecycle (init, dispose, resize)
   - Calls `initChartEngine()` which delegates to `ChartRegistry`

5. **ChartRegistry** (`frontend/src/components/chart/ChartRegistry.ts`)
   - `selectEngine()` decides between `'ChartGPU'` and `'ECharts'`
   - `'auto'` mode: WebGPU only if `isWebGPUSupported()` returns true AND chart type is timeseries

6. **EChartsAdapter** (`frontend/src/components/chart/EChartsAdapter.ts`)
   - Implements `ChartAdapter` interface
   - Initializes ECharts on a detached `workContainer`, then swaps it into DOM
   - Uses double `requestAnimationFrame` defer to avoid SolidJS reactivity conflicts

---

## Root Cause

### The Double-swap DOM Mutation Pattern (Buggy)

`EChartsAdapter.initialize()` performs this sequence:

```
1. Clean container (remove all children)
2. await requestAnimationFrame(() => requestAnimationFrame(resolve))  // Double defer
3. Clean container again
4. Verify container.isConnected && container.parentElement !== null
5. Create detached workContainer (position:absolute;inset:0)
6. echarts.init(workContainer, ...)  // ECharts creates canvas children inside workContainer
7. parent.replaceChild(workContainer, container)  // Swap container → workContainer
```

The bug is at **step 7**: `parent.replaceChild(workContainer, container)` swaps the original container out of the DOM at the moment ECharts may still be operating on `workContainer`'s internal DOM structure. The double `requestAnimationFrame` defer is supposed to wait for SolidJS reactive effects to settle, but it doesn't reliably do so — SolidJS's scheduler can cause DOM mutations even after two animation frames if component re-renders are triggered by data or viewport changes.

### Why `insertBefore` Fails

Inside ECharts (`echarts.init`), when ECharts tries to insert canvas elements into `workContainer`, it uses `insertBefore` operations. The error `"The node before which the new node is to be inserted is not a child of this node"` occurs because the DOM node relationships inside `workContainer` become unstable during the swap at step 7 — specifically, when `parent.replaceChild(workContainer, container)` executes, it can trigger a structural change that ECharts was mid-operation on. The double `requestAnimationFrame` doesn't reliably prevent this because SolidJS's reactive scheduler can defer effect execution across multiple frames, especially when data or viewport changes trigger re-renders during initialization.

---

## Data Flow for Chart Rendering

```
1. TimeseriesPage renders → TimeseriesChart renders → ChartView mounts
2. ChartView.onMount → useChartEngine effect fires
3. initChartEngine() → createAndInitChartAdapter()
4. selectEngine() → 'ECharts' (WebGPU not available)
5. EChartsAdapter.initialize(container):
   a. Cleans container
   b. Double rAF defer
   c. Cleans container again
   d. Verifies container in DOM
   e. Creates workContainer
   f. echarts.init(workContainer) ← canvas children created inside workContainer
   g. parent.replaceChild(workContainer, container) ← DOM swap
   h. Sets this.instance = instance
6. initChartEngine returns { instance, dispose, resize }
7. useChartEngine sets chartStatus='ready'
8. ChartView.createEffect fires → calls props.onReady(handleUpdateChart)
9. handleUpdateChart → chartInstance.setOption({ series: [...] }) ← chart renders
```

---

## Key Files and Line References

| File | Symbol | Line | Purpose |
|------|--------|------|---------|
| `frontend/src/components/chart/EChartsAdapter.ts` | `initialize()` | ~84-150 | **Bug location** - Double-swap DOM pattern |
| `frontend/src/components/chart/chartEngine.ts` | `initChartEngine()` | 126-168 | Entry point for chart initialization |
| `frontend/src/components/chart/ChartRegistry.ts` | `createAndInitChartAdapter()` | 64-77 | Creates and inits adapter |
| `frontend/src/components/chart/ChartRegistry.ts` | `selectEngine()` | 31-45 | Engine selection logic |
| `frontend/src/hooks/useChartEngine.ts` | `useChartEngine()` | 28-118 | Chart lifecycle management |
| `frontend/src/components/chart/ChartView.tsx` | `ChartView` | 37-363 | Main chart container component |
| `frontend/src/features/timeseries/components/TimeseriesChart.tsx` | `TimeseriesChart` | 22-95 | Timeseries wrapper |
| `frontend/src/pages/TimeseriesPage.tsx` | `TimeseriesPage` | 30-535 | Page component |

---

## Key Code Sections

### EChartsAdapter.initialize() - the problematic pattern

```typescript
// Lines ~76-110 in EChartsAdapter.ts
async initialize(container: HTMLElement, options: ChartOptions): Promise<void> {
  // ...
  // Clean container BEFORE the defer
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Defer by TWO animation frames
  await new Promise(resolve => {
    requestAnimationFrame(() => { requestAnimationFrame(resolve); });
  });

  // Clean container AFTER reactive batch settles
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Verify container is still connected to DOM
  if (!container.isConnected || container.parentElement === null) {
    throw new Error('Container is no longer in DOM');
  }

  // Create detached workContainer for ECharts init
  const workContainer = document.createElement('div');
  workContainer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';

  // Init ECharts on detached container
  let instance: any;
  try {
    instance = echarts.init(workContainer, themeName, { renderer: 'canvas' });
  } catch (initErr) {
    try {
      instance = echarts.init(workContainer, undefined, { renderer: 'canvas' });
    } catch (bareErr) {
      throw bareErr;
    }
  }

  // Swap: replace container with workContainer in DOM
  const parent = container.parentElement;
  if (parent) {
    parent.replaceChild(workContainer, container);  // ← container is now orphaned
  }
  // ...
}
```

### useChartEngine init flow

```typescript
// Lines ~55-85 in useChartEngine.ts
const init = async () => {
  if (initInProgress) return;
  const ref = containerRef();  // ← reads ref from SolidJS signal
  if (!ref || !ref.parentElement) return;
  initInProgress = true;

  try {
    chartResult = await initChartEngine({
      container: ref,
      // ...
    });
    // ...
    setChartStatus('ready');
  } catch (e) {
    setChartStatus('error');
  }
};
```

---

## Timing Issue

The error occurs because:

1. `containerRef` in `ChartView` is a plain `let` variable (assigned via JSX `ref={containerRef}`), not a signal — but the ref callback can be invoked multiple times if SolidJS unmounts/remounts the component during initialization
2. Between the double rAF defer and `echarts.init`, SolidJS reactive updates triggered by data or viewport changes can modify the component tree
3. When ECharts tries to insert canvas children into `workContainer`, the DOM node relationships become unstable due to the concurrent reactive updates
4. This causes `insertBefore` to fail with "node is not a child of this node"

---

## Summary

**Root cause**: The double `requestAnimationFrame` defer in `EChartsAdapter.initialize()` does not reliably wait for SolidJS's reactive batching to complete. When ECharts initializes on a detached `workContainer` and then swaps it into the DOM via `replaceChild`, concurrent SolidJS reactive updates triggered by data or viewport changes can destabilize the DOM node relationships inside `workContainer`, causing the `insertBefore` error.

**Fix direction**: The `initialize` method needs a more robust way to ensure DOM stability before and during ECharts initialization. Options include using a MutationObserver to watch for DOM changes, deferring initialization until after the reactive batch fully settles with a microtask, or restructuring to avoid the detach-then-swap pattern entirely.