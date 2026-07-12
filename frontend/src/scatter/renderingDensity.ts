import { formatTwoDecimals } from '../formatUtils.js';
import { scatterState } from '../store/scatterState.js';
import { getChartPalette } from '../utils/theme.js';
import {
    escapeHtml,
    fmt,
    formatValueForColumn,
    getCanvasFrame,
    getDevicePixelRatio,
    paletteForScale,
} from './helpers.js';
import {
    getPlotMetrics,
    type DensityTooltipCache,
    type ScatterControls,
} from './state.js';
import {
    SCATTER_PLOT_GRID,
    getScatterMarginalXMetrics,
    getScatterMarginalYMetrics,
} from './layout.js';

export function buildDensitySeries(points: [number, number][], controls: ScatterControls): any[] {
    const view = scatterState.view;
    const series: any = {
        type: 'scatter',
        name: 'density',
        data: points,
        rawData: points,
        mode: 'density',
        binSize: controls.binSize,
        densityColormap: paletteForScale(controls.colormap),
        densityNormalization: controls.normalization,
        sampling: 'none',
        rawBounds: {
            xMin: view.xMin,
            xMax: view.xMax,
            yMin: view.yMin,
            yMax: view.yMax,
        },
    };

    const colorColumn = controls.selectedColorColumn || controls.colorColumn || '';
    const values = scatterState.allColorValues ?? scatterState.colorValues;
    if (colorColumn && Array.isArray(values) && values.length > 0) {
        let sum = 0;
        let count = 0;
        let lo = Number.POSITIVE_INFINITY;
        let hi = Number.NEGATIVE_INFINITY;
        for (let idx = 0; idx < Math.min(points.length, values.length); idx++) {
            const x = Number(points[idx]?.[0]);
            const y = Number(points[idx]?.[1]);
            const value = Number(values[idx]);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(value)) continue;
            if (x < view.xMin || x > view.xMax || y < view.yMin || y > view.yMax) continue;
            sum += value;
            count += 1;
            lo = Math.min(lo, value);
            hi = Math.max(hi, value);
        }
        if (count > 0) {
            series.__edatimeColorCenter = sum / count;
            series.__edatimeColorLo = lo;
            series.__edatimeColorHi = hi;
        }
    }

    return [series];
}

export function buildDensityTooltipCache(series: any[], controls: ScatterControls, container: HTMLElement | null): DensityTooltipCache | null {
    const metrics = getDensityTooltipMetrics(controls, container);
    if (!metrics) return null;

    const xSpan = scatterState.view.xMax - scatterState.view.xMin;
    const ySpan = scatterState.view.yMax - scatterState.view.yMin;
    if (!(xSpan > 0) || !(ySpan > 0)) return null;

    const key = [
        scatterState.view.xMin, scatterState.view.xMax, scatterState.view.yMin, scatterState.view.yMax,
        metrics.plotWidth, metrics.plotHeight,
        metrics.binSizePx, metrics.devicePixelRatio,
        controls.selectedColorColumn || controls.colorColumn || '', controls.renderMode || '',
    ].join('|');

    if (scatterState.densityTooltipCache?.key === key) return scatterState.densityTooltipCache;

    const binsBySeriesIndex = new Map<number, Map<string, number>>();
    const metaBySeriesIndex = new Map<number, any>();

    for (let si = 0; si < series.length; si++) {
        const s = series[si];
        const points = s?.rawData ?? s?.data;
        if (!s || !Array.isArray(points)) continue;
        const map = new Map<string, number>();

        if (Object.prototype.hasOwnProperty.call(s, '__edatimeColorCenter')) {
            metaBySeriesIndex.set(si, { colorCenter: s.__edatimeColorCenter, colorLo: s.__edatimeColorLo, colorHi: s.__edatimeColorHi });
        }

        for (const p of points) {
            const x = Number(p?.[0]);
            const y = Number(p?.[1]);
            const bucket = projectDensityPointToBin(x, y, metrics);
            if (!bucket) continue;
            const k = `${bucket.bx},${bucket.by}`;
            map.set(k, (map.get(k) || 0) + 1);
        }
        binsBySeriesIndex.set(si, map);
    }

    const primaryBins = binsBySeriesIndex.get(0);
    const stubForCounts: DensityTooltipCache | null = {
        key,
        binSize: metrics.binSizeCss,
        metrics,
        binsBySeriesIndex,
        metaBySeriesIndex,
        marginalCountsX: null,
        marginalCountsY: null,
    };
    const marginalCountsX = primaryBins ? buildDensityMarginalCounts('x', stubForCounts, 0) : null;
    const marginalCountsY = primaryBins ? buildDensityMarginalCounts('y', stubForCounts, 0) : null;

    scatterState.densityTooltipCache = {
        key,
        binSize: metrics.binSizeCss,
        metrics,
        binsBySeriesIndex,
        metaBySeriesIndex,
        marginalCountsX,
        marginalCountsY,
    };
    return scatterState.densityTooltipCache;
}

export function densityTooltipFormatterFactory(controls: ScatterControls, container: HTMLElement | null) {
    return (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p) return '';
        const cache = scatterState.densityTooltipCache || buildDensityTooltipCache(scatterState.lastOptionSeries || [], controls, container);
        const x = Number(p?.value?.[0]);
        const y = Number(p?.value?.[1]);
        const seriesIndex = Number(p?.seriesIndex);
        let density: number | null = null;
        const bins = cache?.binsBySeriesIndex?.get(seriesIndex);
        const metrics = cache?.metrics;
        if (bins && metrics && Number.isFinite(x) && Number.isFinite(y)) {
            const bucket = projectDensityPointToBin(x, y, metrics);
            if (bucket) density = bins.get(`${bucket.bx},${bucket.by}`) ?? null;
        }
        const parts: string[] = [];
        const xSpanLabel = Math.max(1, scatterState.view.xMax - scatterState.view.xMin);
        const ySpanLabel = Math.max(1, scatterState.view.yMax - scatterState.view.yMin);
        parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.x || 'X')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpanLabel, scatterState.columnTypes))}</span></div>`);
        parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.y || 'Y')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpanLabel, scatterState.columnTypes))}</span></div>`);
        const meta = cache?.metaBySeriesIndex?.get(seriesIndex);
        const colorColumn = controls.selectedColorColumn || controls.colorColumn || '';
        if (colorColumn && meta && Number.isFinite(meta.colorCenter)) {
            parts.push(`<div><span style="opacity:0.85;">${escapeHtml(colorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatTwoDecimals(meta.colorCenter))}</span></div>`);
        }
        parts.push(`<div><span style="opacity:0.85;">Density:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(density == null ? '—' : fmt.format(density))}</span></div>`);
        return parts.join('');
    };
}

export function buildDensityMarginalCounts(axis: 'x' | 'y', cache: DensityTooltipCache | null, seriesIndex = 0): number[] | null {
    const bins = cache?.binsBySeriesIndex?.get(seriesIndex);
    const metrics = cache?.metrics;
    if (!bins || !metrics) return null;

    const binCount = axis === 'x' ? metrics.binCountX : metrics.binCountY;
    const counts = Array.from({ length: binCount }, () => 0);

    for (const [key, count] of bins.entries()) {
        const [bxRaw, byRaw] = key.split(',');
        const bx = Number(bxRaw);
        const by = Number(byRaw);
        const index = axis === 'x' ? bx : by;
        if (!Number.isInteger(index) || index < 0 || index >= counts.length) continue;
        counts[index] += Number(count) || 0;
    }

    return counts;
}

export function drawDensityMarginalX(canvas: HTMLCanvasElement, counts: number[], binSize: number): void {
    const frame = getCanvasFrame(canvas, 600, 64);
    if (!frame) return;
    const { ctx, width, height } = frame;
    const { plotLeft, plotWidth: plotW } = getScatterMarginalXMetrics(width);
    const maxCount = Math.max(1, ...counts);
    const drawH = height - 4;
    const palette = getChartPalette();
    ctx.fillStyle = palette.marginalFill;

    for (let i = 0; i < counts.length; i++) {
        if (counts[i] === 0) continue;
        const x = plotLeft + i * binSize;
        if (x >= plotLeft + plotW) break;
        const widthPx = Math.max(1, Math.min(binSize, plotLeft + plotW - x) - 1);
        const barH = Math.max(2, (counts[i] / maxCount) * drawH);
        ctx.fillRect(x, height - barH - 2, widthPx, barH);
    }
}

export function drawDensityMarginalY(canvas: HTMLCanvasElement, counts: number[], binSize: number): void {
    const frame = getCanvasFrame(canvas, 40, 400);
    if (!frame) return;
    const { ctx, width, height } = frame;
    const { plotTop, plotBottom } = getScatterMarginalYMetrics(height);
    const maxCount = Math.max(1, ...counts);
    const maxBarW = width - 4;
    const palette = getChartPalette();
    ctx.fillStyle = palette.marginalFill;

    for (let i = 0; i < counts.length; i++) {
        if (counts[i] === 0) continue;
        const y = plotTop + i * binSize;
        if (y >= plotBottom) break;
        const heightPx = Math.max(1, Math.min(binSize, plotBottom - y) - 1);
        const barW = Math.max(2, (counts[i] / maxCount) * maxBarW);
        ctx.fillRect(0, y, barW, heightPx);
    }
}

function getDensityTooltipMetrics(controls: ScatterControls, container: HTMLElement | null): DensityTooltipCache['metrics'] {
    const metrics = getPlotMetrics(container);
    const rect = container?.getBoundingClientRect?.();
    if (!metrics || !rect) return null;

    const widthCss = Math.max(1, rect.width);
    const heightCss = Math.max(1, rect.height);
    const dpr = getDevicePixelRatio();
    const canvasWidth = Math.max(1, Math.round(widthCss * dpr));
    const canvasHeight = Math.max(1, Math.round(heightCss * dpr));
    const exactLeftPx = SCATTER_PLOT_GRID.left * dpr;
    const exactRightPx = canvasWidth - SCATTER_PLOT_GRID.right * dpr;
    const exactTopPx = SCATTER_PLOT_GRID.top * dpr;
    const exactBottomPx = canvasHeight - SCATTER_PLOT_GRID.bottom * dpr;
    const plotLeftPx = Math.min(canvasWidth, Math.max(0, Math.floor(exactLeftPx)));
    const plotTopPx = Math.min(canvasHeight, Math.max(0, Math.floor(exactTopPx)));
    const plotRightPx = Math.min(canvasWidth, Math.max(0, Math.ceil(exactRightPx)));
    const plotBottomPx = Math.min(canvasHeight, Math.max(0, Math.ceil(exactBottomPx)));
    const plotWidthPx = Math.max(1, plotRightPx - plotLeftPx);
    const plotHeightPx = Math.max(1, plotBottomPx - plotTopPx);
    const binSizePx = Math.max(1, Math.round((Number(controls.binSize) || 10) * dpr));

    return {
        plotWidth: metrics.plotWidth,
        plotHeight: metrics.plotHeight,
        devicePixelRatio: dpr,
        plotLeftPx,
        plotTopPx,
        plotRightPx,
        plotBottomPx,
        exactLeftPx,
        exactTopPx,
        exactRightPx,
        exactBottomPx,
        binSizePx,
        binSizeCss: binSizePx / dpr,
        binCountX: Math.max(1, Math.ceil(plotWidthPx / binSizePx)),
        binCountY: Math.max(1, Math.ceil(plotHeightPx / binSizePx)),
    };
}

function projectDensityPointToBin(
    x: number,
    y: number,
    metrics: NonNullable<DensityTooltipCache['metrics']>,
): { bx: number; by: number } | null {
    const view = scatterState.view;
    const xSpan = view.xMax - view.xMin;
    const ySpan = view.yMax - view.yMin;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(xSpan > 0) || !(ySpan > 0)) return null;

    const nx = (x - view.xMin) / xSpan;
    const ny = (y - view.yMin) / ySpan;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;

    const px = metrics.exactLeftPx + nx * (metrics.exactRightPx - metrics.exactLeftPx);
    const py = metrics.exactBottomPx - ny * (metrics.exactBottomPx - metrics.exactTopPx);
    if (px < metrics.plotLeftPx || px >= metrics.plotRightPx || py < metrics.plotTopPx || py >= metrics.plotBottomPx) return null;

    const bx = Math.floor((px - metrics.plotLeftPx) / metrics.binSizePx);
    const by = Math.floor((py - metrics.plotTopPx) / metrics.binSizePx);
    if (bx < 0 || bx >= metrics.binCountX || by < 0 || by >= metrics.binCountY) return null;
    return { bx, by };
}
