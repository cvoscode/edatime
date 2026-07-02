# Spectrogram Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce spectrogram initial render and redraw overhead by precomputing compact per-mode point caches and reusing stable visibility buffers during log toggles and colorbar filtering.

**Architecture:** Keep the existing ECharts heatmap and backend request contract. Refactor `spectrogramChartRuntime.ts` so each compute builds compact `log` and `linear` point caches once, tooltips derive time/frequency from axis indices, and colorbar filtering reuses a stable visible-points buffer instead of allocating fresh filtered arrays on every redraw.

**Tech Stack:** TypeScript, Vitest, ECharts, DOM event-driven page runtime

---

### Task 1: Lock the redraw contract with failing tests

**Files:**
- Modify: `frontend/src/pages/spectrogramPage.test.ts`
- Test: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] **Step 1: Write failing tests for cache reuse and compact tooltip data**

Add tests that:

```ts
it('reuses the cached log-series array when toggling log off and back on', async () => {
    await mountAndCompute();
    const logToggle = document.getElementById('spectrogram-log-scale') as HTMLInputElement;
    const instance = echartsInstances[echartsInstances.length - 1];

    const initialOption = instance.setOption.mock.calls.at(-1)?.[0];
    const firstLogData = initialOption?.series?.[0]?.data;

    logToggle.checked = false;
    logToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    logToggle.checked = true;
    logToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const afterOption = instance.setOption.mock.calls.at(-1)?.[0];
    expect(afterOption?.series?.[0]?.data).toBe(firstLogData);
});

it('reuses the visible data buffer across colorbar drags', async () => {
    await mountAndCompute();
    const instance = echartsInstances[echartsInstances.length - 1];
    const handleHigh = document.querySelector<HTMLElement>('[data-role="cb-handle-high"]')!;
    (handleHigh as any).setPointerCapture = vi.fn();
    (handleHigh as any).releasePointerCapture = vi.fn();

    handleHigh.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 0, button: 0, pointerId: 1 }));
    handleHigh.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 100, pointerId: 1 }));
    handleHigh.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 100, pointerId: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const firstFiltered = instance.setOption.mock.calls.at(-1)?.[0]?.series?.[0]?.data;

    handleHigh.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 100, button: 0, pointerId: 2 }));
    handleHigh.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 120, pointerId: 2 }));
    handleHigh.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 120, pointerId: 2 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const secondFiltered = instance.setOption.mock.calls.at(-1)?.[0]?.series?.[0]?.data;
    expect(secondFiltered).toBe(firstFiltered);
});

it('formats tooltip values from axis indices and compact point payloads', async () => {
    await mountAndCompute();
    const instance = echartsInstances[echartsInstances.length - 1];
    const option = instance.setOption.mock.calls.at(-1)?.[0];
    const formatter = option?.tooltip?.formatter;
    const tooltipHtml = formatter?.({ value: [1, 2, 0.5, 7] });
    expect(String(tooltipHtml)).toContain('Frequency: 300.00 Hz');
    expect(String(tooltipHtml)).toContain('Raw magnitude: 7.0000e+0');
});
```

- [ ] **Step 2: Run the focused test file and verify the new tests fail**

Run: `npm test -- frontend/src/pages/spectrogramPage.test.ts`

Expected: failures showing that the log-toggle path rebuilds data arrays, colorbar drags allocate a fresh series array, and the tooltip no longer matches once compact payloads are assumed.

- [ ] **Step 3: Refactor the tests that currently assert fresh filtered arrays**

Change the existing colorbar test so it keeps checking that filtering reduces visible points, but no longer requires a fresh array allocation.

- [ ] **Step 4: Re-run the focused test file**

Run: `npm test -- frontend/src/pages/spectrogramPage.test.ts`

Expected: still failing, but only for missing runtime implementation.

### Task 2: Refactor spectrogram runtime caching and redraw behavior

**Files:**
- Modify: `frontend/src/pages/spectrogramChartRuntime.ts`
- Test: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] **Step 1: Introduce compact point/cache types**

Add runtime-local types similar to:

```ts
type SpectrogramPoint = [number, number, number, number];

interface SpectrogramRenderCache {
    result: SpectrogramResult;
    freqLen: number;
    raw: Float64Array;
    log: Float64Array;
    linearDisplay: Float64Array;
    logDisplay: Float64Array;
    linearPoints: SpectrogramPoint[];
    logPoints: SpectrogramPoint[];
    visibleLinearPoints: SpectrogramPoint[];
    visibleLogPoints: SpectrogramPoint[];
    linearMin: number;
    linearMax: number;
    logMin: number;
    logMax: number;
    lastVisibleRangeKey: string | null;
    lastVisibleMode: 'linear' | 'log' | null;
}
```

- [ ] **Step 2: Replace the existing cached-grid builder with one-time point materialization**

Build:

```ts
const buildSpectrogramRenderCache = (result: SpectrogramResult): SpectrogramRenderCache => {
    // flatten raw/log values once
    // compute linear/log min/max once
    // build compact [xIndex, yIndex, displayValue, rawValue] tuples once per mode
};
```

Requirements:

- `logPoints` and `linearPoints` are built once per compute
- each tuple stores only indices, display value, and raw value
- no time/frequency duplication in tuple payload

- [ ] **Step 3: Add stable visible-buffer reuse for colorbar filtering**

Implement a helper similar to:

```ts
const getVisiblePoints = (
    cache: SpectrogramRenderCache,
    mode: 'linear' | 'log',
    range: { min: number; max: number } | null,
): SpectrogramPoint[] => {
    // return base points when no range is active
    // otherwise rewrite the mode-specific visible buffer in place
    // reuse tuple references from the base array
};
```

Requirements:

- no `Array.prototype.filter(...)` in the redraw path
- visible buffers keep stable array identity across repeated drags in the same mode
- visible buffers reuse cached tuples rather than creating new ones

- [ ] **Step 4: Update the render path to select cached arrays instead of rebuilding them**

Refactor `renderSpectrogramChart()` so it:

```ts
const mode = logScale ? 'log' : 'linear';
const points = getVisiblePoints(cache, mode, colorFilterRange);
const minValue = mode === 'log' ? cache.logMin : cache.linearMin;
const maxValue = mode === 'log' ? cache.logMax : cache.linearMax;
```

and then passes `points` directly into `series.data`.

- [ ] **Step 5: Update tooltip formatting for compact tuple payload**

Use the point indices to resolve time/frequency:

```ts
const xIndex = Number(value[0]);
const yIndex = Number(value[1]);
const displayMagnitude = Number(value[2]);
const rawMagnitude = Number(value[3]);
const timeMs = Number(timeAxis[xIndex]);
const freq = Number(freqAxis[yIndex]);
```

- [ ] **Step 6: Keep normalized-render behavior intact**

Preserve the current rule:

- frontend log scaling is only active when the applied normalize mode is `none`

- [ ] **Step 7: Run the focused test file**

Run: `npm test -- frontend/src/pages/spectrogramPage.test.ts`

Expected: all spectrogram page tests pass.

### Task 3: Verify the optimization pass end to end

**Files:**
- Modify: none
- Test: `frontend/src/pages/spectrogramPage.test.ts`

- [ ] **Step 1: Run the focused spectrogram tests again**

Run: `npm test -- frontend/src/pages/spectrogramPage.test.ts`

Expected: `Tests 9 passed` or higher if new tests were added.

- [ ] **Step 2: Run the frontend typecheck**

Run: `npm run check:frontend`

Expected: exit code `0`

- [ ] **Step 3: Summarize the performance-facing behavior change**

Report these outcomes:

- initial compute now builds point tuples once per mode
- log toggles reuse cached point arrays
- colorbar drags reuse stable visible buffers instead of allocating fresh filtered arrays
- tooltip output still resolves the same user-visible values
