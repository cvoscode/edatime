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
import {
    state,
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
    const values = state.colorValues;
    const categoricalGroups = colorColumn ? buildCategoricalColorGroups(state.colorLabels) : null;

    if (categoricalGroups) {
        return categoricalGroups.categories.map((label) => {
            const data: [number, number][] = [];
            for (let i = 0; i < points.length; i++) {
                if (normalizeCategoryLabel(state.colorLabels?.[i]) !== label) continue;
                data.push(points[i]);
            }
            return { type: 'scatter', name: label, data, symbolSize: 3, color: categoricalGroups.colorByLabel.get(label) || '#4a9eff', sampling: 'none' };
        }).filter((s: any) => s.data.length > 0);
    }

    if (!colorColumn || !Array.isArray(values) || values.length === 0) {
        return [{ type: 'scatter', name: `${controls.x || 'x'} vs ${controls.y || 'y'}`, data: points, symbolSize: 3, color: '#4a9eff', sampling: 'none' }];
    }

    const min = Number.isFinite(state.colorMin) ? state.colorMin! : null;
    const max = Number.isFinite(state.colorMax) ? state.colorMax! : null;
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

    const xSpan = state.view.xMax - state.view.xMin;
    const ySpan = state.view.yMax - state.view.yMin;
    if (!(xSpan > 0) || !(ySpan > 0)) return null;

    const binSize = Math.max(1, Number(controls.binSize) || 10);
    const key = [
        state.view.xMin, state.view.xMax, state.view.yMin, state.view.yMax,
        metrics.plotWidth, metrics.plotHeight,
        binSize, controls.colorColumn || '', controls.renderMode || '',
    ].join('|');

    if (state.densityTooltipCache?.key === key) return state.densityTooltipCache;

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
            if (x < state.view.xMin || x > state.view.xMax || y < state.view.yMin || y > state.view.yMax) continue;
            const nx = (x - state.view.xMin) / xSpan;
            const ny = (y - state.view.yMin) / ySpan;
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
            const bx = Math.floor((nx * metrics.plotWidth) / binSize);
            const by = Math.floor(((1 - ny) * metrics.plotHeight) / binSize);
            const k = `${bx},${by}`;
            map.set(k, (map.get(k) || 0) + 1);
        }
        binsBySeriesIndex.set(si, map);
    }

    state.densityTooltipCache = { key, binSize, metrics, binsBySeriesIndex, metaBySeriesIndex };
    return state.densityTooltipCache;
}

export function densityTooltipFormatterFactory(controls: ScatterControls, container: HTMLElement | null) {
    return (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p) return '';
        const cache = state.densityTooltipCache || buildDensityTooltipCache(state.lastOptionSeries || [], controls, container);
        const x = Number(p?.value?.[0]);
        const y = Number(p?.value?.[1]);
        const seriesIndex = Number(p?.seriesIndex);
        let density: number | null = null;
        const bins = cache?.binsBySeriesIndex?.get(seriesIndex);
        const m = cache?.metrics;
        const xSpan = state.view.xMax - state.view.xMin;
        const ySpan = state.view.yMax - state.view.yMin;
        const binSize = cache?.binSize;
        if (bins && m && Number.isFinite(x) && Number.isFinite(y) && (xSpan > 0) && (ySpan > 0) && Number.isFinite(binSize) && binSize! > 0) {
            const nx = (x - state.view.xMin) / xSpan;
            const ny = (y - state.view.yMin) / ySpan;
            const bx = Math.floor((nx * m.plotWidth) / binSize!);
            const by = Math.floor(((1 - ny) * m.plotHeight) / binSize!);
            density = bins.get(`${bx},${by}`) ?? null;
        }
        const parts: string[] = [];
        const xSpanLabel = Math.max(1, state.view.xMax - state.view.xMin);
        const ySpanLabel = Math.max(1, state.view.yMax - state.view.yMin);
        parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.x || 'X')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpanLabel, state.columnTypes))}</span></div>`);
        parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.y || 'Y')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpanLabel, state.columnTypes))}</span></div>`);
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
        const xSpan = Math.max(1, state.view.xMax - state.view.xMin);
        const ySpan = Math.max(1, state.view.yMax - state.view.yMin);
        const parts = [
            `<div><span style="opacity:0.85;">${escapeHtml(controls.x || 'X')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpan, state.columnTypes))}</span></div>`,
            `<div><span style="opacity:0.85;">${escapeHtml(controls.y || 'Y')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpan, state.columnTypes))}</span></div>`,
        ];
        if (controls.selectedColorColumn && Array.isArray(state.colorLabels)) {
            const label = p?.seriesName || null;
            if (label) parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.selectedColorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(String(label))}</span></div>`);
        } else if (controls.selectedColorColumn && Array.isArray(state.colorValues)) {
            const colorValue = Number(state.colorValues[Number(p?.dataIndex)]);
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
    if (state.activeView !== 'plot') { setColorbarVisible(false); return; }
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const hasContinuousColor = !!ctl.selectedColorColumn
        && Array.isArray(state.colorValues) && state.colorValues.length > 0
        && Number.isFinite(state.colorMin) && Number.isFinite(state.colorMax)
        && state.colorMax! > state.colorMin!;
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
        if (minEl) minEl.textContent = formatTwoDecimals(state.colorMin!);
        if (maxEl) maxEl.textContent = formatTwoDecimals(state.colorMax!);
    }
    requestAnimationFrame(renderColorbarCanvas);
}

export function setCorrelationOverlayText(pearson?: number | null, spearman?: number | null): void {
    const el = getEl('scatter-correlation-overlay');
    if (!el) return;
    const hasP = Number.isFinite(pearson);
    const hasS = Number.isFinite(spearman);
    if (!hasP && !hasS) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div>Pearson: <strong>${escapeHtml(hasP ? pearson!.toFixed(3) : '—')}</strong> / Spearman: <strong>${escapeHtml(hasS ? spearman!.toFixed(3) : '—')}</strong>`
        + ` <button class="scatter-causal-link btn btn-ghost btn-sm" title="Run causal analysis on X/Y columns" style="margin-left:8px;font-size:0.65rem;padding:1px 6px;">⇒ Causal</button></div>`;

    // Wire click → navigate to causal with scatter X/Y columns
    const btn = el.querySelector('.scatter-causal-link');
    btn?.addEventListener('click', () => {
        const xCol = (document.getElementById('scatter-x-col') as HTMLSelectElement | null)?.value;
        const yCol = (document.getElementById('scatter-y-col') as HTMLSelectElement | null)?.value;
        if (xCol && yCol) {
            window.dispatchEvent(new CustomEvent('edatime:causal-preselect', {
                detail: { columns: [xCol, yCol] },
            }));
            // Navigate to causal page via sidebar click
            (document.querySelector('.sidebar .nav-item[data-page="causal"]') as HTMLElement)?.click?.();
        }
    });
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
    const isPlot = state.activeView === 'plot';
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const hasPoints = state.points.length > 0;
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

    const xValues = state.points.map((p) => Number(p[0])).filter((v) => Number.isFinite(v));
    const yValues = state.points.map((p) => Number(p[1])).filter((v) => Number.isFinite(v));

    if (marginalX) requestAnimationFrame(() => drawMarginalX(marginalX, xValues, state.view.xMin, state.view.xMax));
    if (marginalY) requestAnimationFrame(() => drawMarginalY(marginalY, yValues, state.view.yMin, state.view.yMax));
}

/* ── Option builder ───────────────────────────────────── */

export function buildOption(points: [number, number][], container: HTMLElement | null): any {
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const xSpan = Math.max(1, state.view.xMax - state.view.xMin);
    const ySpan = Math.max(1, state.view.yMax - state.view.yMin);
    const xTickFormatter = isTemporalColumn(ctl.x, state.columnTypes)
        ? (v: number) => formatTimestamp(v, xSpan)
        : (v: number) => formatTwoDecimals(v);
    const yTickFormatter = isTemporalColumn(ctl.y, state.columnTypes)
        ? (v: number) => formatTimestamp(v, ySpan)
        : (v: number) => formatTwoDecimals(v);

    const series = isDensity ? buildDensitySeries(points, ctl) : buildNormalScatterSeries(points, ctl);
    state.lastOptionSeries = series;

    const option: any = {
        theme: 'dark',
        grid: { left: 72, right: 200, top: 24, bottom: 50 },
        xAxis: { type: 'value', name: ctl.x || 'x', min: state.view.xMin, max: state.view.xMax, tickFormatter: xTickFormatter },
        yAxis: { type: 'value', name: ctl.y || 'y', min: state.view.yMin, max: state.view.yMax, tickFormatter: yTickFormatter },
        legend: { show: false },
        series,
    };

    if (isDensity) {
        option.tooltip = { show: true, trigger: 'item', formatter: densityTooltipFormatterFactory(ctl, container) };
        buildDensityTooltipCache(series, ctl, container);
    } else {
        state.densityTooltipCache = null;
        option.tooltip = { show: true, trigger: 'item', formatter: scatterTooltipFormatterFactory(ctl) };
    }
    return option;
}

/* ── View management ──────────────────────────────────── */

export function renderCurrentOption(): void {
    if (!state.chart) return;
    const container = getEl('scatter-chart');
    state.chart.setOption(buildOption(state.points, container));
    requestAnimationFrame(() => state.chart?.resize?.());
    updateColorbarUI();
    updateBinnedReadout();
    updateMarginalPlots();
}

export function applyView(nextView: ScatterView, pushHistory = false): void {
    const current = { ...state.view };
    const next = clampView(nextView);
    if (pushHistory) state.zoomHistory = [...state.zoomHistory, current].slice(-30);
    state.view = next;
    renderCurrentOption();
}

export function resetView(clearHistory = true): void {
    if (clearHistory) state.zoomHistory = [];
    state.view = { ...state.full };
    renderCurrentOption();
}

export function updateBinnedReadout(): void {
    if (!state.chart || state.points.length === 0) { setStats({ visiblePoints: '0' }); return; }
    const i0 = lowerBoundByX(state.points, state.view.xMin);
    const i1 = upperBoundByX(state.points, state.view.xMax);
    const visibleCount = Math.max(0, i1 - i0);
    const text = fmt.format(visibleCount);
    if (text !== state.lastBinnedText) { state.lastBinnedText = text; setStats({ visiblePoints: text }); }
}

export function updateCorrelationStats(): void {
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const corr = state.correlationsByColumn.get(ySelect?.value || '');
    const pearson = Number.isFinite(corr?.pearson) ? corr!.pearson!.toFixed(3) : '—';
    const spearman = Number.isFinite(corr?.spearman) ? corr!.spearman!.toFixed(3) : '—';
    setStats({ pearson, spearman });
    setCorrelationOverlayText(corr?.pearson, corr?.spearman);
}

/* ── Selection zoom ───────────────────────────────────── */

export function initSelectionZoom(container: HTMLElement): void {
    if (!container || state.selectionBox) return;
    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'absolute', left: '0', top: '0', width: '0', height: '0',
        border: '1px solid rgba(0, 212, 255, 0.9)', background: 'rgba(0, 212, 255, 0.15)',
        pointerEvents: 'none', display: 'none', zIndex: '8',
    });
    container.appendChild(box);
    state.selectionBox = box;

    const renderSelectionBox = () => {
        if (!state.selectionBox || !state.drag) return;
        const left = Math.min(state.drag.startX, state.drag.endX);
        const right = Math.max(state.drag.startX, state.drag.endX);
        const top = Math.min(state.drag.startY, state.drag.endY);
        const bottom = Math.max(state.drag.startY, state.drag.endY);
        state.selectionBox.style.left = `${left}px`;
        state.selectionBox.style.top = `${top}px`;
        state.selectionBox.style.width = `${Math.max(0, right - left)}px`;
        state.selectionBox.style.height = `${Math.max(0, bottom - top)}px`;
        state.selectionBox.style.display = 'block';
    };

    const hideSelectionBox = () => { if (state.selectionBox) state.selectionBox.style.display = 'none'; };

    container.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const rect = container.getBoundingClientRect();
        state.drag = { pointerId: ev.pointerId, startX: ev.clientX - rect.left, endX: ev.clientX - rect.left, startY: ev.clientY - rect.top, endY: ev.clientY - rect.top };
        try { container.setPointerCapture(ev.pointerId); } catch { }
        renderSelectionBox();
    });

    container.addEventListener('pointermove', (ev) => {
        if (!state.drag || ev.pointerId !== state.drag.pointerId) return;
        const rect = container.getBoundingClientRect();
        state.drag.endX = ev.clientX - rect.left;
        state.drag.endY = ev.clientY - rect.top;
        renderSelectionBox();
    });

    const finishDrag = (ev: PointerEvent) => {
        if (!state.drag || ev.pointerId !== state.drag.pointerId) return;
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const left = Math.max(0, Math.min(state.drag.startX, state.drag.endX));
        const right = Math.min(width, Math.max(state.drag.startX, state.drag.endX));
        const top = Math.max(0, Math.min(state.drag.startY, state.drag.endY));
        const bottom = Math.min(height, Math.max(state.drag.startY, state.drag.endY));
        state.drag = null;
        hideSelectionBox();
        if ((right - left) < 8 || (bottom - top) < 8) { try { container.releasePointerCapture(ev.pointerId); } catch { } return; }
        const cur = state.view;
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
        if (state.zoomHistory.length > 0) { applyView(state.zoomHistory.pop()!, false); return; }
        resetView(false);
    });
}

/* ── Sync mode UI ─────────────────────────────────────── */

export function syncModeUI(): void {
    const ctl = currentControls();
    const view = state.activeView || 'plot';
    const isPlot = view === 'plot';
    const isDist = view === 'distributions';
    const isMatrix = view === 'matrix';
    const isDensity = isPlot && ctl.renderMode === 'density';
    const toggle = (el: HTMLElement | null, visible: boolean) => { if (el) el.style.display = visible ? '' : 'none'; };

    toggle(getEl('scatter-analytics-group'), !isMatrix);
    toggle(getEl('scatter-mode-label'), isPlot);
    toggle(getEl('scatter-render-mode'), isPlot);
    toggle(getEl('scatter-density-controls'), isDensity);
    toggle(getEl('scatter-color-controls'), !isDist);
    toggle(getEl('scatter-color-scale'), isPlot && !isDensity);
    toggle(document.querySelector('.scatter-export-group'), isPlot);
    toggle(document.querySelector('.scatter-stats-bar'), isPlot);
    toggle(document.querySelector('.scatter-suggestions-bar'), !isDist && !isMatrix);
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

