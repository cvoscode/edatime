/**
 * scattermatrix.js — Independent scatter matrix rendering module.
 *
 * Provides standalone scatter matrix rendering without requiring the full scatter page.
 */

import { appState } from './state.js?v=2';
import { fetchScatterPoints } from './dataClient.js?v=14';

const MATRIX_POINT_LIMIT = 8_000;
const MATRIX_MAX_COLUMNS = 4;
const HISTOGRAM_BINS = 24;

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

export const state = {
    allPoints: [],
    allColorValues: null,
    view: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    full: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    colorColumn: '',
    colorValues: null,
    colorMin: null,
    colorMax: null,
    correlationsByColumn: new Map(),
    matrixCache: new Map(),
    overviewRequestId: 0,
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

function setPanelStatus(id, message) {
    const el = getEl(id);
    if (!el) return;
    el.textContent = String(message || '');
}

function formatAxisNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function isTemporalColumn(name) {
    const dtype = state.columnTypes?.get(String(name || '').toLowerCase()) || '';
    return /date|time/i.test(dtype);
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

function drawMiniScatterCanvas(canvas, points, color = '#4a9eff') {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
        const x = Number(point?.[0]);
        const y = Number(point?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        ctx.fillStyle = 'rgba(122, 134, 164, 0.7)';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No points', width / 2, height / 2);
        return;
    }

    const pad = 8;
    const xSpan = Math.max(1e-9, maxX - minX);
    const ySpan = Math.max(1e-9, maxY - minY);
    const stride = Math.max(1, Math.ceil(points.length / 1200));

    ctx.strokeStyle = 'rgba(54, 63, 98, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.45;
    for (let index = 0; index < points.length; index += stride) {
        const x = Number(points[index]?.[0]);
        const y = Number(points[index]?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = pad + ((x - minX) / xSpan) * (width - pad * 2);
        const py = height - pad - ((y - minY) / ySpan) * (height - pad * 2);
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawMiniHistogramCanvas(canvas, histogram, color = '#00d4ff') {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const counts = Array.isArray(histogram?.counts) ? histogram.counts : [];
    if (counts.length === 0) {
        ctx.fillStyle = 'rgba(122, 134, 164, 0.7)';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No histogram', width / 2, height / 2);
        return;
    }

    const maxCount = counts.reduce((best, value) => Math.max(best, Number(value) || 0), 0);
    const barWidth = width / counts.length;
    ctx.strokeStyle = 'rgba(54, 63, 98, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    for (let index = 0; index < counts.length; index++) {
        const count = Number(counts[index]) || 0;
        const ratio = maxCount > 0 ? count / maxCount : 0;
        const barHeight = Math.max(2, ratio * (height - 16));
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.25 + ratio * 0.7;
        ctx.fillRect(index * barWidth + 1, height - barHeight - 1, Math.max(1, barWidth - 2), barHeight);
    }
    ctx.globalAlpha = 1;
}

function buildHistogramFromValues(values, binCount = HISTOGRAM_BINS) {
    if (!Array.isArray(values) || values.length === 0) return null;

    const finite = values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    if (finite.length === 0) return null;

    let min = finite[0];
    let max = finite[0];
    for (let index = 1; index < finite.length; index++) {
        const value = finite[index];
        if (value < min) min = value;
        if (value > max) max = value;
    }

    if (!(max > min)) {
        return {
            min,
            max,
            counts: [finite.length],
            edges: [min, max],
        };
    }

    const counts = Array.from({ length: binCount }, () => 0);
    const edges = [];
    const span = max - min;
    for (let edgeIndex = 0; edgeIndex <= binCount; edgeIndex++) {
        edges.push(min + (span * edgeIndex) / binCount);
    }
    for (const value of finite) {
        let bucket = Math.floor(((value - min) / span) * binCount);
        if (bucket < 0) bucket = 0;
        if (bucket >= binCount) bucket = binCount - 1;
        counts[bucket] += 1;
    }

    return { min, max, counts, edges };
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
    const totalEl = getEl('matrix-total-points');
    if (totalEl) {
        totalEl.textContent = `Total points: ${partial?.totalPoints ?? '—'}`;
    }
}

function currentControls() {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    const colorColumnSelect = getEl('scatter-color-column');
    const colorScaleSelect = getEl('scatter-color-scale');

    return {
        x: xSelect?.value,
        y: ySelect?.value,
        colorColumn: colorColumnSelect?.value || '',
        colorScale: colorScaleSelect?.value || 'viridis',
    };
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
        .replaceAll('&', '&')
        .replaceAll('<', '<')
        .replaceAll('>', '>')
        .replaceAll('"', '"')
        .replaceAll("'", '&#39;');
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
        start: start,
        end: end,
        filters,
        lineFilters: [],
    };
}

function buildRenderSignature(controls) {
    return [
        controls.x || '',
        controls.y || '',
        controls.colorColumn || '',
        controls.colorScale || '',
    ].join('|');
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

function computeColorExtentForColumn(values) {
    if (!Array.isArray(values)) return null;
    return computeColorExtent(values);
}

function getProfileHistogram(column) {
    const profile = appState.metadata?.column_profiles?.find((entry) => entry?.name === column);
    const counts = Array.isArray(profile?.histogram?.counts) ? profile.histogram.counts.map((value) => Number(value) || 0) : null;
    const edges = Array.isArray(profile?.histogram?.bin_edges) ? profile.histogram.bin_edges.map((value) => Number(value)) : null;
    if (!counts || !edges || counts.length === 0 || edges.length === 0) return null;
    return {
        min: Number(edges[0]),
        max: Number(edges[edges.length - 1]),
        counts,
        edges,
    };
}

function getCurrentScatterHistogram(column) {
    if (column === '') return null;
    return buildHistogramFromValues(state.allPoints.map((point) => point?.[0]));
}

async function fetchMatrixCellData(x, y, context) {
    const cacheKey = `${x}|${y}|${JSON.stringify(context.filters)}`;
    const cached = state.matrixCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const request = fetchScatterPoints(x, y, MATRIX_POINT_LIMIT, null, context)
        .then((response) => ({
            totalPoints: Number(response?.total_points ?? 0),
            points: Array.isArray(response?.points) ? response.points : [],
        }))
        .catch((error) => {
            state.matrixCache.delete(cacheKey);
            throw error;
        });

    state.matrixCache.set(cacheKey, request);
    return request;
}

async function selectMatrixPair(x, y) {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    if (!xSelect || !ySelect) return;

    xSelect.value = x;
    ySelect.value = y;
    await refreshCorrelationsAndSuggestions();
    updateCorrelationStats();
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

    const xSelectEl = getEl('scatter-x-col');
    const ySelectEl = getEl('scatter-y-col');
    if (xSelectEl && ySelectEl) {
        xSelectEl.value = xSelectEl.value || response.base_column || numeric[0];
        ySelectEl.value = ySelectEl.value || numeric[1] || numeric[0];
    }

    state.correlationsByColumn = new Map();
    for (const row of response.correlations || []) {
        state.correlationsByColumn.set(row.column, row);
    }

    renderSuggestions(response.suggestions || []);
    updateCorrelationStats();
}

function renderSuggestions(suggestions) {
    const box = getEl('scatter-suggestions');
    if (!box) return;
    box.innerHTML = '';
    state.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
}

function renderDistributionCards() {
    const container = getEl('scatter-distributions');
    if (!container) return;

    const controls = currentControls();
    const entries = [controls.x, controls.y, controls.colorColumn].filter(Boolean);
    container.innerHTML = '';

    if (entries.length === 0) {
        container.innerHTML = '<div class="scatter-placeholder">Select scatter axes to inspect their distributions.</div>';
        return;
    }

    setPanelStatus('scatter-distribution-status', 'Histograms follow the filtered scatter payload and current color channel.');

    for (const column of entries) {
        const histogram = getCurrentScatterHistogram(column);
        const card = document.createElement('article');
        card.className = 'scatter-distribution-card';

        const head = document.createElement('div');
        head.className = 'scatter-distribution-head';
        const title = document.createElement('div');
        title.className = 'scatter-distribution-title';
        title.textContent = column;
        head.appendChild(title);

        const chartWrap = document.createElement('div');
        chartWrap.className = 'scatter-distribution-chart-wrap';
        const canvas = document.createElement('canvas');
        canvas.className = 'scatter-distribution-chart';
        canvas.width = 320;
        canvas.height = 120;
        drawMiniHistogramCanvas(canvas, histogram, column === controls.colorColumn ? '#f5a623' : '#00d4ff');
        chartWrap.appendChild(canvas);

        const meta = document.createElement('div');
        meta.className = 'scatter-distribution-meta';
        const minText = histogram ? formatValueForColumn(column, histogram.min, Math.max(1, histogram.max - histogram.min)) : '—';
        const maxText = histogram ? formatValueForColumn(column, histogram.max, Math.max(1, histogram.max - histogram.min)) : '—';
        const count = Array.isArray(histogram?.counts)
            ? histogram.counts.reduce((sum, value) => sum + (Number(value) || 0), 0)
            : 0;
        meta.innerHTML = `<span>Min ${escapeHtml(String(minText))}</span><span>${escapeHtml(fmt.format(count))} samples</span><span>Max ${escapeHtml(String(maxText))}</span>`;

        card.appendChild(head);
        card.appendChild(chartWrap);
        card.appendChild(meta);
        container.appendChild(card);
    }
}

function renderMatrixGrid(columns, datasets) {
    const container = getEl('scatter-matrix');
    if (!container) return;

    container.innerHTML = '';
    if (!Array.isArray(columns) || columns.length < 2) {
        container.innerHTML = '<div class="scatter-placeholder">At least two numeric columns are required for the scatter matrix.</div>';
        return;
    }

    const controls = currentControls();
    const grid = document.createElement('div');
    grid.className = 'scatter-matrix-grid';
    grid.style.gridTemplateColumns = `minmax(92px, 0.7fr) repeat(${columns.length}, minmax(132px, 1fr))`;

    const corner = document.createElement('div');
    corner.className = 'scatter-matrix-corner';
    corner.innerHTML = '<span class="scatter-matrix-corner-axis">Y</span><span class="scatter-matrix-corner-sep">/</span><span class="scatter-matrix-corner-axis">X</span>';
    grid.appendChild(corner);

    for (const column of columns) {
        const header = document.createElement('div');
        header.className = 'scatter-matrix-header';
        header.textContent = column;
        grid.appendChild(header);
    }

    for (const rowColumn of columns) {
        const rowHeader = document.createElement('div');
        rowHeader.className = 'scatter-matrix-row-header';
        rowHeader.textContent = rowColumn;
        grid.appendChild(rowHeader);

        for (const column of columns) {
            if (rowColumn === column) {
                const diagonal = document.createElement('div');
                diagonal.className = 'scatter-matrix-diagonal';
                const canvas = document.createElement('canvas');
                canvas.width = 180;
                canvas.height = 92;
                drawMiniHistogramCanvas(canvas, getCurrentScatterHistogram(column), '#00c896');
                const meta = document.createElement('div');
                meta.className = 'scatter-diagonal-meta';
                meta.textContent = 'Distribution';
                diagonal.appendChild(canvas);
                diagonal.appendChild(meta);
                grid.appendChild(diagonal);
                continue;
            }

            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'scatter-matrix-cell';
            if (controls.x === column && controls.y === rowColumn) {
                cell.classList.add('active');
            }

            const canvas = document.createElement('canvas');
            canvas.width = 180;
            canvas.height = 92;
            const data = datasets.get(`${column}|${rowColumn}`) || { totalPoints: 0, points: [] };
            drawMiniScatterCanvas(canvas, data.points, '#4a9eff');

            const meta = document.createElement('div');
            meta.className = 'scatter-matrix-meta';
            meta.innerHTML = `<span>${escapeHtml(column)} → ${escapeHtml(rowColumn)}</span><span>${escapeHtml(fmt.format(Number(data.totalPoints || data.points.length || 0)))} pts</span>`;

            cell.appendChild(canvas);
            cell.appendChild(meta);
            grid.appendChild(cell);
        }
    }

    container.appendChild(grid);
}

async function renderScatterMatrixView() {
    const columns = buildOverviewColumns();
    if (columns.length < 2) {
        renderMatrixGrid(columns, new Map());
        return;
    }

    setPanelStatus('matrix-status', 'Refreshing matrix for the current filters and linked time window...');
    const context = buildScatterQueryContext();
    const pairs = [];
    for (const rowColumn of columns) {
        for (const column of columns) {
            if (rowColumn === column) continue;
            pairs.push([column, rowColumn]);
        }
    }

    try {
        const resolved = await Promise.all(pairs.map(async ([column, rowColumn]) => {
            const data = await fetchMatrixCellData(column, rowColumn, context);
            return { key: `${column}|${rowColumn}`, data };
        }));

        const datasets = new Map(resolved.map((entry) => [entry.key, entry.data]));
        renderMatrixGrid(columns, datasets);
        setPanelStatus('matrix-status', `Matrix shows ${columns.length} linked columns for the active query context.`);
    } catch (error) {
        console.error(error);
        renderMatrixGrid(columns, new Map());
        setPanelStatus('matrix-status', 'Matrix preview is temporarily unavailable for this query.');
    }
}

function buildOverviewColumns() {
    const controls = currentControls();
    const columns = [];
    const push = (column) => {
        if (!column || columns.includes(column)) return;
        columns.push(column);
    };

    push(controls.x);
    push(controls.y);
    for (const item of state.lastSuggestions || []) {
        push(item?.column);
        if (columns.length >= MATRIX_MAX_COLUMNS) break;
    }
    for (const column of appState.metadata?.numeric_columns || []) {
        push(column);
        if (columns.length >= MATRIX_MAX_COLUMNS) break;
    }
    return columns.slice(0, MATRIX_MAX_COLUMNS);
}

function updateCorrelationStats() {
    const ySelect = getEl('scatter-y-col');
    const corr = state.correlationsByColumn.get(ySelect?.value || '');

    if (getEl('scatter-pearson')) {
        getEl('scatter-pearson').textContent = `Pearson: ${Number.isFinite(corr?.pearson) ? corr.pearson.toFixed(3) : '—'}`;
    }
    if (getEl('scatter-spearman')) {
        getEl('scatter-spearman').textContent = `Spearman: ${Number.isFinite(corr?.spearman) ? corr.spearman.toFixed(3) : '—'}`;
    }
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

function applyScatterStateFromCache(resetView = true) {
    state.allPoints = Array.isArray(state.allPoints) ? state.allPoints.slice() : [];
    state.allColorValues = Array.isArray(state.allColorValues) ? state.allColorValues.slice() : null;

    const colorExtent = computeColorExtentForColumn(state.allColorValues);
    state.colorMin = colorExtent?.min ?? null;
    state.colorMax = colorExtent?.max ?? null;

    const domains = computeDomains(state.allPoints);
    state.full = {
        xMin: domains.xMin,
        xMax: domains.xMax,
        yMin: domains.yMin,
        yMax: domains.yMax,
    };

    if (resetView) {
        state.view = { ...state.full };
    } else {
        state.view = clampView(state.view);
    }
}

function setAllPoints(points, colorValues, colorColumn) {
    state.allPoints = points;
    state.allColorValues = colorValues;
    state.colorColumn = colorColumn || '';
    if (colorValues) {
        const extent = computeColorExtentForColumn(colorValues);
        state.colorMin = extent?.min ?? null;
        state.colorMax = extent?.max ?? null;
    }
    applyScatterStateFromCache(true);
}

export async function initScatterMatrixPage(metadata) {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');

    if (!xSelect || !ySelect) return { success: false, reason: 'Missing scatter X/Y selects' };

    const numeric = (metadata?.numeric_columns || []).filter((c) => c);
    state.columnTypes = new Map(
        (metadata?.columns || []).map((col) => [
            String(col?.name || '').toLowerCase(),
            String(col?.dtype || ''),
        ])
    );
    if (numeric.length > 0) {
        const first = numeric[0];
        const second = numeric.filter((c) => c !== first)[0] || first;
        xSelect.value = first;
        ySelect.value = second;
        await refreshCorrelationsAndSuggestions();
    }

    const scatterChart = getEl('scatter-chart');
    const scatterMatrix = getEl('scatter-matrix');

    if (scatterMatrix) {
        await renderScatterMatrixView();
    }

    window.addEventListener('edatime:chart-range-change', async () => {
        if (scatterMatrix) {
            await renderScatterMatrixView();
        }
    });

    window.addEventListener('edatime:column-filters-change', async () => {
        if (scatterMatrix) {
            await renderScatterMatrixView();
        }
    });

    return { success: true };
}

export async function renderMatrix(columns, datasets) {
    if (scatterMatrix) {
        renderMatrixGrid(columns, datasets);
    }
}

export { renderDistributionCards as renderDistributions };