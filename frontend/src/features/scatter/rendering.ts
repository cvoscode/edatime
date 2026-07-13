/**
 * Scatter series building, option construction, tooltips, colorbar, marginals, and view management.
 */

import { formatTwoDecimals, formatTimestamp } from '../../formatUtils.js';
import {
    getEl,
    paletteForScale,
    isTemporalColumn,
    buildHistogramForDomain,
    buildKdeCurve,
    computeBoxStats,
    getCanvasFrame,
    lowerBoundByX,
    upperBoundByX,
} from './helpers.js';
import { scatterState } from '../../store/scatterState.js';
import { getCorrelationModeBasisLabel, normalizeCorrelationMetric } from '../../utils/correlationModes.js';
import { getSetting } from '../../utils/settings.js';
import {
    currentControls,
    clampView,
    setStats,
    disposeScatterChart,
    resetScatterContainer,
    type ScatterView,
    type ScatterControls,
} from './state.js';
import {
    SCATTER_PLOT_GRID,
    getScatterMarginalXMetrics,
    getScatterMarginalYMetrics,
} from './layout.js';
import { getDropdownValue } from '../../ui/primitives/Dropdown.js';
import { getChartPalette } from '../../utils/theme.js';
import {
    buildDensityMarginalCounts,
    buildDensitySeries,
    buildDensityTooltipCache,
    densityTooltipFormatterFactory,
    drawDensityMarginalX,
    drawDensityMarginalY,
} from './renderingDensity.js';
import { buildNormalScatterSeries as buildSeriesByPolicy } from './seriesPolicy.js';
import { buildScatterTooltipHtml } from './tooltipPresentation.js';
import { buildScatterColorbarPresentation } from './colorbarPresentation.js';
import { scheduleScatterRender } from './renderScheduler.js';

/* ── Series builders ──────────────────────────────────── */

export function buildNormalScatterSeries(points: [number, number][], controls: ScatterControls): any[] {
    return buildSeriesByPolicy(points, controls, {
        colorValues: scatterState.colorValues,
        allColorValues: scatterState.allColorValues,
        colorLabels: scatterState.colorLabels,
        colorMin: scatterState.colorMin,
        colorMax: scatterState.colorMax,
    }, getChartPalette().scatterPoint);
}

export function scatterTooltipFormatterFactory(controls: ScatterControls) {
    return (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p) return '';
        return buildScatterTooltipHtml({
            xColumn: controls.x,
            yColumn: controls.y,
            colorColumn: controls.selectedColorColumn,
            point: p.value,
            seriesName: p.seriesName,
            dataIndex: p.dataIndex,
            xSpan: scatterState.view.xMax - scatterState.view.xMin,
            ySpan: scatterState.view.yMax - scatterState.view.yMin,
            columnTypes: scatterState.columnTypes,
            colorLabels: scatterState.colorLabels,
            colorValues: scatterState.colorValues,
        });
    };
}

/* ── Colorbar ─────────────────────────────────────────── */

function setColorbarVisible(visible: boolean): void {
    const panel = getEl('scatter-right-panel');
    const wrap = getEl('scatter-colorbar-wrap');
    if (wrap) wrap.hidden = !visible;
    if (panel) panel.hidden = !visible && panel.dataset.marginalActive !== '1';
}

function renderColorbarCanvas(): void {
    const barCanvas = getEl('scatter-colorbar') as HTMLCanvasElement | null;
    if (!barCanvas) return;
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const palette = paletteForScale(isDensity ? ctl.colormap : ctl.colorScale);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Math.max(1, barCanvas.offsetWidth || 14);
    const cssH = Math.max(1, barCanvas.offsetHeight || 160);
    barCanvas.width = Math.round(cssW * dpr);
    barCanvas.height = Math.round(cssH * dpr);
    const ctx = barCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grad = ctx.createLinearGradient(0, 0, 0, cssH);
    palette.forEach((stop, i) => grad.addColorStop(1 - i / (palette.length - 1), stop));
    ctx.fillStyle = grad;
    ctx.beginPath();
    (ctx as any).roundRect(0, 0, cssW, cssH, 3);
    ctx.fill();
}

export function updateColorbarUI(): void {
    const ctl = currentControls();
    const presentation = buildScatterColorbarPresentation({
        activeView: scatterState.activeView,
        renderMode: ctl.renderMode,
        colormap: ctl.colormap,
        colorScale: ctl.colorScale,
        selectedColorColumn: ctl.selectedColorColumn,
        colorValues: scatterState.colorValues,
        colorMin: scatterState.colorMin,
        colorMax: scatterState.colorMax,
        cardinality: scatterState.colorCardinality,
    });
    setColorbarVisible(presentation.visible);
    if (!presentation.visible) return;

    const nameEl = getEl('scatter-colorbar-name');
    const minEl = getEl('scatter-colorbar-min');
    const maxEl = getEl('scatter-colorbar-max');
    const cardEl = getEl('scatter-colorbar-cardinality');

    if (nameEl) nameEl.textContent = presentation.name;
    if (minEl) minEl.textContent = presentation.minLabel;
    if (maxEl) maxEl.textContent = presentation.maxLabel;
    if (cardEl) {
        cardEl.hidden = presentation.cardinalityLabel === null;
        if (presentation.cardinalityLabel) cardEl.textContent = presentation.cardinalityLabel;
    }
    requestAnimationFrame(renderColorbarCanvas);
}

export function setCorrelationOverlayText(pearson?: number | null, spearman?: number | null): void {
    const el = getEl('scatter-correlation-overlay');
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
}

/* ── Marginal histograms ──────────────────────────────── */

function drawMarginalX(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number, mode: string): void {
    const frame = getCanvasFrame(canvas, 600, 64);
    if (!frame) return;
    const { ctx, width, height } = frame;
    const { plotLeft, plotWidth: plotW } = getScatterMarginalXMetrics(width);
    const span = Math.max(1e-9, viewMax - viewMin);
    const projectX = (value: number) => plotLeft + ((value - viewMin) / span) * plotW;

    if (mode === 'boxplot') {
        const stats = computeBoxStats(values);
        if (!stats) return;
        const centerY = Math.round(height / 2);
        const boxH = Math.max(16, Math.round(height * 0.45));
        const boxTop = centerY - Math.round(boxH / 2);
        const q1 = projectX(stats.q1 ?? stats.min);
        const q3 = projectX(stats.q3 ?? stats.max);
        const median = projectX(stats.median ?? stats.min);
        const palette = getChartPalette();
        ctx.strokeStyle = palette.marginalStroke;
        ctx.fillStyle = palette.marginalFill;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(projectX(stats.min), centerY);
        ctx.lineTo(q1, centerY);
        ctx.moveTo(q3, centerY);
        ctx.lineTo(projectX(stats.max), centerY);
        ctx.stroke();
        ctx.fillRect(q1, boxTop, Math.max(2, q3 - q1), boxH);
        ctx.strokeRect(q1, boxTop, Math.max(2, q3 - q1), boxH);
        ctx.beginPath();
        ctx.moveTo(median, boxTop);
        ctx.lineTo(median, boxTop + boxH);
        ctx.stroke();
        return;
    }

    if (mode === 'kde') {
        const curve = buildKdeCurve(values, viewMin, viewMax, 64);
        if (curve.length === 0) return;
        const maxDensity = Math.max(1e-9, ...curve.map((point) => point.y));
        const projectY = (value: number) => height - 2 - ((value / maxDensity) * Math.max(1, height - 4));
        const palette = getChartPalette();
        ctx.fillStyle = palette.marginalFill;
        ctx.strokeStyle = palette.marginalStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(projectX(curve[0].x), height - 2);
        for (const point of curve) ctx.lineTo(projectX(point.x), projectY(point.y));
        ctx.lineTo(projectX(curve[curve.length - 1].x), height - 2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        curve.forEach((point, index) => {
            const x = projectX(point.x);
            const y = projectY(point.y);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        return;
    }

    const histogram = buildHistogramForDomain(values, viewMin, viewMax, 40);
    if (!histogram) return;
    const { counts } = histogram;
    const maxCount = Math.max(1, ...counts);
    const barW = plotW / counts.length;
    const drawH = height - 4;
    const palette = getChartPalette();
    ctx.fillStyle = palette.marginalFill;
    for (let i = 0; i < counts.length; i++) {
        if (counts[i] === 0) continue;
        const barH = Math.max(2, (counts[i] / maxCount) * drawH);
        ctx.fillRect(plotLeft + i * barW + 0.5, height - barH - 2, Math.max(1, barW - 1), barH);
    }
}

function drawMarginalY(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number, mode: string): void {
    const frame = getCanvasFrame(canvas, 40, 400);
    if (!frame) return;
    const { ctx, width, height } = frame;
    const { plotTop, plotBottom, plotHeight: plotH } = getScatterMarginalYMetrics(height);
    const span = Math.max(1e-9, viewMax - viewMin);
    const projectY = (value: number) => plotBottom - ((value - viewMin) / span) * plotH;

    if (mode === 'boxplot') {
        const stats = computeBoxStats(values);
        if (!stats) return;
        const centerX = Math.round(width / 2);
        const boxW = Math.max(12, Math.round(width * 0.45));
        const boxLeft = centerX - Math.round(boxW / 2);
        const q1 = projectY(stats.q1 ?? stats.min);
        const q3 = projectY(stats.q3 ?? stats.max);
        const median = projectY(stats.median ?? stats.min);
        const palette = getChartPalette();
        ctx.strokeStyle = palette.marginalStroke;
        ctx.fillStyle = palette.marginalFill;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(centerX, projectY(stats.min));
        ctx.lineTo(centerX, q1);
        ctx.moveTo(centerX, q3);
        ctx.lineTo(centerX, projectY(stats.max));
        ctx.stroke();
        ctx.fillRect(boxLeft, q3, boxW, Math.max(2, q1 - q3));
        ctx.strokeRect(boxLeft, q3, boxW, Math.max(2, q1 - q3));
        ctx.beginPath();
        ctx.moveTo(boxLeft, median);
        ctx.lineTo(boxLeft + boxW, median);
        ctx.stroke();
        return;
    }

    if (mode === 'kde') {
        const curve = buildKdeCurve(values, viewMin, viewMax, 64);
        if (curve.length === 0) return;
        const maxDensity = Math.max(1e-9, ...curve.map((point) => point.y));
        const projectX = (value: number) => (value / maxDensity) * Math.max(1, width - 4);
        const palette = getChartPalette();
        ctx.fillStyle = palette.marginalFill;
        ctx.strokeStyle = palette.marginalStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, projectY(curve[0].x));
        for (const point of curve) ctx.lineTo(projectX(point.y), projectY(point.x));
        ctx.lineTo(0, projectY(curve[curve.length - 1].x));
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        curve.forEach((point, index) => {
            const x = projectX(point.y);
            const y = projectY(point.x);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        return;
    }

    const histogram = buildHistogramForDomain(values, viewMin, viewMax, 32);
    if (!histogram) return;
    const { counts } = histogram;
    const maxCount = Math.max(1, ...counts);
    const binH = plotH / counts.length;
    const maxBarW = width - 4;
    const palette = getChartPalette();
    ctx.fillStyle = palette.marginalFill;
    for (let i = 0; i < counts.length; i++) {
        if (counts[i] === 0) continue;
        const barW = Math.max(2, (counts[i] / maxCount) * maxBarW);
        const y = plotBottom - (i + 1) * binH;
        ctx.fillRect(0, y + 0.5, barW, Math.max(1, binH - 1));
    }
}

export function updateMarginalPlots(): void {
    const isPlot = scatterState.activeView === 'plot';
    const ctl = currentControls();
    const hasPoints = scatterState.points.length > 0;
    // Marginals are shown in both scatter and density modes; in density the
    // right panel hosts the y-marginal and the colorbar side-by-side via flex.
    const showMarginals = isPlot && hasPoints;

    const rightPanel = getEl('scatter-right-panel');
    const chartEl = getEl('scatter-chart');
    const marginalX = getEl('scatter-marginal-x') as HTMLCanvasElement | null;
    const marginalY = getEl('scatter-marginal-y') as HTMLCanvasElement | null;

    if (rightPanel) rightPanel.dataset.marginalActive = showMarginals ? '1' : '0';
    if (marginalX) marginalX.hidden = !showMarginals;
    if (chartEl) chartEl.classList.toggle('with-x-marginal', showMarginals);

    const colorbarActive = rightPanel ? !(getEl('scatter-colorbar-wrap')?.hidden ?? true) : false;
    if (rightPanel) rightPanel.hidden = !showMarginals && !colorbarActive;

    if (!showMarginals) {
        if (marginalY) marginalY.hidden = true;
        return;
    }
    if (marginalY) marginalY.hidden = false;

    const view = scatterState.view;
    const visiblePoints = scatterState.points.filter((p) => {
        const x = Number(p?.[0]);
        const y = Number(p?.[1]);
        return Number.isFinite(x) && Number.isFinite(y)
            && x >= view.xMin && x <= view.xMax
            && y >= view.yMin && y <= view.yMax;
    });
    const xValues = visiblePoints.map((p) => Number(p[0]));
    const yValues = visiblePoints.map((p) => Number(p[1]));
    const mode = ctl.diagonalMode || 'histogram';

    if (ctl.renderMode === 'density' && mode === 'histogram') {
        const chartEl = getEl('scatter-chart');
        const densitySeries = scatterState.lastOptionSeries || buildDensitySeries(scatterState.points, ctl);
        // Ensure the cache is warm, then prefer the marginal counts that
        // `buildDensityTooltipCache` derives alongside the 2D bin map.
        // Falling back to a one-shot recomputation keeps the helper safe
        // for callers that read marginals before the cache was populated.
        const cache = scatterState.densityTooltipCache || buildDensityTooltipCache(densitySeries, ctl, chartEl);
        const xCounts = cache?.marginalCountsX ?? buildDensityMarginalCounts('x', cache);
        const yCounts = cache?.marginalCountsY ?? buildDensityMarginalCounts('y', cache);
        const binSize = Number(cache?.metrics?.binSizeCss ?? cache?.binSize);
        if (marginalX && xCounts && Number.isFinite(binSize) && binSize > 0) {
            requestAnimationFrame(() => drawDensityMarginalX(marginalX, xCounts, binSize));
        }
        if (marginalY && yCounts && Number.isFinite(binSize) && binSize > 0) {
            requestAnimationFrame(() => drawDensityMarginalY(marginalY, yCounts, binSize));
        }
        return;
    }

    if (marginalX) requestAnimationFrame(() => drawMarginalX(marginalX, xValues, view.xMin, view.xMax, mode));
    if (marginalY) requestAnimationFrame(() => drawMarginalY(marginalY, yValues, view.yMin, view.yMax, mode));
}

/* ── Option builder ───────────────────────────────────── */

export function buildOption(points: [number, number][], container: HTMLElement | null): any {
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const xSpan = Math.max(1, scatterState.view.xMax - scatterState.view.xMin);
    const ySpan = Math.max(1, scatterState.view.yMax - scatterState.view.yMin);
    const xTickFormatter = isTemporalColumn(ctl.x, scatterState.columnTypes)
        ? (v: number) => formatTimestamp(v, xSpan)
        : (v: number) => formatTwoDecimals(v);
    const yTickFormatter = isTemporalColumn(ctl.y, scatterState.columnTypes)
        ? (v: number) => formatTimestamp(v, ySpan)
        : (v: number) => formatTwoDecimals(v);

    const series = isDensity ? buildDensitySeries(points, ctl) : buildNormalScatterSeries(points, ctl);
    scatterState.lastOptionSeries = series;

    const option: any = {
        theme: 'dark',
        grid: { ...SCATTER_PLOT_GRID },
        xAxis: { type: 'value', name: ctl.x || 'x', min: scatterState.view.xMin, max: scatterState.view.xMax, tickFormatter: xTickFormatter },
        yAxis: { type: 'value', name: ctl.y || 'y', min: scatterState.view.yMin, max: scatterState.view.yMax, tickFormatter: yTickFormatter },
        legend: { show: false },
        series,
    };

    if (isDensity) {
        option.tooltip = { show: true, trigger: 'item', formatter: densityTooltipFormatterFactory(ctl, container) };
        buildDensityTooltipCache(series, ctl, container);
    } else {
        scatterState.densityTooltipCache = null;
        option.tooltip = { show: true, trigger: 'item', formatter: scatterTooltipFormatterFactory(ctl) };
    }
    return option;
}

/* ── View management ──────────────────────────────────── */

export function renderCurrentOption(): void {
    if (!scatterState.chart) return;
    const container = getEl('scatter-chart');
    scatterState.chart.setOption(buildOption(scatterState.points, container));
    requestAnimationFrame(() => scatterState.chart?.resize?.());
    updateColorbarUI();
    updateBinnedReadout();
    updateMarginalPlots();
}

export function applyView(nextView: ScatterView, pushHistory = false): void {
    const current = { ...scatterState.view };
    const next = clampView(nextView);
    if (pushHistory) scatterState.zoomHistory = [...scatterState.zoomHistory, current].slice(-30);
    scatterState.view = next;
    refreshView();
}

export function resetView(clearHistory = true): void {
    if (clearHistory) scatterState.zoomHistory = [];
    scatterState.view = { ...scatterState.full };
    refreshView();
}

/**
 * Re-render the scatter chart for the current view.
 *
 * In density mode the ChartGPU library caches the binning from the first
 * `prepare()` call and does not re-bin when only the view's `rawBounds`
 * change (the library's dirty-state check ignores the view). The result is
 * a heatmap that looks the same on every zoom. To get a fresh binning we
 * dispose the chart so the next `renderScatter()` recreates it, then call
 * the standard `setOption` path to update the axis labels and re-attach
 * the zoom listeners.
 *
 * In non-density modes a plain `setOption` is enough.
 */
function refreshView(): void {
    const isDensity = currentControls().renderMode === 'density';
    if (isDensity && scatterState.chart) {
        // Force the next renderScatter() to recreate the chart so the
        // density binning is rebuilt against the new view bounds.
        disposeScatterChart();
        // Recreate the container so the new chart starts from a clean DOM
        // (the old WebGL canvas is gone with the disposed chart).
        resetScatterContainer();
        // The actual re-create + re-render is driven by renderScatter().
        // We trigger it through the debounced entry point exported by
        // scatterPage.ts to avoid a tight import cycle. Pass
        // `preserveView: true` so the upcoming renderScatter() does not
        // clobber the new view back to the full extent (the default
        // `applyScatterStateFromCache(true)` would otherwise reset the
        // view and the user's zoom would not stick).
        if (!scheduleScatterRender({ preserveView: true, immediate: true })) {
            renderCurrentOption();
        }
        return;
    }
    renderCurrentOption();
}

export function updateBinnedReadout(): void {
    // No longer updates a dedicated element — visible point count is shown via chart performance callbacks.
}

export function updateCorrelationStats(): void {
    const openCausalBtn = getEl('scatter-open-causal-btn') as HTMLButtonElement | null;
    const xValue = getDropdownValue('scatter-x-col');
    const yValue = getDropdownValue('scatter-y-col');
    const corr = scatterState.correlationsByColumn.get(yValue || '');
    const mode = normalizeCorrelationMetric(getSetting('defaultCorrelationMetric'));
    const pairStats = scatterState.currentPairStats;
    const useDiffBasis = mode.endsWith('_diff');
    const pearson = useDiffBasis ? pairStats?.pearsonDiff : pairStats?.pearsonRaw;
    const spearman = useDiffBasis ? pairStats?.spearmanDiff : pairStats?.spearmanRaw;
    const pearsonNumber: number | null = typeof pearson === 'number' && Number.isFinite(pearson) ? pearson : null;
    const spearmanNumber: number | null = typeof spearman === 'number' && Number.isFinite(spearman) ? spearman : null;
    const pearsonValue = pearsonNumber !== null
        ? pearsonNumber.toFixed(3)
        : (mode.startsWith('pearson') && Number.isFinite(corr?.value) ? corr!.value!.toFixed(3) : '—');
    const spearmanValue = spearmanNumber !== null
        ? spearmanNumber.toFixed(3)
        : (mode.startsWith('spearman') && Number.isFinite(corr?.value) ? corr!.value!.toFixed(3) : '—');
    const count = Number.isFinite(pairStats?.count)
        ? `${pairStats!.count} aligned pairs`
        : (Number.isFinite(corr?.count) ? `${corr!.count} aligned pairs` : '');
    if (openCausalBtn) openCausalBtn.disabled = !(xValue && yValue);
    setStats({
        primaryLabel: 'Pearson r',
        primaryValue: pearsonValue,
        secondaryLabel: 'Spearman ρ',
        secondaryValue: spearmanValue,
        correlationContext: count ? `${getCorrelationModeBasisLabel(mode)} · ${count}` : getCorrelationModeBasisLabel(mode),
    });
    setCorrelationOverlayText(pearsonNumber, spearmanNumber);
}

/* ── Sync mode UI ─────────────────────────────────────── */

export function syncModeUI(onToolbarLayoutChange?: () => void): void {
    const ctl = currentControls();
    const view = scatterState.activeView || 'plot';
    const isPlot = view === 'plot';
    const isMatrix = view === 'matrix';
    const isDensity = isPlot && ctl.renderMode === 'density';
    const isScatter = isPlot && ctl.renderMode === 'scatter';
    const toggle = (el: HTMLElement | null, visible: boolean) => { if (el) el.style.display = visible ? '' : 'none'; };

    toggle(getEl('scatter-analytics-group'), !isMatrix);
    toggle(getEl('scatter-mode-label'), isPlot);
    toggle(getEl('scatter-render-mode'), isPlot);
    // The Refine segment hosts the density sub-group (Bins + Scale
    // Linear/Log) inline. Show it only in density mode and hide it
    // for scatter/matrix views to avoid leaving orphan labels.
    toggle(getEl('scatter-density-controls'), isDensity);
    // The color-by-column dropdown + scale only apply in scatter
    // render mode (density mode uses the colormap for the heatmap,
    // not a per-row color encoding). Hide both fields together in
    // density mode to avoid orphan labels and free toolbar space
    // for the density sub-group (Bins / Scale Linear-Log).
    toggle(getEl('scatter-color-column-field'), isScatter);
    toggle(getEl('scatter-color-scale-field'), isScatter);
    toggle(document.querySelector('.scatter-export-group'), isPlot);
    toggle(document.querySelector('.scatter-stats-bar'), isPlot);
    toggle(document.querySelector('.scatter-suggestions-bar'), !isMatrix);
    toggle(document.querySelector('.scatter-stats-bar__correlations'), !isMatrix);
    updateColorbarUI();
    // Sync mode flips the density sub-group and color-scale field
    // visibility, which changes which fields wrap inside the Refine
    // segment. Ask the overflow logic to rebalance so the popout
    // stays in sync with the new field set.
    onToolbarLayoutChange?.();
}

export {
    buildDensitySeries,
    buildDensityTooltipCache,
    densityTooltipFormatterFactory,
} from './renderingDensity.js';

/* ── Re-export from scatter/export.ts ─────────────────── */

export {
    buildLinearTicks,
    getScatterExportViewport,
    drawScatterSeriesToCanvas,
    renderScatterExportToCanvas,
    buildVisibleScatterRows,
    exportScatterData,
    exportScatterPNG,
    exportScatterSVG,
    exportScatterHTML,
    exportScatterParquet,
} from './export.js';
