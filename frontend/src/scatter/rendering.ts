/**
 * Scatter series building, option construction, tooltips, colorbar, marginals, and view management.
 */

import { formatTwoDecimals, formatTimestamp } from '../formatUtils.js';
import {
    getEl,
    fmt,
    escapeHtml,
    paletteForScale,
    sampleGradient,
    normalizeCategoryLabel,
    buildCategoricalColorGroups,
    formatValueForColumn,
    isTemporalColumn,
    buildHistogramForDomain,
    getCanvasFrame,
    lowerBoundByX,
    upperBoundByX,
} from './helpers.js';
import { appState } from '../state.js';
import {
    currentControls,
    clampView,
    setStats,
    getPlotMetrics,
    type ScatterView,
    type ScatterControls,
    type DensityTooltipCache,
} from './state.js';

/* ── Grid constants (must match buildOption) ──────────── */

const SCATTER_GRID_LEFT = 72;
const SCATTER_GRID_RIGHT = 72;
const SCATTER_GRID_TOP = 24;
const SCATTER_GRID_BOTTOM = 50;

/* ── Series builders ──────────────────────────────────── */

export function buildNormalScatterSeries(points: [number, number][], controls: ScatterControls): any[] {
    const colorColumn = controls.selectedColorColumn;
    const values = appState.scatter.colorValues;
    const categoricalGroups = colorColumn ? buildCategoricalColorGroups(appState.scatter.colorLabels) : null;

    if (categoricalGroups) {
        return categoricalGroups.categories.map((label) => {
            const data: [number, number][] = [];
            for (let i = 0; i < points.length; i++) {
                if (normalizeCategoryLabel(appState.scatter.colorLabels?.[i]) !== label) continue;
                data.push(points[i]);
            }
            return { type: 'scatter', name: label, data, symbolSize: 3, color: categoricalGroups.colorByLabel.get(label) || '#4a9eff', sampling: 'none' };
        }).filter((s: any) => s.data.length > 0);
    }

    if (!colorColumn || !Array.isArray(values) || values.length === 0) {
        return [{ type: 'scatter', name: `${controls.x || 'x'} vs ${controls.y || 'y'}`, data: points, symbolSize: 3, color: '#4a9eff', sampling: 'none' }];
    }

    const min = Number.isFinite(appState.scatter.colorMin) ? appState.scatter.colorMin! : null;
    const max = Number.isFinite(appState.scatter.colorMax) ? appState.scatter.colorMax! : null;
    if (min === null || max === null || !(max > min)) {
        return [{ type: 'scatter', name: `${controls.x || 'x'} vs ${controls.y || 'y'}`, data: points, symbolSize: 3, color: '#4a9eff', sampling: 'none' }];
    }

    const bins = 64;
    const span = max - min;
    const grouped: [number, number][][] = Array.from({ length: bins }, () => []);
    const valueCount = Math.min(points.length, values.length);
    for (let idx = 0; idx < points.length; idx++) {
        const v = idx < valueCount ? Number(values[idx]) : Number.NaN;
        if (!Number.isFinite(v)) continue;
        let b = Math.floor(((v - min) / span) * bins);
        if (b < 0) b = 0;
        if (b >= bins) b = bins - 1;
        grouped[b].push(points[idx]);
    }

    const gradient = paletteForScale(controls.colorScale);
    const series: any[] = [];
    for (let b = 0; b < bins; b++) {
        if (!grouped[b] || grouped[b].length === 0) continue;
        series.push({
            type: 'scatter',
            name: `${colorColumn}`,
            data: grouped[b],
            symbolSize: 3,
            color: sampleGradient(gradient, (b + 0.5) / bins),
            sampling: 'none',
        });
    }
    return series;
}

export function buildDensitySeries(points: [number, number][], controls: ScatterControls): any[] {
    return [{
        type: 'scatter',
        name: 'density',
        data: points,
        mode: 'density',
        binSize: controls.binSize,
        densityColormap: paletteForScale(controls.colormap),
        densityNormalization: controls.normalization,
        sampling: 'none',
    }];
}

/* ── Tooltip factories ────────────────────────────────── */

export function buildDensityTooltipCache(series: any[], controls: ScatterControls, container: HTMLElement | null): DensityTooltipCache | null {
    const metrics = getPlotMetrics(container);
    if (!metrics) return null;

    const xSpan = appState.scatter.view.xMax - appState.scatter.view.xMin;
    const ySpan = appState.scatter.view.yMax - appState.scatter.view.yMin;
    if (!(xSpan > 0) || !(ySpan > 0)) return null;

    const binSize = Math.max(1, Number(controls.binSize) || 10);
    const key = [
        appState.scatter.view.xMin, appState.scatter.view.xMax, appState.scatter.view.yMin, appState.scatter.view.yMax,
        metrics.plotWidth, metrics.plotHeight,
        binSize, controls.colorColumn || '', controls.renderMode || '',
    ].join('|');

    if (appState.scatter.densityTooltipCache?.key === key) return appState.scatter.densityTooltipCache;

    const binsBySeriesIndex = new Map<number, Map<string, number>>();
    const metaBySeriesIndex = new Map<number, any>();

    for (let si = 0; si < series.length; si++) {
        const s = series[si];
        if (!s || !Array.isArray(s.data)) continue;
        const map = new Map<string, number>();

        if (Object.prototype.hasOwnProperty.call(s, '__edatimeColorCenter')) {
            metaBySeriesIndex.set(si, { colorCenter: s.__edatimeColorCenter, colorLo: s.__edatimeColorLo, colorHi: s.__edatimeColorHi });
        }

        for (const p of s.data) {
            const x = Number(p?.[0]);
            const y = Number(p?.[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < appState.scatter.view.xMin || x > appState.scatter.view.xMax || y < appState.scatter.view.yMin || y > appState.scatter.view.yMax) continue;
            const nx = (x - appState.scatter.view.xMin) / xSpan;
            const ny = (y - appState.scatter.view.yMin) / ySpan;
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
            const bx = Math.floor((nx * metrics.plotWidth) / binSize);
            const by = Math.floor(((1 - ny) * metrics.plotHeight) / binSize);
            const k = `${bx},${by}`;
            map.set(k, (map.get(k) || 0) + 1);
        }
        binsBySeriesIndex.set(si, map);
    }

    appState.scatter.densityTooltipCache = { key, binSize, metrics, binsBySeriesIndex, metaBySeriesIndex };
    return appState.scatter.densityTooltipCache;
}

export function densityTooltipFormatterFactory(controls: ScatterControls, container: HTMLElement | null) {
    return (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p) return '';
        const cache = appState.scatter.densityTooltipCache || buildDensityTooltipCache(appState.scatter.lastOptionSeries || [], controls, container);
        const x = Number(p?.value?.[0]);
        const y = Number(p?.value?.[1]);
        const seriesIndex = Number(p?.seriesIndex);
        let density: number | null = null;
        const bins = cache?.binsBySeriesIndex?.get(seriesIndex);
        const m = cache?.metrics;
        const xSpan = appState.scatter.view.xMax - appState.scatter.view.xMin;
        const ySpan = appState.scatter.view.yMax - appState.scatter.view.yMin;
        const binSize = cache?.binSize;
        if (bins && m && Number.isFinite(x) && Number.isFinite(y) && (xSpan > 0) && (ySpan > 0) && Number.isFinite(binSize) && binSize! > 0) {
            const nx = (x - appState.scatter.view.xMin) / xSpan;
            const ny = (y - appState.scatter.view.yMin) / ySpan;
            const bx = Math.floor((nx * m.plotWidth) / binSize!);
            const by = Math.floor(((1 - ny) * m.plotHeight) / binSize!);
            density = bins.get(`${bx},${by}`) ?? null;
        }
        const parts: string[] = [];
        const xSpanLabel = Math.max(1, appState.scatter.view.xMax - appState.scatter.view.xMin);
        const ySpanLabel = Math.max(1, appState.scatter.view.yMax - appState.scatter.view.yMin);
        parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.x || 'X')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpanLabel, appState.scatter.columnTypes))}</span></div>`);
        parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.y || 'Y')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpanLabel, appState.scatter.columnTypes))}</span></div>`);
        const meta = cache?.metaBySeriesIndex?.get(seriesIndex);
        if (controls.colorColumn && meta && Number.isFinite(meta.colorCenter)) {
            parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.colorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatTwoDecimals(meta.colorCenter))}</span></div>`);
        }
        parts.push(`<div><span style="opacity:0.85;">Density:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(density == null ? '—' : fmt.format(density))}</span></div>`);
        return parts.join('');
    };
}

export function scatterTooltipFormatterFactory(controls: ScatterControls) {
    return (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p) return '';
        const x = Number(p?.value?.[0]);
        const y = Number(p?.value?.[1]);
        const xSpan = Math.max(1, appState.scatter.view.xMax - appState.scatter.view.xMin);
        const ySpan = Math.max(1, appState.scatter.view.yMax - appState.scatter.view.yMin);
        const parts = [
            `<div><span style="opacity:0.85;">${escapeHtml(controls.x || 'X')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpan, appState.scatter.columnTypes))}</span></div>`,
            `<div><span style="opacity:0.85;">${escapeHtml(controls.y || 'Y')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpan, appState.scatter.columnTypes))}</span></div>`,
        ];
        if (controls.selectedColorColumn && Array.isArray(appState.scatter.colorLabels)) {
            const label = p?.seriesName || null;
            if (label) parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.selectedColorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(String(label))}</span></div>`);
        } else if (controls.selectedColorColumn && Array.isArray(appState.scatter.colorValues)) {
            const colorValue = Number(appState.scatter.colorValues[Number(p?.dataIndex)]);
            if (Number.isFinite(colorValue)) parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.selectedColorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatTwoDecimals(colorValue))}</span></div>`);
        }
        return parts.join('');
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
    if (appState.scatter.activeView !== 'plot') { setColorbarVisible(false); return; }
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const hasContinuousColor = !!ctl.selectedColorColumn
        && Array.isArray(appState.scatter.colorValues) && appState.scatter.colorValues.length > 0
        && Number.isFinite(appState.scatter.colorMin) && Number.isFinite(appState.scatter.colorMax)
        && appState.scatter.colorMax! > appState.scatter.colorMin!;
    if (!isDensity && !hasContinuousColor) { setColorbarVisible(false); return; }
    const show = isDensity || hasContinuousColor;
    setColorbarVisible(show);
    if (!show) return;

    const nameEl = getEl('scatter-colorbar-name');
    const minEl = getEl('scatter-colorbar-min');
    const maxEl = getEl('scatter-colorbar-max');

    if (isDensity) {
        if (nameEl) nameEl.textContent = `Density (${ctl.colormap})`;
        if (minEl) minEl.textContent = 'Low';
        if (maxEl) maxEl.textContent = 'High';
    } else {
        if (nameEl) nameEl.textContent = `${ctl.selectedColorColumn} (${ctl.colorScale})`;
        if (minEl) minEl.textContent = formatTwoDecimals(appState.scatter.colorMin!);
        if (maxEl) maxEl.textContent = formatTwoDecimals(appState.scatter.colorMax!);
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

function drawMarginalX(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number): void {
    const frame = getCanvasFrame(canvas, 600, 64);
    if (!frame) return;
    const { ctx, width, height } = frame;
    const histogram = buildHistogramForDomain(values, viewMin, viewMax, 40);
    if (!histogram) return;
    const plotLeft = SCATTER_GRID_LEFT;
    const plotRight = Math.max(plotLeft + 1, width - SCATTER_GRID_RIGHT);
    const plotW = plotRight - plotLeft;
    const { counts } = histogram;
    const maxCount = Math.max(1, ...counts);
    const barW = plotW / counts.length;
    const drawH = height - 4;
    ctx.fillStyle = 'rgba(74, 158, 255, 0.45)';
    for (let i = 0; i < counts.length; i++) {
        if (counts[i] === 0) continue;
        const barH = Math.max(2, (counts[i] / maxCount) * drawH);
        ctx.fillRect(plotLeft + i * barW + 0.5, height - barH - 2, Math.max(1, barW - 1), barH);
    }
}

function drawMarginalY(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number): void {
    const frame = getCanvasFrame(canvas, 40, 400);
    if (!frame) return;
    const { ctx, width, height } = frame;
    const histogram = buildHistogramForDomain(values, viewMin, viewMax, 32);
    if (!histogram) return;
    const plotTop = SCATTER_GRID_TOP;
    const plotBottom = Math.max(plotTop + 1, height - SCATTER_GRID_BOTTOM);
    const plotH = plotBottom - plotTop;
    const { counts } = histogram;
    const maxCount = Math.max(1, ...counts);
    const binH = plotH / counts.length;
    const maxBarW = width - 4;
    ctx.fillStyle = 'rgba(74, 158, 255, 0.35)';
    for (let i = 0; i < counts.length; i++) {
        if (counts[i] === 0) continue;
        const barW = Math.max(2, (counts[i] / maxCount) * maxBarW);
        const y = plotBottom - (i + 1) * binH;
        ctx.fillRect(0, y + 0.5, barW, Math.max(1, binH - 1));
    }
}

export function updateMarginalPlots(): void {
    const isPlot = appState.scatter.activeView === 'plot';
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const hasPoints = appState.scatter.points.length > 0;
    const showMarginals = isPlot && !isDensity && hasPoints;

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

    const xValues = appState.scatter.points.map((p) => Number(p[0])).filter((v) => Number.isFinite(v));
    const yValues = appState.scatter.points.map((p) => Number(p[1])).filter((v) => Number.isFinite(v));

    if (marginalX) requestAnimationFrame(() => drawMarginalX(marginalX, xValues, appState.scatter.view.xMin, appState.scatter.view.xMax));
    if (marginalY) requestAnimationFrame(() => drawMarginalY(marginalY, yValues, appState.scatter.view.yMin, appState.scatter.view.yMax));
}

/* ── Option builder ───────────────────────────────────── */

export function buildOption(points: [number, number][], container: HTMLElement | null): any {
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const xSpan = Math.max(1, appState.scatter.view.xMax - appState.scatter.view.xMin);
    const ySpan = Math.max(1, appState.scatter.view.yMax - appState.scatter.view.yMin);
    const xTickFormatter = isTemporalColumn(ctl.x, appState.scatter.columnTypes)
        ? (v: number) => formatTimestamp(v, xSpan)
        : (v: number) => formatTwoDecimals(v);
    const yTickFormatter = isTemporalColumn(ctl.y, appState.scatter.columnTypes)
        ? (v: number) => formatTimestamp(v, ySpan)
        : (v: number) => formatTwoDecimals(v);

    const series = isDensity ? buildDensitySeries(points, ctl) : buildNormalScatterSeries(points, ctl);
    appState.scatter.lastOptionSeries = series;

    const option: any = {
        theme: 'dark',
        grid: { left: 72, right: 200, top: 24, bottom: 50 },
        xAxis: { type: 'value', name: ctl.x || 'x', min: appState.scatter.view.xMin, max: appState.scatter.view.xMax, tickFormatter: xTickFormatter },
        yAxis: { type: 'value', name: ctl.y || 'y', min: appState.scatter.view.yMin, max: appState.scatter.view.yMax, tickFormatter: yTickFormatter },
        legend: { show: false },
        series,
    };

    if (isDensity) {
        option.tooltip = { show: true, trigger: 'item', formatter: densityTooltipFormatterFactory(ctl, container) };
        buildDensityTooltipCache(series, ctl, container);
    } else {
        appState.scatter.densityTooltipCache = null;
        option.tooltip = { show: true, trigger: 'item', formatter: scatterTooltipFormatterFactory(ctl) };
    }
    return option;
}

/* ── View management ──────────────────────────────────── */

export function renderCurrentOption(): void {
    if (!appState.scatter.chart) return;
    const container = getEl('scatter-chart');
    appState.scatter.chart.setOption(buildOption(appState.scatter.points, container));
    requestAnimationFrame(() => appState.scatter.chart?.resize?.());
    updateColorbarUI();
    updateBinnedReadout();
    updateMarginalPlots();
}

export function applyView(nextView: ScatterView, pushHistory = false): void {
    const current = { ...appState.scatter.view };
    const next = clampView(nextView);
    if (pushHistory) appState.scatter.zoomHistory = [...appState.scatter.zoomHistory, current].slice(-30);
    appState.scatter.view = next;
    renderCurrentOption();
}

export function resetView(clearHistory = true): void {
    if (clearHistory) appState.scatter.zoomHistory = [];
    appState.scatter.view = { ...appState.scatter.full };
    renderCurrentOption();
}

export function updateBinnedReadout(): void {
    if (!appState.scatter.chart || appState.scatter.points.length === 0) { setStats({ visiblePoints: '0' }); return; }
    const i0 = lowerBoundByX(appState.scatter.points, appState.scatter.view.xMin);
    const i1 = upperBoundByX(appState.scatter.points, appState.scatter.view.xMax);
    const visibleCount = Math.max(0, i1 - i0);
    const text = fmt.format(visibleCount);
    if (text !== appState.scatter.lastBinnedText) { appState.scatter.lastBinnedText = text; setStats({ visiblePoints: text }); }
}

export function updateCorrelationStats(): void {
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const pairEl = getEl('scatter-current-pair');
    const openCausalBtn = getEl('scatter-open-causal-btn') as HTMLButtonElement | null;
    const corr = appState.scatter.correlationsByColumn.get(ySelect?.value || '');
    const pearson = Number.isFinite(corr?.pearson) ? corr!.pearson!.toFixed(3) : '—';
    const spearman = Number.isFinite(corr?.spearman) ? corr!.spearman!.toFixed(3) : '—';
    if (pairEl) {
        const x = xSelect?.value || 'X';
        const y = ySelect?.value || 'Y';
        pairEl.textContent = `Pair: ${x} vs ${y}`;
    }
    if (openCausalBtn) openCausalBtn.disabled = !(xSelect?.value && ySelect?.value);
    setStats({ pearson, spearman });
    setCorrelationOverlayText(corr?.pearson, corr?.spearman);
}

/* ── Selection zoom ───────────────────────────────────── */

export function initSelectionZoom(container: HTMLElement): void {
    if (!container || appState.scatter.selectionBox) return;
    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'absolute', left: '0', top: '0', width: '0', height: '0',
        border: '1px solid rgba(0, 212, 255, 0.9)', background: 'rgba(0, 212, 255, 0.15)',
        pointerEvents: 'none', display: 'none', zIndex: '8',
    });
    container.appendChild(box);
    appState.scatter.selectionBox = box;

    const renderSelectionBox = () => {
        if (!appState.scatter.selectionBox || !appState.scatter.drag) return;
        const left = Math.min(appState.scatter.drag.startX, appState.scatter.drag.endX);
        const right = Math.max(appState.scatter.drag.startX, appState.scatter.drag.endX);
        const top = Math.min(appState.scatter.drag.startY, appState.scatter.drag.endY);
        const bottom = Math.max(appState.scatter.drag.startY, appState.scatter.drag.endY);
        appState.scatter.selectionBox.style.left = `${left}px`;
        appState.scatter.selectionBox.style.top = `${top}px`;
        appState.scatter.selectionBox.style.width = `${Math.max(0, right - left)}px`;
        appState.scatter.selectionBox.style.height = `${Math.max(0, bottom - top)}px`;
        appState.scatter.selectionBox.style.display = 'block';
    };

    const hideSelectionBox = () => { if (appState.scatter.selectionBox) appState.scatter.selectionBox.style.display = 'none'; };

    container.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const rect = container.getBoundingClientRect();
        appState.scatter.drag = { pointerId: ev.pointerId, startX: ev.clientX - rect.left, endX: ev.clientX - rect.left, startY: ev.clientY - rect.top, endY: ev.clientY - rect.top };
        try { container.setPointerCapture(ev.pointerId); } catch { }
        renderSelectionBox();
    });

    container.addEventListener('pointermove', (ev) => {
        if (!appState.scatter.drag || ev.pointerId !== appState.scatter.drag.pointerId) return;
        const rect = container.getBoundingClientRect();
        appState.scatter.drag.endX = ev.clientX - rect.left;
        appState.scatter.drag.endY = ev.clientY - rect.top;
        renderSelectionBox();
    });

    const finishDrag = (ev: PointerEvent) => {
        if (!appState.scatter.drag || ev.pointerId !== appState.scatter.drag.pointerId) return;
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const left = Math.max(0, Math.min(appState.scatter.drag.startX, appState.scatter.drag.endX));
        const right = Math.min(width, Math.max(appState.scatter.drag.startX, appState.scatter.drag.endX));
        const top = Math.max(0, Math.min(appState.scatter.drag.startY, appState.scatter.drag.endY));
        const bottom = Math.min(height, Math.max(appState.scatter.drag.startY, appState.scatter.drag.endY));
        appState.scatter.drag = null;
        hideSelectionBox();
        if ((right - left) < 8 || (bottom - top) < 8) { try { container.releasePointerCapture(ev.pointerId); } catch { } return; }
        const cur = appState.scatter.view;
        const xSpan = cur.xMax - cur.xMin;
        const ySpan = cur.yMax - cur.yMin;
        applyView({
            xMin: cur.xMin + (left / width) * xSpan,
            xMax: cur.xMin + (right / width) * xSpan,
            yMax: cur.yMax - (top / height) * ySpan,
            yMin: cur.yMax - (bottom / height) * ySpan,
        }, true);
        try { container.releasePointerCapture(ev.pointerId); } catch { }
    };

    container.addEventListener('pointerup', finishDrag);
    container.addEventListener('pointercancel', finishDrag);
    container.addEventListener('dblclick', (ev) => {
        if (ev.shiftKey) return;
        if (appState.scatter.zoomHistory.length > 0) { applyView(appState.scatter.zoomHistory.pop()!, false); return; }
        resetView(false);
    });
}

/* ── Sync mode UI ─────────────────────────────────────── */

export function syncModeUI(): void {
    const ctl = currentControls();
    const view = appState.scatter.activeView || 'plot';
    const isPlot = view === 'plot';
    const isMatrix = view === 'matrix';
    const isDensity = isPlot && ctl.renderMode === 'density';
    const toggle = (el: HTMLElement | null, visible: boolean) => { if (el) el.style.display = visible ? '' : 'none'; };

    toggle(getEl('scatter-analytics-group'), !isMatrix);
    toggle(getEl('scatter-mode-label'), isPlot);
    toggle(getEl('scatter-render-mode'), isPlot);
    toggle(getEl('scatter-density-controls'), isDensity);
    toggle(getEl('scatter-color-controls'), true);
    toggle(getEl('scatter-color-scale'), isPlot && !isDensity);
    toggle(document.querySelector('.scatter-export-group'), isPlot);
    toggle(document.querySelector('.scatter-stats-bar'), isPlot);
    toggle(document.querySelector('.scatter-suggestions-bar'), !isMatrix);
    updateColorbarUI();
}

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

