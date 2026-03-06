import { createChart } from '../libs/chartgpu/dist/index.js?v=3';
import { fetchScatterCorrelations, fetchScatterPoints } from './dataClient.js?v=14';
import { appState, buildAdaptiveLineFiltersForQuery } from './state.js?v=2';

const fmt = new Intl.NumberFormat(undefined);
const EURO_DATE_ONLY = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});
const EURO_DATE_TIME = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});
const EURO_DATE_TIME_SECONDS = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});

const state = {
    chart: null,
    initialized: false,
    pageInitialized: false,
    totalPoints: 0,
    allPoints: [],
    points: [],
    allColorValues: null,
    full: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    view: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    zoomHistory: [],
    drag: null,
    selectionBox: null,
    colorColumn: '',
    colorValues: null,
    colorMin: null,
    colorMax: null,
    correlationsByColumn: new Map(),
    lastBinnedText: '',
    lastUpdateMs: 0,
    densityTooltipCache: null,
    lastOptionSeries: null,
    columnTypes: new Map(),
    lastSuggestions: [],
    lastRenderSignature: '',
};

function getEl(id) {
    return document.getElementById(id);
}

function showError(message) {
    const el = getEl('scatter-error');
    if (!el) return;
    if (!message) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    el.textContent = String(message);
    el.hidden = false;
}

function lowerBoundByX(points, x) {
    let lo = 0;
    let hi = points.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (points[mid][0] < x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function upperBoundByX(points, x) {
    let lo = 0;
    let hi = points.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (points[mid][0] <= x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function setStats(partial) {
    const totalEl = getEl('scatter-total-points');
    const visibleEl = getEl('scatter-binned-points');
    const pearsonEl = getEl('scatter-pearson');
    const spearmanEl = getEl('scatter-spearman');

    if (Object.prototype.hasOwnProperty.call(partial, 'totalPoints') && totalEl) {
        totalEl.textContent = `Total points: ${partial.totalPoints ?? '—'}`;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'visiblePoints') && visibleEl) {
        visibleEl.textContent = `Visible points: ${partial.visiblePoints ?? '—'}`;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'pearson') && pearsonEl) {
        pearsonEl.textContent = `Pearson: ${partial.pearson ?? '—'}`;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'spearman') && spearmanEl) {
        spearmanEl.textContent = `Spearman: ${partial.spearman ?? '—'}`;
    }
}

function currentControls() {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    const binSizeInput = getEl('scatter-bin-size');
    const colormapSelect = getEl('scatter-colormap');
    const normalizationSelect = getEl('scatter-normalization');
    const renderModeSelect = getEl('scatter-render-mode');
    const colorColumnSelect = getEl('scatter-color-column');
    const colorScaleSelect = getEl('scatter-color-scale');

    const renderMode = renderModeSelect?.value || 'density';

    return {
        x: xSelect?.value,
        y: ySelect?.value,
        binSize: Number(binSizeInput?.value ?? 10),
        colormap: colormapSelect?.value ?? 'viridis',
        normalization: normalizationSelect?.value ?? 'linear',
        renderMode,
        colorColumn: renderMode === 'density' ? '' : (colorColumnSelect?.value || ''),
        selectedColorColumn: colorColumnSelect?.value || '',
        colorScale: colorScaleSelect?.value || 'viridis',
    };
}

function buildScatterQueryContext() {
    const start = Number(appState.currentStart);
    const end = Number(appState.currentEnd);
    const filters = Object.entries(appState.columnRanges || {})
        .map(([column, range]) => {
            const from = Number(range?.from);
            const to = Number(range?.to);
            if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
            return { column, from, to };
        })
        .filter(Boolean);

    return {
        start: isLinkedBrushEnabled() && Number.isFinite(start) ? start : undefined,
        end: isLinkedBrushEnabled() && Number.isFinite(end) ? end : undefined,
        filters,
        lineFilters: buildAdaptiveLineFiltersForQuery(),
    };
}

function buildRenderSignature(controls) {
    return [
        controls.x || '',
        controls.y || '',
        controls.renderMode || '',
        controls.colorColumn || '',
        controls.colorScale || '',
        controls.colormap || '',
        controls.normalization || '',
    ].join('|');
}

function resetScatterContainer() {
    const existing = getEl('scatter-chart');
    if (!existing) return null;
    const replacement = existing.cloneNode(false);
    existing.replaceWith(replacement);
    return replacement;
}

function disposeScatterChart(resetSignature = false) {
    state.chart?.dispose?.();
    state.chart = null;
    state.selectionBox = null;
    state.drag = null;
    state.densityTooltipCache = null;
    if (resetSignature) state.lastRenderSignature = '';
}

function isLinkedBrushEnabled() {
    return !!getEl('scatter-link-brush')?.checked;
}

function isTemporalColumn(name) {
    const dtype = state.columnTypes.get(String(name || '').toLowerCase()) || '';
    return /date|time/i.test(dtype);
}

function formatAxisNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatTemporalTick(value, spanMs) {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return '—';
    const date = new Date(ms);
    if (!Number.isFinite(date.getTime())) return '—';
    if (spanMs <= 2 * 60_000) return EURO_DATE_TIME_SECONDS.format(date);
    if (spanMs <= 2 * 24 * 60 * 60_000) return EURO_DATE_TIME.format(date);
    return EURO_DATE_ONLY.format(date);
}

function formatValueForColumn(columnName, value, spanMs) {
    return isTemporalColumn(columnName)
        ? formatTemporalTick(value, spanMs)
        : formatAxisNumber(value);
}

function computeColorExtent(values) {
    if (!Array.isArray(values)) return null;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < values.length; i++) {
        const v = Number(values[i]);
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return null;
    return { min, max };
}

function paletteForScale(scale) {
    if (scale === 'plasma') {
        return ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'];
    }
    if (scale === 'inferno') {
        return ['#000004', '#420a68', '#932667', '#dd513a', '#fba40a', '#fcffa4'];
    }
    return ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'];
}

function hexToRgb(hex) {
    const clean = String(hex).replace('#', '');
    const v = clean.length === 3
        ? clean.split('').map((c) => c + c).join('')
        : clean;
    const num = Number.parseInt(v, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
    };
}

function rgbToHex({ r, g, b }) {
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(Math.max(0, Math.min(255, Math.round(g))))}${toHex(Math.max(0, Math.min(255, Math.round(b))))}`;
}

function sampleGradient(stops, t) {
    const n = stops.length;
    if (n === 0) return '#4a9eff';
    if (n === 1) return stops[0];

    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * (n - 1);
    const i0 = Math.floor(scaled);
    const i1 = Math.min(n - 1, i0 + 1);
    const frac = scaled - i0;

    const a = hexToRgb(stops[i0]);
    const b = hexToRgb(stops[i1]);
    return rgbToHex({
        r: a.r + (b.r - a.r) * frac,
        g: a.g + (b.g - a.g) * frac,
        b: a.b + (b.b - a.b) * frac,
    });
}

function formatTwoDecimals(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(2);
}

function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getPlotMetrics(container) {
    const rect = container?.getBoundingClientRect?.();
    if (!rect) return null;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const grid = { left: 72, right: 32, top: 24, bottom: 50 };
    const plotLeft = grid.left;
    const plotRight = Math.max(plotLeft + 1, width - grid.right);
    const plotTop = grid.top;
    const plotBottom = Math.max(plotTop + 1, height - grid.bottom);
    return {
        width,
        height,
        grid,
        plotLeft,
        plotRight,
        plotTop,
        plotBottom,
        plotWidth: Math.max(1, plotRight - plotLeft),
        plotHeight: Math.max(1, plotBottom - plotTop),
    };
}

function buildDensityTooltipCache(series, controls, container) {
    const metrics = getPlotMetrics(container);
    if (!metrics) return null;

    const xSpan = state.view.xMax - state.view.xMin;
    const ySpan = state.view.yMax - state.view.yMin;
    if (!(xSpan > 0) || !(ySpan > 0)) return null;

    const binSize = Math.max(1, Number(controls.binSize) || 10);
    const key = [
        state.view.xMin, state.view.xMax, state.view.yMin, state.view.yMax,
        metrics.plotWidth, metrics.plotHeight,
        binSize,
        controls.colorColumn || '',
        controls.renderMode || '',
    ].join('|');

    // Reuse cache if nothing relevant changed.
    if (state.densityTooltipCache?.key === key) return state.densityTooltipCache;

    const binsBySeriesIndex = new Map();
    const metaBySeriesIndex = new Map();

    for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex++) {
        const s = series[seriesIndex];
        if (!s || !Array.isArray(s.data)) continue;
        const map = new Map();

        // Carry per-series color-bin metadata for tooltip.
        if (Object.prototype.hasOwnProperty.call(s, '__edatimeColorCenter')) {
            metaBySeriesIndex.set(seriesIndex, {
                colorCenter: s.__edatimeColorCenter,
                colorLo: s.__edatimeColorLo,
                colorHi: s.__edatimeColorHi,
            });
        }

        for (let i = 0; i < s.data.length; i++) {
            const p = s.data[i];
            const x = Number(p?.[0]);
            const y = Number(p?.[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < state.view.xMin || x > state.view.xMax) continue;
            if (y < state.view.yMin || y > state.view.yMax) continue;

            const nx = (x - state.view.xMin) / xSpan;
            const ny = (y - state.view.yMin) / ySpan;
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;

            const bx = Math.floor((nx * metrics.plotWidth) / binSize);
            const by = Math.floor(((1 - ny) * metrics.plotHeight) / binSize);
            const k = `${bx},${by}`;
            map.set(k, (map.get(k) || 0) + 1);
        }

        binsBySeriesIndex.set(seriesIndex, map);
    }

    state.densityTooltipCache = { key, binSize, metrics, binsBySeriesIndex, metaBySeriesIndex };
    return state.densityTooltipCache;
}

function densityTooltipFormatterFactory(controls, container) {
    return (params) => {
        // Density plots behave best in item mode, but handle axis signature too.
        const p = Array.isArray(params) ? params[0] : params;
        if (!p) return '';

        const cache = state.densityTooltipCache
            || buildDensityTooltipCache(state.lastOptionSeries || [], controls, container);
        const x = Number(p?.value?.[0]);
        const y = Number(p?.value?.[1]);
        const seriesIndex = Number(p?.seriesIndex);

        let density = null;
        const bins = cache?.binsBySeriesIndex?.get(seriesIndex);
        const m = cache?.metrics;
        const xSpan = state.view.xMax - state.view.xMin;
        const ySpan = state.view.yMax - state.view.yMin;
        const binSize = cache?.binSize;

        if (bins && m && Number.isFinite(x) && Number.isFinite(y) && (xSpan > 0) && (ySpan > 0) && Number.isFinite(binSize) && binSize > 0) {
            const nx = (x - state.view.xMin) / xSpan;
            const ny = (y - state.view.yMin) / ySpan;
            const bx = Math.floor((nx * m.plotWidth) / binSize);
            const by = Math.floor(((1 - ny) * m.plotHeight) / binSize);
            const k = `${bx},${by}`;
            density = bins.get(k) ?? null;
        }

        const parts = [];
        const xSpanForLabel = Math.max(1, state.view.xMax - state.view.xMin);
        const ySpanForLabel = Math.max(1, state.view.yMax - state.view.yMin);
        parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.x || 'X')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpanForLabel))}</span></div>`);
        parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.y || 'Y')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpanForLabel))}</span></div>`);
        const meta = cache?.metaBySeriesIndex?.get(seriesIndex);
        if (controls.colorColumn && meta && Number.isFinite(meta.colorCenter)) {
            parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.colorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatTwoDecimals(meta.colorCenter))}</span></div>`);
        }

        const densityText = (density == null)
            ? '—'
            : fmt.format(Number(density));
        parts.push(`<div><span style="opacity:0.85;">Density:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(densityText)}</span></div>`);

        return parts.join('');
    };
}

function scatterTooltipFormatterFactory(controls) {
    return (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p) return '';

        const x = Number(p?.value?.[0]);
        const y = Number(p?.value?.[1]);
        const xSpan = Math.max(1, state.view.xMax - state.view.xMin);
        const ySpan = Math.max(1, state.view.yMax - state.view.yMin);

        const parts = [
            `<div><span style="opacity:0.85;">${escapeHtml(controls.x || 'X')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpan))}</span></div>`,
            `<div><span style="opacity:0.85;">${escapeHtml(controls.y || 'Y')}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpan))}</span></div>`,
        ];

        if (controls.colorColumn && Array.isArray(state.colorValues)) {
            const colorValue = Number(state.colorValues[Number(p?.dataIndex)]);
            if (Number.isFinite(colorValue)) {
                parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.colorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatAxisNumber(colorValue))}</span></div>`);
            }
        }

        return parts.join('');
    };
}

function setColorbarVisible(visible) {
    const wrap = getEl('scatter-colorbar-wrap');
    if (!wrap) return;
    wrap.hidden = !visible;
}

function updateColorbarUI() {
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    if (!isDensity && !ctl.colorColumn) {
        setColorbarVisible(false);
        return;
    }

    const show = isDensity || (
        !!ctl.colorColumn
        && Number.isFinite(state.colorMin)
        && Number.isFinite(state.colorMax)
        && state.colorMax > state.colorMin
    );

    setColorbarVisible(show);
    if (!show) return;

    const nameEl = getEl('scatter-colorbar-name');
    const minEl = getEl('scatter-colorbar-min');
    const maxEl = getEl('scatter-colorbar-max');
    const barEl = getEl('scatter-colorbar');

    if (isDensity) {
        if (nameEl) nameEl.textContent = `Density (${ctl.colormap})`;
        if (minEl) minEl.textContent = 'Low';
        if (maxEl) maxEl.textContent = 'High';
    } else {
        if (nameEl) nameEl.textContent = `${ctl.colorColumn} (${ctl.colorScale})`;
        if (minEl) minEl.textContent = formatTwoDecimals(state.colorMin);
        if (maxEl) maxEl.textContent = formatTwoDecimals(state.colorMax);
    }

    if (barEl) {
        const palette = paletteForScale(isDensity ? ctl.colormap : ctl.colorScale);
        barEl.style.background = `linear-gradient(90deg, ${palette.join(',')})`;
    }
}

function setCorrelationOverlayText(pearson, spearman) {
    const el = getEl('scatter-correlation-overlay');
    if (!el) return;
    const p = Number.isFinite(pearson) ? pearson.toFixed(3) : '—';
    const s = Number.isFinite(spearman) ? spearman.toFixed(3) : '—';
    el.innerHTML = `
        <div>Pearson correlation: <strong>${escapeHtml(p)}</strong></div>
        <div>Spearman correlation: <strong>${escapeHtml(s)}</strong></div>
    `;
}

function buildNormalScatterSeries(points, controls) {
    const colorColumn = controls.colorColumn;
    const values = state.colorValues;

    if (!colorColumn || !Array.isArray(values) || values.length !== points.length) {
        return [
            {
                type: 'scatter',
                name: `${controls.x || 'x'} vs ${controls.y || 'y'}`,
                data: points,
                symbolSize: 3,
                color: '#4a9eff',
                sampling: 'none',
            },
        ];
    }

    const min = Number.isFinite(state.colorMin) ? Number(state.colorMin) : null;
    const max = Number.isFinite(state.colorMax) ? Number(state.colorMax) : null;
    if (min === null || max === null || !(max > min)) {
        return [
            {
                type: 'scatter',
                name: `${controls.x || 'x'} vs ${controls.y || 'y'}`,
                data: points,
                symbolSize: 3,
                color: '#4a9eff',
                sampling: 'none',
            },
        ];
    }

    const bins = 64;
    const span = max - min;
    const grouped = Array.from({ length: bins }, () => []);
    for (let idx = 0; idx < points.length; idx++) {
        const v = Number(values[idx]);
        if (!Number.isFinite(v)) continue;
        let b = Math.floor(((v - min) / span) * bins);
        if (b < 0) b = 0;
        if (b >= bins) b = bins - 1;
        grouped[b].push(points[idx]);
    }

    const gradient = paletteForScale(controls.colorScale);
    const series = [];
    for (let b = 0; b < bins; b++) {
        const data = grouped[b];
        if (!data || data.length === 0) continue;
        const t0 = b / bins;
        const t1 = (b + 1) / bins;
        const lo = min + t0 * span;
        const hi = min + t1 * span;
        series.push({
            type: 'scatter',
            name: `${colorColumn}`,
            data,
            symbolSize: 3,
            color: sampleGradient(gradient, (b + 0.5) / bins),
            sampling: 'none',
        });
    }

    return series;
}

function buildDensitySeries(points, controls) {
    return [
        {
            type: 'scatter',
            name: 'density',
            data: points,
            mode: 'density',
            binSize: controls.binSize,
            densityColormap: paletteForScale(controls.colormap),
            densityNormalization: controls.normalization,
            sampling: 'none',
        },
    ];
}

function baseScatterSeries(points, controls) {
    return [
        {
            type: 'scatter',
            name: `${controls.x || 'x'} vs ${controls.y || 'y'}`,
            data: points,
            symbolSize: 3,
            color: '#4a9eff',
            sampling: 'none',
        },
    ];
}

function paddedBounds(minV, maxV) {
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) {
        return { min: 0, max: 1 };
    }

    if (maxV <= minV) {
        const pad = Math.max(1, Math.abs(minV) * 0.02);
        return { min: minV - pad, max: maxV + pad };
    }

    const span = maxV - minV;
    const pad = Math.max(span * 0.02, 1e-9);
    return { min: minV - pad, max: maxV + pad };
}

function computeDomains(points) {
    let xMinRaw = Number.POSITIVE_INFINITY;
    let xMaxRaw = Number.NEGATIVE_INFINITY;
    let yMinRaw = Number.POSITIVE_INFINITY;
    let yMaxRaw = Number.NEGATIVE_INFINITY;

    for (const [x, y] of points) {
        const xn = Number(x);
        const yn = Number(y);
        if (!Number.isFinite(xn) || !Number.isFinite(yn)) continue;
        if (xn < xMinRaw) xMinRaw = xn;
        if (xn > xMaxRaw) xMaxRaw = xn;
        if (yn < yMinRaw) yMinRaw = yn;
        if (yn > yMaxRaw) yMaxRaw = yn;
    }

    const xb = paddedBounds(xMinRaw, xMaxRaw);
    const yb = paddedBounds(yMinRaw, yMaxRaw);

    return {
        xMin: xb.min,
        xMax: xb.max,
        yMin: yb.min,
        yMax: yb.max,
    };
}

function applyScatterStateFromCache(resetView = true) {
    state.points = Array.isArray(state.allPoints) ? state.allPoints.slice() : [];
    state.colorValues = Array.isArray(state.allColorValues) ? state.allColorValues.slice() : null;

    const colorExtent = computeColorExtent(state.colorValues);
    state.colorMin = colorExtent?.min ?? null;
    state.colorMax = colorExtent?.max ?? null;

    const domains = computeDomains(state.points);
    state.full = {
        xMin: domains.xMin,
        xMax: domains.xMax,
        yMin: domains.yMin,
        yMax: domains.yMax,
    };

    if (resetView) {
        state.view = { ...state.full };
        state.zoomHistory = [];
    } else {
        state.view = clampView(state.view);
    }

    setStats({
        totalPoints: fmt.format(Number(state.totalPoints ?? state.points.length)),
    });
}

function buildOption(points, container) {
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const xSpan = Math.max(1, state.view.xMax - state.view.xMin);
    const ySpan = Math.max(1, state.view.yMax - state.view.yMin);
    const xTickFormatter = isTemporalColumn(ctl.x)
        ? (value) => formatTemporalTick(value, xSpan)
        : (value) => formatAxisNumber(value);
    const yTickFormatter = isTemporalColumn(ctl.y)
        ? (value) => formatTemporalTick(value, ySpan)
        : (value) => formatAxisNumber(value);

    const series = isDensity
        ? buildDensitySeries(points, ctl)
        : buildNormalScatterSeries(points, ctl);

    const option = {
        theme: 'dark',
        grid: { left: 72, right: 32, top: 24, bottom: 50 },
        xAxis: {
            type: 'value',
            name: ctl.x || 'x',
            min: state.view.xMin,
            max: state.view.xMax,
            tickFormatter: xTickFormatter,
        },
        yAxis: {
            type: 'value',
            name: ctl.y || 'y',
            min: state.view.yMin,
            max: state.view.yMax,
            tickFormatter: yTickFormatter,
        },
        legend: { show: false },
        series,
    };

    state.lastOptionSeries = series;

    if (isDensity) {
        option.tooltip = {
            show: true,
            trigger: 'item',
            formatter: densityTooltipFormatterFactory(ctl, container),
        };
        // Precompute bins once per render so hover stays cheap.
        buildDensityTooltipCache(series, ctl, container);
    } else {
        state.densityTooltipCache = null;
        option.tooltip = {
            show: true,
            trigger: 'item',
            formatter: scatterTooltipFormatterFactory(ctl),
        };
    }

    return option;
}

function syncModeUI() {
    const ctl = currentControls();
    const isDensity = ctl.renderMode === 'density';
    const densityControls = getEl('scatter-density-controls');
    const colorControls = getEl('scatter-color-controls');

    if (densityControls) densityControls.style.display = isDensity ? '' : 'none';
    if (colorControls) colorControls.style.display = isDensity ? 'none' : '';

    updateColorbarUI();

}

function clampView(view) {
    const f = state.full;
    let xMin = Math.max(f.xMin, Math.min(f.xMax, Number(view.xMin)));
    let xMax = Math.max(f.xMin, Math.min(f.xMax, Number(view.xMax)));
    let yMin = Math.max(f.yMin, Math.min(f.yMax, Number(view.yMin)));
    let yMax = Math.max(f.yMin, Math.min(f.yMax, Number(view.yMax)));

    if (!(xMax > xMin)) {
        const span = Math.max(1e-9, f.xMax - f.xMin);
        xMin = f.xMin;
        xMax = f.xMin + span;
    }
    if (!(yMax > yMin)) {
        const span = Math.max(1e-9, f.yMax - f.yMin);
        yMin = f.yMin;
        yMax = f.yMin + span;
    }

    return { xMin, xMax, yMin, yMax };
}

function renderCurrentOption() {
    if (!state.chart) return;
    const container = getEl('scatter-chart');
    state.chart.setOption(buildOption(state.points, container));
    requestAnimationFrame(() => state.chart?.resize?.());
    updateColorbarUI();
    updateBinnedReadout();
}

function applyView(nextView, pushHistory = false) {
    const current = { ...state.view };
    const next = clampView(nextView);

    if (pushHistory) {
        state.zoomHistory = [...state.zoomHistory, current].slice(-30);
    }

    state.view = next;
    renderCurrentOption();
}

function resetView(clearHistory = true) {
    if (clearHistory) state.zoomHistory = [];
    state.view = { ...state.full };
    renderCurrentOption();
}

function renderSelectionBox() {
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
}

function hideSelectionBox() {
    if (!state.selectionBox) return;
    state.selectionBox.style.display = 'none';
}

function initSelectionZoom(container) {
    if (!container || state.selectionBox) return;

    if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }

    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.left = '0';
    box.style.top = '0';
    box.style.width = '0';
    box.style.height = '0';
    box.style.border = '1px solid rgba(0, 212, 255, 0.9)';
    box.style.background = 'rgba(0, 212, 255, 0.15)';
    box.style.pointerEvents = 'none';
    box.style.display = 'none';
    box.style.zIndex = '8';
    container.appendChild(box);
    state.selectionBox = box;

    container.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const rect = container.getBoundingClientRect();
        const startX = event.clientX - rect.left;
        const startY = event.clientY - rect.top;

        state.drag = {
            pointerId: event.pointerId,
            startX,
            endX: startX,
            startY,
            endY: startY,
        };

        try {
            container.setPointerCapture(event.pointerId);
        } catch (_) {}
        renderSelectionBox();
    });

    container.addEventListener('pointermove', (event) => {
        if (!state.drag || event.pointerId !== state.drag.pointerId) return;
        const rect = container.getBoundingClientRect();
        state.drag.endX = event.clientX - rect.left;
        state.drag.endY = event.clientY - rect.top;
        renderSelectionBox();
    });

    const finishDrag = (event) => {
        if (!state.drag || event.pointerId !== state.drag.pointerId) return;

        const rect = container.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);

        const left = Math.max(0, Math.min(state.drag.startX, state.drag.endX));
        const right = Math.min(width, Math.max(state.drag.startX, state.drag.endX));
        const top = Math.max(0, Math.min(state.drag.startY, state.drag.endY));
        const bottom = Math.min(height, Math.max(state.drag.startY, state.drag.endY));

        state.drag = null;
        hideSelectionBox();

        if ((right - left) < 8 || (bottom - top) < 8) {
            try {
                container.releasePointerCapture(event.pointerId);
            } catch (_) {}
            return;
        }

        const cur = state.view;
        const xSpan = cur.xMax - cur.xMin;
        const ySpan = cur.yMax - cur.yMin;

        const xMin = cur.xMin + (left / width) * xSpan;
        const xMax = cur.xMin + (right / width) * xSpan;
        const yMax = cur.yMax - (top / height) * ySpan;
        const yMin = cur.yMax - (bottom / height) * ySpan;

        applyView({ xMin, xMax, yMin, yMax }, true);

        try {
            container.releasePointerCapture(event.pointerId);
        } catch (_) {}
    };

    container.addEventListener('pointerup', finishDrag);
    container.addEventListener('pointercancel', finishDrag);

    container.addEventListener('dblclick', (event) => {
        if (event.shiftKey) return;
        if (state.zoomHistory.length > 0) {
            const prev = state.zoomHistory.pop();
            applyView(prev, false);
            return;
        }
        resetView(false);
    });
}

function updateCorrelationStats() {
    const ySelect = getEl('scatter-y-col');
    const corr = state.correlationsByColumn.get(ySelect?.value || '');

    const pearson = Number.isFinite(corr?.pearson) ? corr.pearson.toFixed(3) : '—';
    const spearman = Number.isFinite(corr?.spearman) ? corr.spearman.toFixed(3) : '—';

    setStats({ pearson, spearman });
    setCorrelationOverlayText(corr?.pearson, corr?.spearman);
}

function updateBinnedReadout() {
    if (!state.chart || state.points.length === 0) {
        setStats({ visiblePoints: '0' });
        return;
    }

    const visibleXMin = state.view.xMin;
    const visibleXMax = state.view.xMax;

    const i0 = lowerBoundByX(state.points, visibleXMin);
    const i1 = upperBoundByX(state.points, visibleXMax);
    const visibleCount = Math.max(0, i1 - i0);

    const text = fmt.format(visibleCount);
    if (text !== state.lastBinnedText) {
        state.lastBinnedText = text;
        setStats({ visiblePoints: text });
    }
}

function renderSuggestions(suggestions) {
    const box = getEl('scatter-suggestions');
    const ySelect = getEl('scatter-y-col');
    if (!box) return;

    state.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
    box.innerHTML = '';

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'scatter-suggestion-empty';
        empty.textContent = 'No strong correlations above threshold.';
        box.appendChild(empty);
        return;
    }

    for (const item of suggestions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scatter-suggestion-btn';
        if (ySelect?.value === item.column) btn.classList.add('active');
        const r = Number.isFinite(item?.pearson) ? item.pearson.toFixed(2) : '—';
        const rho = Number.isFinite(item?.spearman) ? item.spearman.toFixed(2) : '—';
        btn.textContent = `${item.column}  Pearson ${r}  Spearman ${rho}`;
        btn.addEventListener('click', async () => {
            if (!ySelect) return;
            if (ySelect.value === item.column) return;
            ySelect.value = item.column;
            updateCorrelationStats();
            renderSuggestions(state.lastSuggestions);
            try {
                await renderScatter();
            } catch (err) {
                console.error(err);
                showError(String(err?.message ?? err));
            }
        });
        box.appendChild(btn);
    }
}

function ensureOptions(selectEl, values, preferredValue) {
    if (!selectEl) return null;

    const current = preferredValue || selectEl.value;
    selectEl.innerHTML = '';

    for (const v of values) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    }

    if (values.includes(current)) {
        selectEl.value = current;
    } else if (values.length > 0) {
        selectEl.value = values[0];
    }

    return selectEl.value;
}

async function refreshCorrelationsAndSuggestions() {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    const colorSelect = getEl('scatter-color-column');
    if (!xSelect || !ySelect) return;

    const response = await fetchScatterCorrelations(xSelect.value || undefined, 0.7);

    const numeric = Array.isArray(response.numeric_columns) ? response.numeric_columns : [];
    if (numeric.length < 2) {
        throw new Error('Need at least two numeric columns for scatter plotting.');
    }

    ensureOptions(xSelect, numeric, xSelect.value || response.base_column || numeric[0]);

    const yCandidates = numeric.filter((c) => c !== xSelect.value);
    const selectedY = ensureOptions(ySelect, yCandidates, ySelect.value);

    if (colorSelect) {
        const colorOptions = [''].concat(numeric);
        const preferredColor = state.colorColumn || colorSelect.value;
        colorSelect.innerHTML = '';
        for (const col of colorOptions) {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col ? col : 'None';
            colorSelect.appendChild(opt);
        }
        if (colorOptions.includes(preferredColor)) {
            colorSelect.value = preferredColor;
        } else {
            colorSelect.value = '';
        }
    }

    state.correlationsByColumn = new Map();
    for (const row of response.correlations || []) {
        state.correlationsByColumn.set(row.column, row);
    }

    if (!selectedY && yCandidates.length > 0) {
        ySelect.value = yCandidates[0];
    }

    renderSuggestions(response.suggestions || []);
    updateCorrelationStats();
    updateColorbarUI();
}

async function renderScatter() {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    let container = getEl('scatter-chart');

    if (!container || !xSelect || !ySelect || !xSelect.value || !ySelect.value) return;

    showError('');
    const ctl = currentControls();
    const renderSignature = buildRenderSignature(ctl);
    const colorColumn = ctl.colorColumn || null;
    const response = await fetchScatterPoints(
        xSelect.value,
        ySelect.value,
        1_000_000,
        colorColumn,
        buildScatterQueryContext(),
    );

    const points = Array.isArray(response.points) ? response.points : [];
    points.sort((a, b) => Number(a[0]) - Number(b[0]));

    state.totalPoints = Number(response.total_points ?? points.length);
    state.allPoints = points;
    state.allColorValues = Array.isArray(response.color_values) ? response.color_values : null;
    state.colorColumn = response.color || '';
    applyScatterStateFromCache(true);

    if (state.chart && state.lastRenderSignature !== renderSignature) {
        disposeScatterChart();
        container = resetScatterContainer() || getEl('scatter-chart');
    }

    const nextOption = buildOption(state.points, container);

    if (!state.chart) {
        state.chart = await createChart(container, nextOption);
        state.lastRenderSignature = renderSignature;
        initSelectionZoom(container);

        state.chart.onPerformanceUpdate?.(() => {
            const now = performance.now();
            if (now - state.lastUpdateMs < 100) return;
            state.lastUpdateMs = now;
            updateBinnedReadout();
        });
    } else {
        state.chart.setOption(nextOption);
        state.lastRenderSignature = renderSignature;
        requestAnimationFrame(() => state.chart?.resize?.());
    }

    updateColorbarUI();
    updateBinnedReadout();
    updateCorrelationStats();
    renderSuggestions(state.lastSuggestions);
}

function rerenderScatterFromCache(resetView = true) {
    if (!state.chart || !Array.isArray(state.allPoints) || state.allPoints.length === 0) return;
    applyScatterStateFromCache(resetView);
    renderCurrentOption();
    updateCorrelationStats();
    renderSuggestions(state.lastSuggestions);
}

function buildLinearTicks(min, max, count = 6) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return [];
    const n = Math.max(2, Math.floor(count));
    const step = (max - min) / (n - 1);
    return Array.from({ length: n }, (_, index) => min + step * index);
}

function getScatterExportViewport() {
    const container = getEl('scatter-chart');
    const rect = container?.getBoundingClientRect?.();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.round(rect?.width ?? 1200));
    const cssHeight = Math.max(1, Math.round(rect?.height ?? 720));
    return {
        cssWidth,
        cssHeight,
        width: Math.max(1, Math.round(cssWidth * dpr)),
        height: Math.max(1, Math.round(cssHeight * dpr)),
        dpr,
    };
}

function drawScatterSeriesToCanvas(ctx, plotLeft, plotTop, plotWidth, plotHeight, controls, scale) {
    const xSpan = Math.max(1e-9, state.view.xMax - state.view.xMin);
    const ySpan = Math.max(1e-9, state.view.yMax - state.view.yMin);
    const points = Array.isArray(state.points) ? state.points : [];

    if (controls.renderMode === 'density') {
        const binSize = Math.max(2, (Number(controls.binSize) || 10) * scale);
        const cols = Math.max(1, Math.ceil(plotWidth / binSize));
        const rows = Math.max(1, Math.ceil(plotHeight / binSize));
        const counts = new Uint32Array(cols * rows);
        let maxCount = 0;

        for (let index = 0; index < points.length; index++) {
            const [x, y] = points[index];
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const nx = (x - state.view.xMin) / xSpan;
            const ny = (y - state.view.yMin) / ySpan;
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
            const col = Math.max(0, Math.min(cols - 1, Math.floor(nx * cols)));
            const row = Math.max(0, Math.min(rows - 1, Math.floor((1 - ny) * rows)));
            const bucket = row * cols + col;
            counts[bucket] += 1;
            if (counts[bucket] > maxCount) maxCount = counts[bucket];
        }

        const palette = paletteForScale(controls.colormap);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const count = counts[row * cols + col];
                if (count <= 0) continue;
                const ratio = controls.normalization === 'log'
                    ? Math.log1p(count) / Math.log1p(Math.max(1, maxCount))
                    : count / Math.max(1, maxCount);
                ctx.globalAlpha = 0.18 + ratio * 0.82;
                ctx.fillStyle = sampleGradient(palette, ratio);
                ctx.fillRect(
                    plotLeft + col * binSize,
                    plotTop + row * binSize,
                    Math.ceil(binSize),
                    Math.ceil(binSize),
                );
            }
        }
        ctx.globalAlpha = 1;
        return;
    }

    const maxPoints = 200_000;
    const stride = Math.max(1, Math.ceil(points.length / maxPoints));
    const palette = paletteForScale(controls.colorScale);
    const radius = Math.max(1.8, 2.6 * scale);

    for (let index = 0; index < points.length; index += stride) {
        const [x, y] = points[index];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = plotLeft + ((x - state.view.xMin) / xSpan) * plotWidth;
        const py = plotTop + (1 - ((y - state.view.yMin) / ySpan)) * plotHeight;

        let fill = '#4a9eff';
        if (controls.colorColumn && Array.isArray(state.colorValues) && Number.isFinite(state.colorMin) && Number.isFinite(state.colorMax)) {
            const value = Number(state.colorValues[index]);
            if (Number.isFinite(value) && state.colorMax > state.colorMin) {
                const ratio = (value - state.colorMin) / (state.colorMax - state.colorMin);
                fill = sampleGradient(palette, ratio);
            }
        }

        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

function renderScatterExportToCanvas(canvas) {
    const controls = currentControls();
    const viewport = getScatterExportViewport();
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const scale = viewport.width / viewport.cssWidth;
    const styles = getComputedStyle(document.body);
    const bg = styles.getPropertyValue('--bg').trim() || '#080a10';
    const surface = styles.getPropertyValue('--surface-2').trim() || '#181c2a';
    const border = styles.getPropertyValue('--border').trim() || '#272d45';
    const borderHi = styles.getPropertyValue('--border-hi').trim() || '#363f62';
    const text = styles.getPropertyValue('--text').trim() || '#c8d0e4';
    const textDim = styles.getPropertyValue('--text-dim').trim() || '#7a86a4';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    const grid = {
        left: 72 * scale,
        right: 32 * scale,
        top: 24 * scale,
        bottom: 50 * scale,
    };
    const plotLeft = grid.left;
    const plotTop = grid.top;
    const plotRight = Math.max(plotLeft + 1, viewport.width - grid.right);
    const plotBottom = Math.max(plotTop + 1, viewport.height - grid.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);

    ctx.save();
    ctx.beginPath();
    ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
    ctx.clip();
    drawScatterSeriesToCanvas(ctx, plotLeft, plotTop, plotWidth, plotHeight, controls, scale);
    ctx.restore();

    ctx.strokeStyle = border;
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    const fontSize = Math.max(10, Math.round(12 * scale));
    const tickLen = 6 * scale;
    const labelPad = 4 * scale;
    ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;

    const yTicks = buildLinearTicks(state.view.yMin, state.view.yMax, 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textDim;
    for (const tick of yTicks) {
        const py = plotBottom - ((tick - state.view.yMin) / Math.max(1e-9, state.view.yMax - state.view.yMin)) * plotHeight;
        ctx.strokeStyle = borderHi;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(plotLeft, py);
        ctx.lineTo(plotRight, py);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = border;
        ctx.beginPath();
        ctx.moveTo(plotLeft - tickLen, py);
        ctx.lineTo(plotLeft, py);
        ctx.stroke();
        ctx.fillText(formatValueForColumn(controls.y, tick, Math.max(1, state.view.yMax - state.view.yMin)), plotLeft - tickLen - labelPad, py);
    }

    const xTicks = buildLinearTicks(state.view.xMin, state.view.xMax, 6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of xTicks) {
        const px = plotLeft + ((tick - state.view.xMin) / Math.max(1e-9, state.view.xMax - state.view.xMin)) * plotWidth;
        ctx.strokeStyle = borderHi;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(px, plotTop);
        ctx.lineTo(px, plotBottom);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = border;
        ctx.beginPath();
        ctx.moveTo(px, plotBottom);
        ctx.lineTo(px, plotBottom + tickLen);
        ctx.stroke();
        ctx.fillText(formatValueForColumn(controls.x, tick, Math.max(1, state.view.xMax - state.view.xMin)), px, plotBottom + tickLen + labelPad);
    }

    ctx.save();
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${Math.max(12, Math.round(14 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText(`${controls.renderMode === 'density' ? 'Density' : 'Scatter'}: ${controls.x || 'x'} vs ${controls.y || 'y'}`, viewport.width / 2, 4 * scale);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = textDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText(controls.x || 'x', viewport.width / 2, viewport.height - fontSize - 4 * scale);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = textDim;
    ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.translate(Math.max(10 * scale, fontSize), (plotTop + plotBottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(controls.y || 'y', 0, 0);
    ctx.restore();

    const corr = state.correlationsByColumn.get(controls.y || '');
    ctx.save();
    ctx.fillStyle = surface;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1 * scale;
    const corrX = viewport.width - 220 * scale;
    const corrY = 10 * scale;
    const corrW = 200 * scale;
    const corrH = 44 * scale;
    ctx.fillRect(corrX, corrY, corrW, corrH);
    ctx.strokeRect(corrX, corrY, corrW, corrH);
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `${Math.max(10, Math.round(11 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText(`Pearson correlation: ${Number.isFinite(corr?.pearson) ? corr.pearson.toFixed(3) : '—'}`, corrX + 10 * scale, corrY + 8 * scale);
    ctx.fillText(`Spearman correlation: ${Number.isFinite(corr?.spearman) ? corr.spearman.toFixed(3) : '—'}`, corrX + 10 * scale, corrY + 24 * scale);
    ctx.restore();

    if (controls.renderMode === 'density' || controls.colorColumn) {
        const palette = paletteForScale(controls.renderMode === 'density' ? controls.colormap : controls.colorScale);
        const legendX = viewport.width - 250 * scale;
        const legendY = 64 * scale;
        const legendW = 220 * scale;
        const legendH = 40 * scale;
        ctx.save();
        ctx.fillStyle = surface;
        ctx.strokeStyle = border;
        ctx.lineWidth = 1 * scale;
        ctx.fillRect(legendX, legendY, legendW, legendH);
        ctx.strokeRect(legendX, legendY, legendW, legendH);
        const gradient = ctx.createLinearGradient(legendX + 10 * scale, 0, legendX + legendW - 10 * scale, 0);
        palette.forEach((color, index) => {
            gradient.addColorStop(index / Math.max(1, palette.length - 1), color);
        });
        ctx.fillStyle = text;
        ctx.font = `${Math.max(10, Math.round(11 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(
            controls.renderMode === 'density' ? `Density (${controls.colormap})` : `${controls.colorColumn} (${controls.colorScale})`,
            legendX + 10 * scale,
            legendY + 6 * scale,
        );
        ctx.fillStyle = gradient;
        ctx.fillRect(legendX + 10 * scale, legendY + 22 * scale, legendW - 20 * scale, 8 * scale);
        ctx.fillStyle = textDim;
        ctx.textBaseline = 'middle';
        ctx.fillText(controls.renderMode === 'density' ? 'Low' : formatTwoDecimals(state.colorMin), legendX + 10 * scale, legendY + 34 * scale);
        ctx.textAlign = 'right';
        ctx.fillText(controls.renderMode === 'density' ? 'High' : formatTwoDecimals(state.colorMax), legendX + legendW - 10 * scale, legendY + 34 * scale);
        ctx.restore();
    }

    return true;
}

function downloadUrl(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (url.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
}

async function exportScatterPNG() {
    const canvas = document.createElement('canvas');
    if (!renderScatterExportToCanvas(canvas)) return;
    downloadUrl(canvas.toDataURL('image/png'), 'edatime_scatter.png');
}

async function exportScatterSVG() {
    const canvas = document.createElement('canvas');
    if (!renderScatterExportToCanvas(canvas)) return;
    const pngData = canvas.toDataURL('image/png');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image href="${pngData}" x="0" y="0" width="${canvas.width}" height="${canvas.height}" /></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadUrl(URL.createObjectURL(blob), 'edatime_scatter.svg');
}

async function exportScatterHTML() {
    const canvas = document.createElement('canvas');
    if (!renderScatterExportToCanvas(canvas)) return;
    const dataUrl = canvas.toDataURL('image/png');
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>EdaTime Scatter Export</title>
    <style>
        body { margin: 0; background: #1a1a1a; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        img { max-width: 100%; height: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
    </style>
</head>
<body>
    <img src="${dataUrl}" alt="EdaTime Scatter Export" />
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadUrl(URL.createObjectURL(blob), 'edatime_scatter.html');
}

function bindControls() {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    const binSizeInput = getEl('scatter-bin-size');
    const binSizeValue = getEl('scatter-bin-size-value');
    const colormapSelect = getEl('scatter-colormap');
    const normalizationSelect = getEl('scatter-normalization');
    const renderModeSelect = getEl('scatter-render-mode');
    const colorColumnSelect = getEl('scatter-color-column');
    const colorScaleSelect = getEl('scatter-color-scale');
    const linkBrushInput = getEl('scatter-link-brush');
    const exportPngBtn = getEl('scatter-export-png-btn');
    const exportSvgBtn = getEl('scatter-export-svg-btn');
    const exportHtmlBtn = getEl('scatter-export-html-btn');

    if (!xSelect || !ySelect || !binSizeInput || !binSizeValue || !colormapSelect || !normalizationSelect || !renderModeSelect) return;

    binSizeValue.textContent = binSizeInput.value;
    syncModeUI();

    const rerender = () => {
        const container = getEl('scatter-chart');
        if (!state.chart) return;
        state.chart.setOption(buildOption(state.points, container));
        updateColorbarUI();
        updateBinnedReadout();
    };

    binSizeInput.addEventListener('input', () => {
        binSizeValue.textContent = binSizeInput.value;
        rerender();
    });

    const applyDensity = () => {
        rerender();
    };

    colormapSelect.addEventListener('change', applyDensity);
    normalizationSelect.addEventListener('change', applyDensity);
    renderModeSelect.addEventListener('change', () => {
        syncModeUI();
        applyDensity();
    });
    colorColumnSelect?.addEventListener('change', async () => {
        await renderScatter();
    });
    colorScaleSelect?.addEventListener('change', () => {
        applyDensity();
        updateColorbarUI();
    });
    linkBrushInput?.addEventListener('change', async () => {
        try {
            await renderScatter();
        } catch (err) {
            console.error(err);
            showError(String(err?.message ?? err));
        }
    });

    exportPngBtn?.addEventListener('click', () => exportScatterPNG());
    exportSvgBtn?.addEventListener('click', () => exportScatterSVG());
    exportHtmlBtn?.addEventListener('click', () => exportScatterHTML());

    ySelect.addEventListener('change', async () => {
        updateCorrelationStats();
        await renderScatter();
    });

    xSelect.addEventListener('change', async () => {
        await refreshCorrelationsAndSuggestions();
        await renderScatter();
    });

    window.addEventListener('resize', () => {
        state.chart?.resize?.();
    });

    window.addEventListener('edatime:chart-range-change', async () => {
        const page = getEl('page-scatter');
        if (page?.hidden || !isLinkedBrushEnabled()) return;
        try {
            await renderScatter();
        } catch (err) {
            console.error(err);
            showError(String(err?.message ?? err));
        }
    });

    window.addEventListener('edatime:column-filters-change', async () => {
        const page = getEl('page-scatter');
        if (page?.hidden) return;
        try {
            await renderScatter();
        } catch (err) {
            console.error(err);
            showError(String(err?.message ?? err));
        }
    });

    window.addEventListener('edatime:adaptive-filters-change', async () => {
        const page = getEl('page-scatter');
        if (page?.hidden) return;
        try {
            await renderScatter();
        } catch (err) {
            console.error(err);
            showError(String(err?.message ?? err));
        }
    });

    window.addEventListener('edatime:page-change', async (ev) => {
        if (ev?.detail?.page !== 'scatter') return;
        if (!state.pageInitialized) {
            refreshCorrelationsAndSuggestions()
                .then(() => renderScatter())
                .then(() => {
                    state.pageInitialized = true;
                })
                .catch((err) => {
                    console.error(err);
                    showError(String(err?.message ?? err));
                });
        } else {
            try {
                if (isLinkedBrushEnabled() || Object.keys(appState.columnRanges || {}).length > 0 || (appState.adaptiveLineFilters || []).length > 0) {
                    await renderScatter();
                } else {
                    rerenderScatterFromCache(true);
                }
            } catch (err) {
                console.error(err);
                showError(String(err?.message ?? err));
            }
        }
        requestAnimationFrame(() => state.chart?.resize?.());
    });
}

export async function initScatterPage(metadata) {
    const page = getEl('page-scatter');
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');

    if (!page || !xSelect || !ySelect) return;

    const numeric = (metadata?.numeric_columns || []).filter((c) => c);
    state.columnTypes = new Map(
        (metadata?.columns || []).map((col) => [
            String(col?.name || '').toLowerCase(),
            String(col?.dtype || ''),
        ])
    );
    if (numeric.length > 0) {
        ensureOptions(xSelect, numeric, xSelect.value || numeric[0]);
        ensureOptions(ySelect, numeric.filter((c) => c !== xSelect.value), ySelect.value || numeric[1] || numeric[0]);
    }

    if (!state.initialized) {
        bindControls();
        state.initialized = true;
    }

    if (state.pageInitialized) return;

    const isVisible = !page.hidden;
    if (!isVisible) {
        return;
    }

    try {
        await refreshCorrelationsAndSuggestions();
        await renderScatter();
        state.pageInitialized = true;
    } catch (err) {
        console.error(err);
        showError(String(err?.message ?? err));
    }
}
