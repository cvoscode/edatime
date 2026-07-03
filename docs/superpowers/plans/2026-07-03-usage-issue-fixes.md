# Usage Issue Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current `usage_issue.md` audit into a code-backed fix pass that removes stale findings, hardens already-fixed regressions with tests, and lands the remaining live UX/layout fixes in the real owner modules.

**Architecture:** Treat `usage_issue.md` as a routing artifact, not as ground truth. First prove which P0 findings are already fixed and lock them in with regression tests, then prune the doc. After that, patch the live issues at their actual seams: shared timeseries chart layout, heatmap label layout, FFT/spectrogram formatters, y-range guidance, dataset column ordering, and sidebar shortcut CSS.

**Tech Stack:** TypeScript, Vitest, HTML/CSS modules, existing frontend store/runtime modules, optional Rust metadata verification only if the frontend-only ordering fix proves insufficient.

---

## File Map

- `usage_issue.md`
  - Remaining audit log that should only describe unresolved work after this pass.
- `frontend/src/ui/pageNavigation.test.ts`
  - Sidebar/hash routing smoke coverage for the already-fixed navigation bug.
- `frontend/src/scatter/runtime.test.ts`
  - Empty-state guardrails for the already-fixed scatter false-empty regression.
- `frontend/src/chart/DataChart.ts`
  - Timeseries rendering, axis layout, robust-range heuristics, in-canvas legend.
- `frontend/src/chart/chartOverlays.ts`
  - Overlay plot geometry; must stay aligned with the chart grid.
- `frontend/src/chart/chartInteractions.ts`
  - Drag/zoom math that currently assumes a fixed left gutter.
- `frontend/src/pages/heatmapPage.ts`
  - Correlation matrix DOM/grid generation.
- `frontend/css/modules/scatter.css`
  - Heatmap label wrapping, clipping, and matrix cell layout.
- `frontend/src/store/datasetState.ts`
  - Derives `numericCols`; best seam for cross-page column ordering consistency.
- `frontend/src/features/timeseries/columnsController.ts`
  - Chip summary copy; best seam for “3 of 7 active” guidance.
- `frontend/src/chart/FftChart.ts`
  - FFT axis/peak label formatting and collision behavior.
- `frontend/src/utils/spectralPresets.ts`
  - Shared frequency/period formatting helpers that FFT and spectrogram should reuse.
- `frontend/src/pages/spectrogramChartRuntime.ts`
  - Spectrogram axis formatters, tooltip units, DOM colorbar labels.
- `frontend/css/modules/layout.css`
  - Spectrogram colorbar spacing/clipping.
- `frontend/index.html`
  - Y-range toolbar markup and shared info-tip anchors.
- `frontend/src/ui/yRangeControls.ts`
  - Wires robust-range controls; best seam for help text + spike guidance.
- `frontend/src/ui/toolbar.ts`
  - Shared toolbar bootstrap; can bind the y-range info popovers once.
- `frontend/css/modules/sidebar.css`
  - Sidebar shortcut badge metrics and clipping.

### Task 1: Lock In Fixed P0 Regressions And Prune The Audit

**Files:**
- Modify: `frontend/src/ui/pageNavigation.test.ts`
- Modify: `frontend/src/scatter/runtime.test.ts`
- Modify: `usage_issue.md`

- [ ] **Step 1: Add a sidebar-routing smoke test that walks the real nav sequence**

```ts
it('keeps exactly one page hash while walking major sidebar pages', async () => {
    const { initPageNavigation } = await import('./pageNavigation.js');
    initPageNavigation();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const walk: Array<[string, string]> = [
        ['timeseries', '#page=timeseries'],
        ['heatmap', '#page=heatmap'],
        ['scatter', '#page=scatter'],
        ['fft', '#page=fft'],
        ['spectrogram', '#page=spectrogram'],
        ['causal', '#page=causal'],
        ['drift', '#page=drift'],
    ];

    for (const [page, expectedHash] of walk) {
        (document.querySelector(`.nav-item[data-page="${page}"]`) as HTMLButtonElement).click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(window.location.hash).toBe(expectedHash);
    }
});
```

- [ ] **Step 2: Add a scatter runtime test that proves non-empty density data suppresses the empty overlay**

```ts
it('keeps the empty state hidden when scatter points exist', async () => {
    const { appState } = await import('../store/index.js');
    appState.scatter.totalPoints = 42;
    appState.scatter.loading = false;
    appState.scatter.chart = {} as any;
    syncScatterEmptyState();

    expect(emptyStateUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
            visible: false,
        }),
    );
});
```

- [ ] **Step 3: Run the targeted regression tests and use the result to prune stale issue text**

Run: `npm test -- frontend/src/ui/pageNavigation.test.ts frontend/src/scatter/runtime.test.ts`
Expected: PASS. These bugs are already fixed in `router.ts`, `pageNavigation.ts`, and `scatter/runtime.ts`; the new tests exist to prove the doc is stale.

- [ ] **Step 4: Remove the stale routing and scatter-empty sections from `usage_issue.md` and tighten the cross-cutting note**

```md
- **No regression panel for routing.**
  The current router already replaces the hash correctly; keep the new sidebar-walk test as the guardrail and remove the old reproduction steps.

- **No “no points” guard on scatter.**
  The current scatter runtime already hides the empty state when `totalPoints > 0`; keep the regression test and drop the stale user-facing complaint.
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/pageNavigation.test.ts frontend/src/scatter/runtime.test.ts usage_issue.md
git commit -m "test: lock in fixed usage-audit regressions"
```

### Task 2: Replace The Fixed Timeseries Left Gutter With Measured Grid Layout

**Files:**
- Create: `frontend/src/chart/gridLayout.ts`
- Modify: `frontend/src/chart/DataChart.ts`
- Modify: `frontend/src/chart/chartOverlays.ts`
- Modify: `frontend/src/chart/chartInteractions.ts`
- Modify: `frontend/src/chart/DataChart.test.ts`
- Modify: `frontend/src/chart/chartInteractions.test.ts`

- [ ] **Step 1: Write a failing grid-layout unit test that shows the fixed `120px` gutter is over-reserved**

```ts
import { describe, expect, it } from 'vitest';
import { computeChartGrid } from './gridLayout.js';

describe('computeChartGrid', () => {
    it('shrinks the left gutter for short y labels and expands when a y-axis title exists', () => {
        const compact = computeChartGrid({
            width: 1200,
            height: 480,
            yTickLabels: ['113.76', '81.49', '49.21'],
            yAxisLabel: '',
            scale: 1,
        });
        const titled = computeChartGrid({
            width: 1200,
            height: 480,
            yTickLabels: ['113.76', '81.49', '49.21'],
            yAxisLabel: 'Temperature',
            scale: 1,
        });

        expect(compact.left).toBeLessThan(120);
        expect(compact.left).toBeGreaterThanOrEqual(64);
        expect(titled.left).toBeGreaterThan(compact.left);
    });
});
```

- [ ] **Step 2: Implement a shared grid calculator and stop hard-coding `CHART_GRID.left = 120`**

```ts
export interface ChartGridMetrics {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export function computeChartGrid(input: {
    width: number;
    height: number;
    yTickLabels: string[];
    yAxisLabel: string;
    scale: number;
}): ChartGridMetrics {
    const fontPx = Math.max(10, Math.round(12 * input.scale));
    const widestLabel = Math.max(...input.yTickLabels.map((label) => label.length), 0);
    const labelWidth = widestLabel * fontPx * 0.62;
    const yAxisAllowance = input.yAxisLabel.trim() ? fontPx + 18 * input.scale : 8 * input.scale;
    return {
        left: Math.max(64 * input.scale, Math.ceil(labelWidth + yAxisAllowance + 18 * input.scale)),
        right: 30 * input.scale,
        top: 16 * input.scale,
        bottom: 36 * input.scale,
    };
}
```

- [ ] **Step 3: Thread the computed grid through render, overlays, and drag math**

```ts
const yTicks = niceLinearTicks(domains.yMin, domains.yMax, 6).map((value) => formatTwoDecimals(value));
const grid = computeChartGrid({
    width,
    height,
    yTickLabels: yTicks,
    yAxisLabel: String(this._yAxisLabel ?? ''),
    scale,
});
```

```ts
const grid = this._getCurrentGridMetrics();
const plotLeft = grid.left;
const plotRight = Math.max(plotLeft + 1, width - grid.right);
```

- [ ] **Step 4: Add interaction coverage so drag-to-viewport uses the measured grid instead of the old constant**

```ts
it('maps drag coordinates against the computed plot box', () => {
    const grid = { left: 84, right: 30, top: 16, bottom: 36 };
    const viewport = dragToViewport(
        { startX: 100, startY: 40, endX: 300, endY: 180 },
        800,
        320,
        grid,
        { min: 0, max: 100 },
        { min: -10, max: 10 },
    );
    expect(viewport?.xMin).toBeGreaterThan(0);
    expect(viewport?.xMax).toBeLessThan(100);
});
```

- [ ] **Step 5: Run the focused chart tests**

Run: `npm test -- frontend/src/chart/DataChart.test.ts frontend/src/chart/chartInteractions.test.ts`
Expected: FAIL before the helper is wired everywhere, PASS after `DataChart`, `chartOverlays`, and `chartInteractions` all read the same computed grid.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/chart/gridLayout.ts frontend/src/chart/DataChart.ts frontend/src/chart/chartOverlays.ts frontend/src/chart/chartInteractions.ts frontend/src/chart/DataChart.test.ts frontend/src/chart/chartInteractions.test.ts
git commit -m "fix: compute timeseries chart gutters from measured labels"
```

### Task 3: Make Correlation Heatmap Headers Readable At Small Cell Sizes

**Files:**
- Modify: `frontend/src/pages/heatmapPage.ts`
- Modify: `frontend/css/modules/scatter.css`
- Modify: `frontend/src/pages/heatmapPage.test.ts`

- [ ] **Step 1: Write a failing layout test for narrow-cell heatmaps**

```ts
it('switches narrow heatmap headers into a vertical label mode', async () => {
    const slider = document.getElementById('heatmap-cell-size') as HTMLInputElement;
    slider.value = '24';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    await activateHeatmap();

    const headers = Array.from(document.querySelectorAll('.heatmap-header'));
    expect(headers.some((header) => header.classList.contains('heatmap-header--vertical'))).toBe(true);
});
```

- [ ] **Step 2: Add a header mode in `heatmapPage.ts` instead of always allowing `overflow-wrap:anywhere`**

```ts
const useVerticalHeaders = responsiveCell < 34;
const headerClass = [
    'heatmap-header',
    isFirstInCluster ? 'heatmap-header--cluster-start' : '',
    useVerticalHeaders ? 'heatmap-header--vertical' : '',
].filter(Boolean).join(' ');
```

- [ ] **Step 3: Update CSS so narrow headers rotate cleanly and row labels stay clipped to their gutters**

```css
.heatmap-header--vertical {
  align-items: center;
  justify-content: center;
  min-height: 72px;
  padding: 4px 0 8px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  white-space: nowrap;
  overflow-wrap: normal;
}

.heatmap-row-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 4: Re-run the heatmap regression suite**

Run: `npm test -- frontend/src/pages/heatmapPage.test.ts`
Expected: FAIL while the test still expects the old always-horizontal layout, PASS once the orientation toggle and clipping rules are in place.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/heatmapPage.ts frontend/css/modules/scatter.css frontend/src/pages/heatmapPage.test.ts
git commit -m "fix: keep correlation heatmap labels readable at small cell sizes"
```

### Task 4: Unify Numeric Column Order Across Upload, Timeseries, And Scatter

**Files:**
- Modify: `frontend/src/store/datasetState.ts`
- Create: `frontend/src/store/datasetState.test.ts`
- Modify: `frontend/src/features/timeseries/columnsController.test.ts`

- [ ] **Step 1: Write a failing dataset-state test that proves `metadata.columns` order should win**

```ts
it('derives numericCols from metadata.columns order instead of trusting numeric_columns order', () => {
    setMetadata({
        columns: [
            { name: 'date', dtype: 'Datetime' },
            { name: 'HUFL', dtype: 'Float64' },
            { name: 'HULL', dtype: 'Float64' },
            { name: 'LUFL', dtype: 'Float64' },
            { name: 'LULL', dtype: 'Float64' },
            { name: 'MUFL', dtype: 'Float64' },
            { name: 'MULL', dtype: 'Float64' },
            { name: 'OT', dtype: 'Float64' },
        ],
        numeric_columns: ['HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL', 'OT'],
        time_column: 'date',
    } as any);

    expect(datasetState.numericCols).toEqual(['HUFL', 'HULL', 'LUFL', 'LULL', 'MUFL', 'MULL', 'OT']);
});
```

- [ ] **Step 2: Derive `numericCols` from the richer `metadata.columns` payload first**

```ts
function deriveNumericCols(metadata: DatasetMetadata): string[] {
    const timeCol = String(metadata.time_column || '').toLowerCase();
    const typed = Array.isArray(metadata.columns) ? metadata.columns : [];
    const fromColumns = typed
        .filter((col) => /^(u?int|float|decimal)/i.test(String(col.dtype || '')))
        .map((col) => String(col.name || '').trim())
        .filter((name) => name && name.toLowerCase() !== timeCol);
    if (fromColumns.length > 0) return fromColumns;
    return (metadata.numeric_columns || []).filter((col) => col.toLowerCase() !== timeCol);
}
```

- [ ] **Step 3: Add a chip-order regression test so the visible timeseries chips follow the unified order**

```ts
expect(Array.from(document.querySelectorAll('#column-toggles .chip-label')).map((el) => el.textContent?.trim()))
    .toEqual(['HUFL', 'HULL', 'LUFL', 'LULL', 'MUFL', 'MULL', 'OT']);
```

- [ ] **Step 4: Run the ordering-focused tests**

Run: `npm test -- frontend/src/store/datasetState.test.ts frontend/src/features/timeseries/columnsController.test.ts`
Expected: FAIL before the store stops trusting `metadata.numeric_columns`, PASS after the derived-order helper is used.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/datasetState.ts frontend/src/store/datasetState.test.ts frontend/src/features/timeseries/columnsController.test.ts
git commit -m "fix: keep numeric column order consistent across pages"
```

### Task 5: Make The Timeseries Chip Summary Explain The In-Chart Legend

**Files:**
- Modify: `frontend/src/features/timeseries/columnsController.ts`
- Modify: `frontend/src/features/timeseries/columnsController.test.ts`

- [ ] **Step 1: Write a failing summary-copy test**

```ts
expect(document.querySelector<HTMLElement>('.timeseries-chip-status__summary')?.textContent)
    .toBe('3 of 7 active. Click chips to add more.');
```

- [ ] **Step 2: Update the summary copy so the user immediately understands why the legend only shows a subset**

```ts
const total = Array.isArray(appState.numericCols) ? appState.numericCols.length : 0;
const active = Array.isArray(appState.selectedCols) ? appState.selectedCols.length : 0;
summary.textContent = total > 0
    ? `${active} of ${total} active. Click chips to add more.`
    : 'No numeric series available.';
```

- [ ] **Step 3: Run the chip-summary regression test**

Run: `npm test -- frontend/src/features/timeseries/columnsController.test.ts`
Expected: FAIL with the old `X of Y active` string, PASS after the instructive copy lands.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/timeseries/columnsController.ts frontend/src/features/timeseries/columnsController.test.ts
git commit -m "fix: clarify timeseries legend summary"
```

### Task 6: Shorten FFT Peak Labels And Prevent Left-Edge Annotation Collisions

**Files:**
- Modify: `frontend/src/chart/FftChart.ts`
- Modify: `frontend/src/utils/spectralPresets.ts`
- Create: `frontend/src/chart/FftChart.test.ts`

- [ ] **Step 1: Write a failing formatter test for compact frequency/period labels**

```ts
import { describe, expect, it } from 'vitest';
import { formatFrequency, frequencyToPeriod } from '../utils/spectralPresets.js';

describe('FFT label helpers', () => {
    it('formats low frequencies without long raw-float labels', () => {
        expect(formatFrequency(0.0004659095)).toBe('465.91 µHz');
        expect(frequencyToPeriod(0.0004659095)).toBe('24.8 days');
    });
});
```

- [ ] **Step 2: Reuse the shared formatter helpers and stagger peak labels instead of writing raw `toFixed(4)` strings directly onto the canvas**

```ts
const label = formatFrequency(freqHz);
const period = frequencyToPeriod(freqHz);
const row = index % 2;
const yBase = ay - 12 - (row * 18);
ctx.fillText(label, ax + xOffset, yBase);
ctx.fillText(`(${period})`, ax + xOffset, yBase + 11);
```

- [ ] **Step 3: Trim axis/tooltip precision to match the compact helper output**

```ts
axisLabel: {
    formatter: (v: number) => formatFrequency(v).replace(/\s+[A-Za-zµ]+$/, ''),
},
```

- [ ] **Step 4: Run the FFT-focused tests**

Run: `npm test -- frontend/src/chart/FftChart.test.ts frontend/src/pages/fftPage.test.ts`
Expected: FAIL while `FftChart` still emits long fixed-width labels, PASS after both the helper and the label staggering are wired.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart/FftChart.ts frontend/src/utils/spectralPresets.ts frontend/src/chart/FftChart.test.ts
git commit -m "fix: declutter fft peak annotations"
```

### Task 7: Make Spectrogram Units And Colorbar Labels Self-Consistent

**Files:**
- Modify: `frontend/src/pages/spectrogramChartRuntime.ts`
- Modify: `frontend/css/modules/layout.css`
- Modify: `frontend/src/pages/spectrogramPage.test.ts`
- Modify: `frontend/src/utils/spectralPresets.ts`

- [ ] **Step 1: Write a failing spectrogram test that expects the axis title to match the rendered tick unit**

```ts
expect(option.yAxis.name).toBe('Frequency (mHz)');
expect(option.yAxis.axisLabel.formatter(0.00028)).toBe('0.28 mHz');
```

- [ ] **Step 2: Replace the local spectrogram formatter with a shared unit chooser and drive both the tick labels and the axis title from it**

```ts
const frequencyUnit = pickFrequencyUnit(Math.max(...freqAxis));
const formatFrequencyForAxis = (value: number) => formatFrequencyInUnit(value, frequencyUnit);

yAxis: {
    name: `Frequency (${frequencyUnit})`,
    axisLabel: {
        formatter: (value: string | number) => formatFrequencyForAxis(Number(value)),
    },
},
```

- [ ] **Step 3: Expand the colorbar top padding and use a clearer label than the clipped generic `scaled` / `LOG10` copy**

```ts
if (name) name.textContent = logScale ? 'log10 magnitude' : scaleLabel;
```

```css
.spectrogram-chart-row #spectrogram-colorbar {
  padding: 14px 0 10px;
  gap: 4px;
}

.spectrogram-chart-row #spectrogram-colorbar .scatter-colorbar-vtick {
  line-height: 1.2;
}
```

- [ ] **Step 4: Run the spectrogram regression tests**

Run: `npm test -- frontend/src/pages/spectrogramPage.test.ts`
Expected: FAIL while the axis still says `Frequency (Hz)` and the colorbar uses the old tight spacing, PASS after the shared-unit path and CSS spacing land.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/spectrogramChartRuntime.ts frontend/css/modules/layout.css frontend/src/pages/spectrogramPage.test.ts frontend/src/utils/spectralPresets.ts
git commit -m "fix: align spectrogram units and colorbar labels"
```

### Task 8: Add Y-Range Guidance For Spike-Compressed Charts And Explain The Controls

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/ui/yRangeControls.ts`
- Modify: `frontend/src/ui/toolbar.ts`
- Modify: `frontend/src/chart/DataChart.ts`
- Modify: `frontend/src/ui/yRangeControls.test.ts`
- Modify: `frontend/src/chart/DataChart.test.ts`

- [ ] **Step 1: Write a failing toolbar test for the missing y-range help affordances**

```ts
expect(document.getElementById('y-range-help')?.getAttribute('data-info-tip'))
    .toContain('Percentile hides the top and bottom tails');
```

- [ ] **Step 2: Add a shared info icon and a small hint slot to the Y-range toolbar**

```html
<span id="y-range-help" class="toolbar-info-icon" tabindex="0"
  data-info-tip="Stack from 0 clamps the display floor at zero.&#10;Percentile hides the top and bottom tails by the selected percent.&#10;IQR expands from Q1/Q3 by k × IQR.">ⓘ</span>
<span id="y-range-hint" class="toolbar-field__hint" hidden></span>
```

- [ ] **Step 3: Surface a spike-compression hint when the raw range is much wider than the robust display range**

```ts
const suggested = chart?.getRobustDisplayRangeSuggestion?.();
if (hintEl) {
    hintEl.hidden = !suggested;
    hintEl.textContent = suggested ? 'Spike-compressed view detected. Try Robust range.' : '';
}
```

```ts
getRobustDisplayRangeSuggestion(): RobustDisplayRangeOptions | null {
    const robust = this._computeRobustDisplayBounds();
    if (!robust || !Number.isFinite(this._lastDataYMin) || !Number.isFinite(this._lastDataYMax)) return null;
    const rawSpan = this._lastDataYMax - this._lastDataYMin;
    const robustSpan = robust.max - robust.min;
    return rawSpan > robustSpan * 3 ? { mode: 'percentile', param: 1 } : null;
}
```

- [ ] **Step 4: Bind the shared info popovers from the toolbar bootstrap**

```ts
import { bindInfoPopovers } from './infoPopovers.js';

export function initAnalysisControls(fetchAndRender: () => void): void {
    bindInfoPopovers();
    initToolbarModals();
    initDrawControls(fetchAndRender);
    initChartTextControls();
    initYRangeControls();
    initAnalyticsControls();
}
```

- [ ] **Step 5: Run the Y-range tests**

Run: `npm test -- frontend/src/ui/yRangeControls.test.ts frontend/src/chart/DataChart.test.ts`
Expected: FAIL while the toolbar still lacks help text and the chart exposes no robust-range suggestion, PASS after both are wired.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/src/ui/yRangeControls.ts frontend/src/ui/toolbar.ts frontend/src/chart/DataChart.ts frontend/src/ui/yRangeControls.test.ts frontend/src/chart/DataChart.test.ts
git commit -m "fix: explain y-range controls and hint spike-compressed ranges"
```

### Task 9: Stop Sidebar Shortcut Badges From Clipping

**Files:**
- Modify: `frontend/css/modules/sidebar.css`

- [ ] **Step 1: Increase the badge line box so `⌥7` and similar glyphs do not clip against the pill**

```css
.nav-shortcut {
  padding: 3px 6px 2px;
  min-width: 24px;
  min-height: 20px;
  line-height: 1.1;
  overflow: visible;
}
```

- [ ] **Step 2: Run the frontend checks**

Run: `npm run check:frontend`
Expected: PASS. This is a CSS-only polish task, so the main verification here is that the stylesheet stays valid and the import graph remains clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/css/modules/sidebar.css
git commit -m "style: prevent sidebar shortcut badge clipping"
```

## Final Verification

- [ ] Run: `npm test -- frontend/src/ui/pageNavigation.test.ts frontend/src/scatter/runtime.test.ts frontend/src/chart/DataChart.test.ts frontend/src/chart/chartInteractions.test.ts frontend/src/pages/heatmapPage.test.ts frontend/src/store/datasetState.test.ts frontend/src/features/timeseries/columnsController.test.ts frontend/src/chart/FftChart.test.ts frontend/src/pages/fftPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/ui/yRangeControls.test.ts`
Expected: PASS

- [ ] Run: `npm run check:frontend`
Expected: PASS

- [ ] Run: `npm run check:frontend:arch`
Expected: PASS

- [ ] Run: `npm run check:frontend:budgets`
Expected: PASS

## Notes And Scope Guards

- If the new routing/scatter tests fail, stop and re-audit before pruning `usage_issue.md`; that would mean the live code has drifted away from the current local reading.
- Do not widen this pass into new page features, custom color pickers, or new backend endpoints. The only backend touch here should be a last-resort metadata-order verification if the frontend-only `datasetState.ts` derivation proves insufficient.
- Keep `usage_issue.md` as a living unresolved list. Once an item is proven fixed by code/tests, remove it instead of leaving historical prose behind.
