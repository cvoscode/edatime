import { createChart } from '../libs/chartgpu/dist/index.js?v=3';
import { fetchDistributions, fetchScatterCorrelations, fetchScatterPoints } from './dataClient.js?v=15';
import { appState, buildAdaptiveLineFiltersForQuery, SERIES_COLORS } from './state.js?v=2';

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
    activeView: 'plot',
    selectedDistributionColumn: '',
    metadata: null,
    totalPoints: 0,
    allPoints: [],
    points: [],
    allColorValues: null,
    allColorLabels: null,
    full: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    view: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    zoomHistory: [],
    drag: null,
    selectionBox: null,
    colorColumn: '',
    colorValues: null,
    colorLabels: null,
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
    matrixCache: new Map(),
    overviewRequestId: 0,
    distributionData: null,
    distributionsFetchId: 0,
};

const MATRIX_POINT_LIMIT = 8_000;
const MATRIX_MAX_COLUMNS = 4;
const HISTOGRAM_BINS = 24;
const KDE_SAMPLES = 64;
const LOW_CARDINALITY_LIMIT = 8;
const DISTRIBUTION_GROUP_COLORS = [
    ...SERIES_COLORS,
    '#5ad8a6', '#ff9d4d', '#7ec8ff', '#f78fb3', '#9bde6d', '#ffd166',
];

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

function setSidebarAnalyticsSelection(viewName) {
    const navPage = viewName === 'matrix'
        ? 'scattermatrix'
        : (viewName === 'distributions' ? 'distributions' : 'scatter');
    for (const button of document.querySelectorAll('.sidebar .nav-item[data-page]')) {
        const page = button.dataset.page;
        const active = page === navPage;
        if (page === 'scatter' || page === 'scattermatrix' || page === 'distributions') {
            button.classList.toggle('active', active);
        }
    }
}

function setScatterView(viewName, options = {}) {
    const nextView = viewName || 'plot';
    const renderView = options.render !== false;
    state.activeView = nextView;
    setSidebarAnalyticsSelection(nextView);
    syncModeUI();

    const panels = document.querySelectorAll('[data-scatter-view-panel]');

    for (const panel of panels) {
        panel.hidden = panel.dataset.scatterViewPanel !== nextView;
    }

    if (!renderView) return Promise.resolve();
    if (nextView === 'matrix') return renderScatterMatrixView();
    if (nextView === 'distributions') {
        return fetchAndRenderDistributions();
    }

    requestAnimationFrame(() => state.chart?.resize?.());
    return Promise.resolve();
}

function normalizeAnalyticsView(viewName) {
    if (viewName === 'matrix' || viewName === 'distributions') return viewName;
    return 'plot';
}

function refreshActiveScatterView() {
    return setScatterView(state.activeView, { render: true });
}

function buildOverviewContextKey(context) {
    return JSON.stringify({
        start: Number.isFinite(context?.start) ? context.start : null,
        end: Number.isFinite(context?.end) ? context.end : null,
        filters: Array.isArray(context?.filters) ? context.filters : [],
        lineFilters: Array.isArray(context?.lineFilters) ? context.lineFilters : [],
    });
}

function downloadBlob(blob, filename) {
    downloadUrl(URL.createObjectURL(blob), filename);
}

function getDevicePixelRatio() {
    return Math.max(1, window.devicePixelRatio || 1);
}

function createMiniCanvas(className, heightPx) {
    const canvas = document.createElement('canvas');
    canvas.className = className;
    canvas.dataset.cssHeight = String(heightPx);
    return canvas;
}

function getCanvasFrame(canvas, fallbackWidth = 180, fallbackHeight = 92) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || fallbackWidth));
    const height = Math.max(1, Math.round(rect.height || Number(canvas.dataset.cssHeight) || fallbackHeight));
    const dpr = getDevicePixelRatio();
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
}

function buildVisibleScatterRows() {
    const controls = currentControls();
    const rows = [];
    const xSpan = Math.max(1, state.view.xMax - state.view.xMin);
    const ySpan = Math.max(1, state.view.yMax - state.view.yMin);

    for (let index = 0; index < state.points.length; index++) {
        const point = state.points[index];
        const x = Number(point?.[0]);
        const y = Number(point?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < state.view.xMin || x > state.view.xMax || y < state.view.yMin || y > state.view.yMax) continue;

        const row = {
            x,
            y,
            x_label: formatValueForColumn(controls.x, x, xSpan),
            y_label: formatValueForColumn(controls.y, y, ySpan),
        };
        if (controls.selectedColorColumn && Array.isArray(state.colorLabels)) {
            row.color = normalizeCategoryLabel(state.colorLabels[index]);
        } else if (controls.selectedColorColumn && Array.isArray(state.colorValues)) {
            const colorValue = Number(state.colorValues[index]);
            row.color = Number.isFinite(colorValue) ? colorValue : null;
        }
        rows.push(row);
    }

    return rows;
}

function exportScatterData(format = 'csv') {
    const controls = currentControls();
    const rows = buildVisibleScatterRows();
    if (rows.length === 0) return false;

    if (format === 'json') {
        downloadBlob(
            new Blob([JSON.stringify({
                x: controls.x,
                y: controls.y,
                color: controls.selectedColorColumn || null,
                rows,
            }, null, 2)], { type: 'application/json;charset=utf-8' }),
            'edatime_scatter_filtered.json',
        );
        return true;
    }

    const header = ['x', 'y', 'x_label', 'y_label'];
    if (controls.selectedColorColumn) header.push('color');
    const lines = [header.join(',')];
    for (const row of rows) {
        const values = [
            row.x,
            row.y,
            `"${String(row.x_label).replaceAll('"', '""')}"`,
            `"${String(row.y_label).replaceAll('"', '""')}"`,
        ];
        if (controls.selectedColorColumn) values.push(row.color == null ? '' : String(row.color));
        lines.push(values.join(','));
    }
    downloadBlob(
        new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
        'edatime_scatter_filtered.csv',
    );
    return true;
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

function getProfileForColumn(column) {
    return state.metadata?.column_profiles?.find((entry) => entry?.name === column) || null;
}

function isDistributionCompatibleColumn(column) {
    if (!column) return false;
    const dtype = state.columnTypes.get(String(column).toLowerCase()) || '';
    // Polars 0.53 serialises types as: f64, f32, i64, i32, u64, u32, etc.
    // Also accept older "Float64", "Int64" style strings and temporal types.
    return /date|time|int|float|decimal|f\d+|u\d+|i\d+/i.test(dtype);
}

function normalizeCategoryLabel(label) {
    if (label == null) return 'Missing';
    const text = String(label).trim();
    return text || 'Missing';
}

function getCategoryColor(index) {
    return DISTRIBUTION_GROUP_COLORS[index % DISTRIBUTION_GROUP_COLORS.length];
}

function buildCategoricalColorGroups(labels = state.colorLabels) {
    if (!Array.isArray(labels) || labels.length === 0) return null;

    const categories = [];
    const labelToIndex = new Map();
    for (const rawLabel of labels) {
        const label = normalizeCategoryLabel(rawLabel);
        if (labelToIndex.has(label)) continue;
        labelToIndex.set(label, categories.length);
        categories.push(label);
        if (categories.length > LOW_CARDINALITY_LIMIT) return null;
    }

    if (categories.length === 0) return null;

    return {
        categories,
        colorByLabel: new Map(categories.map((label, index) => [label, getCategoryColor(index)])),
    };
}

function getDistributionColumns(controls = currentControls()) {
    const columns = [];
    const push = (column) => {
        if (!column || columns.includes(column) || !isDistributionCompatibleColumn(column)) return;
        columns.push(column);
    };

    push(controls.x);
    push(controls.y);
    push(controls.selectedColorColumn);
    for (const entry of state.metadata?.columns || []) {
        push(entry?.name);
    }
    return columns;
}

function getProfileHistogram(column) {
    const profile = getProfileForColumn(column);
    const counts = Array.isArray(profile?.histogram?.counts)
        ? profile.histogram.counts.map((value) => Math.max(0, Number(value) || 0))
        : [];
    const edges = Array.isArray(profile?.histogram?.bin_edges)
        ? profile.histogram.bin_edges.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];
    if (counts.length === 0 || edges.length !== counts.length + 1) return null;
    return {
        min: Number(edges[0]),
        max: Number(edges[edges.length - 1]),
        counts,
        edges,
    };
}

function expandHistogramValues(histogram, maxSamples = 320) {
    const counts = Array.isArray(histogram?.counts) ? histogram.counts : [];
    const edges = Array.isArray(histogram?.edges) ? histogram.edges : [];
    if (counts.length === 0 || edges.length !== counts.length + 1) return [];

    const total = counts.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (total <= 0) return [];

    const targetSamples = Math.max(Math.min(maxSamples, total), Math.min(counts.length * 4, maxSamples));
    const values = [];
    for (let index = 0; index < counts.length; index++) {
        const count = Math.max(0, Number(counts[index]) || 0);
        if (count <= 0) continue;
        const left = Number(edges[index]);
        const right = Number(edges[index + 1]);
        const midpoint = Number.isFinite(left) && Number.isFinite(right)
            ? (left + right) / 2
            : Number.isFinite(left)
                ? left
                : right;
        if (!Number.isFinite(midpoint)) continue;
        const bucketSamples = Math.max(1, Math.round((count / total) * targetSamples));
        for (let sampleIndex = 0; sampleIndex < bucketSamples; sampleIndex++) {
            values.push(midpoint);
        }
    }

    if (values.length <= maxSamples) return values;

    const reduced = [];
    const stride = values.length / maxSamples;
    for (let index = 0; index < maxSamples; index++) {
        reduced.push(values[Math.min(values.length - 1, Math.floor(index * stride))]);
    }
    return reduced;
}

function getDistributionSeriesData(column) {
    // Use live filtered histogram when available
    if (state.distributionData?.columns) {
        const liveEntry = state.distributionData.columns.find((c) => c.name === column);
        if (liveEntry?.histogram) {
            const histogram = {
                edges: liveEntry.histogram.bin_edges,
                counts: liveEntry.histogram.counts,
                min: liveEntry.min,
                max: liveEntry.max,
            };
            const values = expandHistogramValues(histogram);
            return { profile: getProfileForColumn(column), histogram, values, live: true };
        }
    }
    const profile = getProfileForColumn(column);
    const histogram = getProfileHistogram(column);
    const values = histogram ? expandHistogramValues(histogram) : getCurrentScatterValues(column);
    return {
        profile,
        histogram,
        values,
    };
}

function computeDistributionStats(values) {
    if (!Array.isArray(values) || values.length === 0) return null;

    const sorted = values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
    if (sorted.length === 0) return null;

    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const mean = sorted.reduce((sum, value) => sum + value, 0) / count;
    const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
    const std = Math.sqrt(variance);
    const median = quantileSorted(sorted, 0.5);
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    const iqr = Number.isFinite(q1) && Number.isFinite(q3) ? q3 - q1 : null;

    let skewness = null;
    let kurtosis = null;
    if (std > 0) {
        const m3 = sorted.reduce((sum, value) => sum + (value - mean) ** 3, 0) / count;
        const m4 = sorted.reduce((sum, value) => sum + (value - mean) ** 4, 0) / count;
        skewness = m3 / (std ** 3);
        kurtosis = m4 / (std ** 4) - 3;
    }

    return {
        mean,
        std,
        min,
        max,
        median,
        q1,
        q3,
        iqr,
        skewness,
        kurtosis,
    };
}

function resolveSelectedDistributionColumn(entries = getDistributionColumns()) {
    if (entries.includes(state.selectedDistributionColumn)) return state.selectedDistributionColumn;
    state.selectedDistributionColumn = entries[0] || '';
    return state.selectedDistributionColumn;
}

function describeDistributionColumnKind(column, controls = currentControls()) {
    const kinds = [];
    if (column === controls.x) kinds.push('x-axis');
    if (column === controls.y) kinds.push('y-axis');
    if (column === controls.selectedColorColumn) kinds.push('color');
    return kinds.join(' / ') || 'dataset';
}

function getCurrentScatterValues(column) {
    const controls = currentControls();
    if (column === controls.x) {
        return state.points.map((point) => Number(point?.[0])).filter((value) => Number.isFinite(value));
    }
    if (column === controls.y) {
        return state.points.map((point) => Number(point?.[1])).filter((value) => Number.isFinite(value));
    }
    if (column === controls.selectedColorColumn && Array.isArray(state.colorValues)) {
        return state.colorValues.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    }
    return [];
}

function buildGroupedDistributionSeries(values, labels = state.colorLabels) {
    const groups = buildCategoricalColorGroups(labels);
    if (!groups || !Array.isArray(values) || values.length !== labels.length) return null;

    const seriesByLabel = new Map(groups.categories.map((label) => [label, []]));
    for (let index = 0; index < values.length; index++) {
        const value = Number(values[index]);
        if (!Number.isFinite(value)) continue;
        const label = normalizeCategoryLabel(labels[index]);
        const bucket = seriesByLabel.get(label);
        if (bucket) bucket.push(value);
    }

    const series = [];
    for (const label of groups.categories) {
        const groupValues = seriesByLabel.get(label) || [];
        if (groupValues.length === 0) continue;
        series.push({
            label,
            color: groups.colorByLabel.get(label) || '#4a9eff',
            values: groupValues,
        });
    }

    return series.length > 1 ? series : null;
}

function getScatterDistributionData(column) {
    const values = getCurrentScatterValues(column);
    const controls = currentControls();
    const groupedSeries = controls.selectedColorColumn && controls.selectedColorColumn !== column
        ? buildGroupedDistributionSeries(values)
        : null;

    return {
        values,
        groupedSeries,
        histogram: buildHistogramFromValues(values),
    };
}

function quantileSorted(sortedValues, ratio) {
    if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
    if (sortedValues.length === 1) return sortedValues[0];
    const position = Math.max(0, Math.min(sortedValues.length - 1, ratio * (sortedValues.length - 1)));
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sortedValues[lower];
    const weight = position - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function formatDistributionStat(value) {
    return Number.isFinite(value) ? formatAxisNumber(value) : '—';
}

function setDistributionStats(stats, column) {
    const values = {
        'stat-mean': stats?.mean,
        'stat-std': stats?.std,
        'stat-min': stats?.min,
        'stat-max': stats?.max,
        'stat-median': stats?.median,
        'stat-q1': stats?.q1,
        'stat-q3': stats?.q3,
        'stat-iqr': stats?.iqr,
        'stat-skewness': stats?.skewness,
        'stat-kurtosis': stats?.kurtosis,
    };

    for (const [id, value] of Object.entries(values)) {
        const el = getEl(id);
        if (el) el.textContent = formatDistributionStat(value);
    }

    const statsPanel = getEl('distributions-stats-panel');
    if (statsPanel) {
        statsPanel.dataset.column = column || '';
        statsPanel.setAttribute('aria-label', column ? `Summary statistics for ${column}` : 'Summary statistics');
    }
}

function updateDistributionStats() {
    const targetColumn = resolveSelectedDistributionColumn();

    // Use precise backend-computed statistics when live filtered data is available
    if (state.distributionData?.columns) {
        const liveEntry = state.distributionData.columns.find((c) => c.name === targetColumn);
        if (liveEntry) {
            const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
            const q1 = toNum(liveEntry.q1);
            const q3 = toNum(liveEntry.q3);
            setDistributionStats({
                mean: toNum(liveEntry.mean),
                std: toNum(liveEntry.std_dev),
                min: toNum(liveEntry.min),
                max: toNum(liveEntry.max),
                median: toNum(liveEntry.median),
                q1,
                q3,
                iqr: q1 !== null && q3 !== null ? q3 - q1 : null,
                skewness: null,
                kurtosis: null,
            }, targetColumn);
            return;
        }
    }

    const { profile, values } = getDistributionSeriesData(targetColumn);
    const stats = computeDistributionStats(values);
    if (!stats) {
        setDistributionStats(null, targetColumn);
        return;
    }

    setDistributionStats({
        ...stats,
        min: Number.isFinite(profile?.min) ? Number(profile.min) : stats.min,
        max: Number.isFinite(profile?.max) ? Number(profile.max) : stats.max,
    }, targetColumn);
}

function drawMiniScatterCanvas(canvas, points, options = {}) {
    const frame = getCanvasFrame(canvas, 180, 92);
    if (!frame) return;
    const { ctx, width, height } = frame;

    const config = typeof options === 'string'
        ? { color: options }
        : (options || {});
    const baseColor = config.color || '#4a9eff';
    const colorValues = Array.isArray(config.colorValues) ? config.colorValues : null;
    const colorLabels = Array.isArray(config.colorLabels) ? config.colorLabels : null;
    const colorScale = config.colorScale || 'viridis';
    const categoryColors = config.categoryColors instanceof Map ? config.categoryColors : null;

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

    const palette = paletteForScale(colorScale);
    const colorExtent = computeColorExtent(colorValues);
    ctx.globalAlpha = 0.45;
    for (let index = 0; index < points.length; index += stride) {
        const x = Number(points[index]?.[0]);
        const y = Number(points[index]?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = pad + ((x - minX) / xSpan) * (width - pad * 2);
        const py = height - pad - ((y - minY) / ySpan) * (height - pad * 2);
        let fill = baseColor;
        if (colorLabels && categoryColors) {
            const label = normalizeCategoryLabel(colorLabels[index]);
            fill = categoryColors.get(label) || baseColor;
        } else if (colorValues && colorExtent && colorExtent.max > colorExtent.min) {
            const value = Number(colorValues[index]);
            if (Number.isFinite(value)) {
                fill = sampleGradient(palette, (value - colorExtent.min) / (colorExtent.max - colorExtent.min));
            }
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function computeValueBounds(seriesList) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const series of seriesList) {
        for (const value of series.values || []) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) continue;
            if (numeric < min) min = numeric;
            if (numeric > max) max = numeric;
        }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
}

function buildHistogramForDomain(values, min, max, binCount = HISTOGRAM_BINS) {
    const finite = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (finite.length === 0 || !Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (!(max > min)) {
        return { min, max, counts: [finite.length], edges: [min, max] };
    }

    const counts = Array.from({ length: binCount }, () => 0);
    const span = max - min;
    const edges = Array.from({ length: binCount + 1 }, (_, index) => min + (span * index) / binCount);
    for (const value of finite) {
        let bucket = Math.floor(((value - min) / span) * binCount);
        if (bucket < 0) bucket = 0;
        if (bucket >= binCount) bucket = binCount - 1;
        counts[bucket] += 1;
    }
    return { min, max, counts, edges };
}

function estimateBandwidth(values) {
    if (!Array.isArray(values) || values.length < 2) return 1;
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
    const std = Math.sqrt(variance);
    const sigma = Math.min(std || 0, ((q3 ?? mean) - (q1 ?? mean)) / 1.34 || std || 1) || 1;
    return Math.max(1e-3, 0.9 * sigma * (sorted.length ** -0.2));
}

function buildKdeCurve(values, min, max, sampleCount = KDE_SAMPLES) {
    const finite = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (finite.length === 0) return [];
    if (!(max > min)) {
        return [{ x: min, y: 1 }, { x: max, y: 1 }];
    }

    const bandwidth = estimateBandwidth(finite);
    const scale = 1 / (finite.length * bandwidth * Math.sqrt(2 * Math.PI));
    const points = [];
    for (let index = 0; index < sampleCount; index++) {
        const x = min + ((max - min) * index) / Math.max(1, sampleCount - 1);
        let sum = 0;
        for (const value of finite) {
            const z = (x - value) / bandwidth;
            sum += Math.exp(-0.5 * z * z);
        }
        points.push({ x, y: sum * scale });
    }
    return points;
}

function computeBoxStats(values) {
    const sorted = values.map((value) => Number(value)).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    return {
        min: sorted[0],
        q1: quantileSorted(sorted, 0.25),
        median: quantileSorted(sorted, 0.5),
        q3: quantileSorted(sorted, 0.75),
        max: sorted[sorted.length - 1],
    };
}

function drawDistributionCanvas(canvas, mode, seriesList) {
    const frame = getCanvasFrame(canvas, 320, 120);
    if (!frame) return;
    const { ctx, width, height } = frame;

    const usableSeries = (seriesList || []).filter((series) => Array.isArray(series?.values) && series.values.length > 0);
    if (usableSeries.length === 0) {
        ctx.fillStyle = 'rgba(122, 134, 164, 0.7)';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No distribution', width / 2, height / 2);
        return;
    }

    ctx.strokeStyle = 'rgba(54, 63, 98, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    const padX = 10;
    const padY = 10;
    const bounds = computeValueBounds(usableSeries);
    if (!bounds) return;
    const min = bounds.min;
    const max = bounds.max;
    const span = Math.max(1e-9, max - min);
    const projectX = (value) => padX + ((value - min) / span) * (width - padX * 2);

    if (mode === 'boxplot') {
        const rowHeight = (height - padY * 2) / usableSeries.length;
        usableSeries.forEach((series, index) => {
            const stats = computeBoxStats(series.values);
            if (!stats) return;
            const centerY = padY + rowHeight * index + rowHeight / 2;
            const boxHeight = Math.max(8, rowHeight * 0.36);
            ctx.strokeStyle = series.color;
            ctx.fillStyle = `${series.color}33`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(projectX(stats.min), centerY);
            ctx.lineTo(projectX(stats.q1), centerY);
            ctx.moveTo(projectX(stats.q3), centerY);
            ctx.lineTo(projectX(stats.max), centerY);
            ctx.stroke();
            ctx.fillRect(projectX(stats.q1), centerY - boxHeight / 2, Math.max(2, projectX(stats.q3) - projectX(stats.q1)), boxHeight);
            ctx.strokeRect(projectX(stats.q1), centerY - boxHeight / 2, Math.max(2, projectX(stats.q3) - projectX(stats.q1)), boxHeight);
            ctx.beginPath();
            ctx.moveTo(projectX(stats.median), centerY - boxHeight / 2);
            ctx.lineTo(projectX(stats.median), centerY + boxHeight / 2);
            ctx.stroke();
        });
        return;
    }

    if (mode === 'kde') {
        const curves = usableSeries.map((series) => ({
            ...series,
            curve: buildKdeCurve(series.values, min, max),
        }));
        const maxDensity = curves.reduce((best, series) => {
            const peak = series.curve.reduce((localBest, point) => Math.max(localBest, point.y), 0);
            return Math.max(best, peak);
        }, 0);
        const projectY = (value) => height - padY - ((value / Math.max(1e-9, maxDensity)) * (height - padY * 2));

        for (const series of curves) {
            if (series.curve.length === 0) continue;
            ctx.beginPath();
            ctx.moveTo(projectX(series.curve[0].x), height - padY);
            for (const point of series.curve) {
                ctx.lineTo(projectX(point.x), projectY(point.y));
            }
            ctx.lineTo(projectX(series.curve[series.curve.length - 1].x), height - padY);
            ctx.closePath();
            ctx.fillStyle = `${series.color}22`;
            ctx.fill();

            ctx.beginPath();
            series.curve.forEach((point, index) => {
                const x = projectX(point.x);
                const y = projectY(point.y);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = series.color;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        return;
    }

    const histograms = usableSeries.map((series) => ({
        ...series,
        histogram: buildHistogramForDomain(series.values, min, max),
    }));
    const maxCount = histograms.reduce((best, series) => {
        const localMax = series.histogram?.counts?.reduce((acc, value) => Math.max(acc, Number(value) || 0), 0) || 0;
        return Math.max(best, localMax);
    }, 0);
    const binCount = histograms[0]?.histogram?.counts?.length || HISTOGRAM_BINS;
    const barWidth = (width - padX * 2) / Math.max(1, binCount);

    histograms.forEach((series, seriesIndex) => {
        const counts = series.histogram?.counts || [];
        counts.forEach((count, index) => {
            const ratio = maxCount > 0 ? (Number(count) || 0) / maxCount : 0;
            const barHeight = Math.max(2, ratio * (height - padY * 2));
            ctx.fillStyle = series.color;
            ctx.globalAlpha = usableSeries.length > 1 ? 0.18 + seriesIndex * 0.05 : 0.35 + ratio * 0.45;
            ctx.fillRect(padX + index * barWidth + 1, height - padY - barHeight, Math.max(1, barWidth - 2), barHeight);
        });
    });
    ctx.globalAlpha = 1;
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
    const diagonalModeSelect = getEl('scatter-diagonal-mode');
    const colorColumnSelect = getEl('scatter-color-column');
    const colorScaleSelect = getEl('scatter-color-scale');

    const renderMode = renderModeSelect?.value || 'density';
    const selectedColorColumn = colorColumnSelect?.value || '';

    return {
        x: xSelect?.value,
        y: ySelect?.value,
        binSize: Number(binSizeInput?.value ?? 10),
        colormap: colormapSelect?.value ?? 'viridis',
        normalization: normalizationSelect?.value ?? 'linear',
        renderMode,
        diagonalMode: diagonalModeSelect?.value || 'histogram',
        colorColumn: renderMode === 'density' ? '' : selectedColorColumn,
        selectedColorColumn,
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

function buildDistributionsContext() {
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

    // Always include the time range for distributions (not gated by the link-brush toggle)
    return {
        start: Number.isFinite(start) ? start : undefined,
        end: Number.isFinite(end) ? end : undefined,
        filters,
        lineFilters: buildAdaptiveLineFiltersForQuery(),
    };
}

async function fetchAndRenderDistributions() {
    const controls = currentControls();
    const entries = getDistributionColumns(controls);

    if (entries.length === 0) {
        state.distributionData = null;
        renderDistributionCards();
        return;
    }

    const context = buildDistributionsContext();
    const fetchId = ++state.distributionsFetchId;

    const statusEl = getEl('scatter-distribution-status');
    if (statusEl) statusEl.textContent = 'Loading filtered distributions…';

    try {
        const data = await fetchDistributions(entries, context);
        if (fetchId !== state.distributionsFetchId) return;
        state.distributionData = data;
    } catch (err) {
        if (fetchId !== state.distributionsFetchId) return;
        console.warn('Distribution fetch failed, using profile data:', err);
        state.distributionData = null;
    }

    renderDistributionCards();
}

function buildRenderSignature(controls) {
    return [
        controls.x || '',
        controls.y || '',
        controls.renderMode || '',
        controls.selectedColorColumn || '',
        controls.colorScale || '',
        controls.colormap || '',
        controls.normalization || '',
        controls.diagonalMode || '',
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

        if (controls.selectedColorColumn && Array.isArray(state.colorLabels)) {
            const label = p?.seriesName || null;
            if (label) {
                parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.selectedColorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(String(label))}</span></div>`);
            }
        } else if (controls.selectedColorColumn && Array.isArray(state.colorValues)) {
            const colorValue = Number(state.colorValues[Number(p?.dataIndex)]);
            if (Number.isFinite(colorValue)) {
                parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.selectedColorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatAxisNumber(colorValue))}</span></div>`);
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
    const hasContinuousColor = !!ctl.selectedColorColumn
        && Array.isArray(state.colorValues)
        && !Array.isArray(state.colorLabels)
        && Number.isFinite(state.colorMin)
        && Number.isFinite(state.colorMax)
        && state.colorMax > state.colorMin;
    if (!isDensity && !hasContinuousColor) {
        setColorbarVisible(false);
        return;
    }

    const show = isDensity || hasContinuousColor;

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
        if (nameEl) nameEl.textContent = `${ctl.selectedColorColumn} (${ctl.colorScale})`;
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
    const colorColumn = controls.selectedColorColumn;
    const values = state.colorValues;
    const categoricalGroups = colorColumn ? buildCategoricalColorGroups(state.colorLabels) : null;

    if (categoricalGroups) {
        return categoricalGroups.categories.map((label) => {
            const data = [];
            for (let index = 0; index < points.length; index++) {
                if (normalizeCategoryLabel(state.colorLabels?.[index]) !== label) continue;
                data.push(points[index]);
            }
            return {
                type: 'scatter',
                name: label,
                data,
                symbolSize: 3,
                color: categoricalGroups.colorByLabel.get(label) || '#4a9eff',
                sampling: 'none',
            };
        }).filter((series) => series.data.length > 0);
    }

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
    state.colorLabels = Array.isArray(state.allColorLabels) ? state.allColorLabels.slice() : null;

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
    const view = state.activeView || 'plot';
    const isPlot = view === 'plot';
    const isDist = view === 'distributions';
    const isDensity = isPlot && ctl.renderMode === 'density';
    const toggle = (el, visible) => { if (el) el.style.display = visible ? '' : 'none'; };

    // X/Y column selectors: plot + matrix
    toggle(document.querySelector('label[for="scatter-x-col"]'), !isDist);
    toggle(getEl('scatter-x-col'), !isDist);
    toggle(document.querySelector('label[for="scatter-y-col"]'), !isDist);
    toggle(getEl('scatter-y-col'), !isDist);

    // Render mode selector: plot only
    toggle(getEl('scatter-mode-label'), isPlot);
    toggle(getEl('scatter-render-mode'), isPlot);

    // Link brush toggle: plot + matrix
    toggle(document.querySelector('.scatter-link-toggle'), !isDist);

    // Density controls: plot in density mode only
    const densityControls = getEl('scatter-density-controls');
    toggle(densityControls, isDensity);

    // Color controls: plot + matrix (not distributions)
    const colorControls = getEl('scatter-color-controls');
    toggle(colorControls, !isDist);

    // Color scale: plot in non-density mode only
    const colorScaleSelect = getEl('scatter-color-scale');
    toggle(colorScaleSelect, isPlot && !isDensity);

    // Export group: plot only
    toggle(document.querySelector('.scatter-export-group'), isPlot);

    // Stats bar: plot only
    toggle(document.querySelector('.scatter-stats-bar'), isPlot);

    // Suggestions bar: plot + matrix (not distributions)
    toggle(document.querySelector('.scatter-suggestions-bar'), !isDist);

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
        } catch (_) { }
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
            } catch (_) { }
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
        } catch (_) { }
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
    for (const column of state.metadata?.numeric_columns || []) {
        push(column);
        if (columns.length >= MATRIX_MAX_COLUMNS) break;
    }
    return columns.slice(0, MATRIX_MAX_COLUMNS);
}

async function fetchMatrixCellData(x, y, context, colorColumn) {
    const cacheKey = `${x}|${y}|${colorColumn || ''}|${buildOverviewContextKey(context)}`;
    const cached = state.matrixCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const request = fetchScatterPoints(x, y, MATRIX_POINT_LIMIT, colorColumn || null, context)
        .then((response) => ({
            totalPoints: Number(response?.total_points ?? 0),
            points: Array.isArray(response?.points) ? response.points : [],
            colorValues: Array.isArray(response?.color_values) ? response.color_values : null,
            colorLabels: Array.isArray(response?.color_labels) ? response.color_labels : null,
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
    await refreshCorrelationsAndSuggestions();
    ySelect.value = y;
    updateCorrelationStats();
    await setScatterView('plot', { render: false });
    await renderScatter();
}

function describeDistributionMode(mode) {
    if (mode === 'kde') return 'KDE';
    if (mode === 'boxplot') return 'Box Plot';
    return 'Histogram';
}

function appendDistributionLegend(head, groupedSeries) {
    if (!Array.isArray(groupedSeries) || groupedSeries.length === 0) return;
    const legend = document.createElement('div');
    legend.className = 'scatter-distribution-legend';
    for (const series of groupedSeries) {
        const item = document.createElement('span');
        item.className = 'scatter-distribution-legend-item';
        item.innerHTML = `<span class="scatter-distribution-legend-swatch" style="background:${escapeHtml(series.color)}"></span><span>${escapeHtml(series.label)}</span>`;
        legend.appendChild(item);
    }
    head.appendChild(legend);
}

function buildDistributionMeta(column, values) {
    // Use precise backend counts and bounds when live filtered data is available
    if (state.distributionData?.columns) {
        const liveEntry = state.distributionData.columns.find((c) => c.name === column);
        if (liveEntry) {
            const span = Number.isFinite(Number(liveEntry.min)) && Number.isFinite(Number(liveEntry.max))
                ? Math.max(1, Number(liveEntry.max) - Number(liveEntry.min))
                : 1;
            const minText = Number.isFinite(Number(liveEntry.min))
                ? formatValueForColumn(column, Number(liveEntry.min), span)
                : '—';
            const maxText = Number.isFinite(Number(liveEntry.max))
                ? formatValueForColumn(column, Number(liveEntry.max), span)
                : '—';
            return { minText, maxText, count: Math.max(0, liveEntry.count || 0) };
        }
    }
    const profile = getProfileForColumn(column);
    const histogram = getProfileHistogram(column) || buildHistogramFromValues(values);
    const minValue = Number.isFinite(profile?.min) ? Number(profile.min) : histogram?.min;
    const maxValue = Number.isFinite(profile?.max) ? Number(profile.max) : histogram?.max;
    const span = histogram ? Math.max(1, histogram.max - histogram.min) : Math.max(1, (maxValue ?? 0) - (minValue ?? 0));
    const minText = Number.isFinite(minValue) ? formatValueForColumn(column, minValue, span) : '—';
    const maxText = Number.isFinite(maxValue) ? formatValueForColumn(column, maxValue, span) : '—';
    return {
        minText,
        maxText,
        count: Math.max(0, Number(profile?.non_null_count) || values.length),
    };
}

function renderDistributionCards() {
    const container = getEl('scatter-distributions');
    if (!container) return;

    const controls = currentControls();
    const entries = getDistributionColumns(controls);
    container.innerHTML = '';

    if (entries.length === 0) {
        container.innerHTML = '<div class="scatter-placeholder">No numeric or temporal columns are available for distributions.</div>';
        setDistributionStats(null, '');
        return;
    }

    const selectedColumn = resolveSelectedDistributionColumn(entries);
    const dataNote = state.distributionData ? 'Showing filtered data.' : 'Showing full dataset profiles.';
    const statusText = `${describeDistributionMode(controls.diagonalMode)} for ${entries.length} numeric or temporal columns. ${dataNote}`;
    setPanelStatus('scatter-distribution-status', statusText);

    const drawJobs = [];
    for (const column of entries) {
        const { values } = getDistributionSeriesData(column);
        const card = document.createElement('article');
        card.className = 'scatter-distribution-card';
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-pressed', column === selectedColumn ? 'true' : 'false');
        card.classList.toggle('active', column === selectedColumn);
        card.addEventListener('click', () => {
            if (state.selectedDistributionColumn === column) return;
            state.selectedDistributionColumn = column;
            renderDistributionCards();
        });
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            card.click();
        });

        const head = document.createElement('div');
        head.className = 'scatter-distribution-head';
        const title = document.createElement('div');
        title.className = 'scatter-distribution-title';
        title.textContent = column;
        const kind = document.createElement('div');
        kind.className = 'scatter-distribution-kind';
        kind.textContent = describeDistributionColumnKind(column, controls);
        head.append(title, kind);

        const chartWrap = document.createElement('div');
        chartWrap.className = 'scatter-distribution-chart-wrap';
        const canvas = createMiniCanvas('scatter-distribution-chart', 120);
        canvas.className = 'scatter-distribution-chart';
        chartWrap.appendChild(canvas);
        drawJobs.push(() => {
            drawDistributionCanvas(
                canvas,
                controls.diagonalMode,
                [{ label: column, color: column === selectedColumn ? '#f5a623' : '#00d4ff', values }],
            );
        });

        const metaInfo = buildDistributionMeta(column, values);
        const meta = document.createElement('div');
        meta.className = 'scatter-distribution-meta';
        meta.innerHTML = `<span>Min ${escapeHtml(String(metaInfo.minText))}</span><span>${escapeHtml(fmt.format(metaInfo.count))} samples</span><span>Max ${escapeHtml(String(metaInfo.maxText))}</span>`;

        card.append(head, chartWrap, meta);
        container.appendChild(card);
    }

    for (const draw of drawJobs) {
        draw();
    }

    updateDistributionStats();
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
    const diagonalMode = controls.diagonalMode;
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

    const drawJobs = [];
    for (const rowColumn of columns) {
        const rowHeader = document.createElement('div');
        rowHeader.className = 'scatter-matrix-row-header';
        rowHeader.textContent = rowColumn;
        grid.appendChild(rowHeader);

        for (const column of columns) {
            const data = datasets.get(`${column}|${rowColumn}`) || { totalPoints: 0, points: [], colorValues: null, colorLabels: null };
            if (rowColumn === column) {
                const diagonal = document.createElement('div');
                diagonal.className = 'scatter-matrix-diagonal';
                const canvas = createMiniCanvas('scatter-matrix-diagonal-canvas', 92);
                const values = data.points.map((point) => Number(point?.[0])).filter((value) => Number.isFinite(value));
                const groupedSeries = controls.selectedColorColumn
                    ? buildGroupedDistributionSeries(values, data.colorLabels)
                    : null;
                drawJobs.push(() => {
                    drawDistributionCanvas(
                        canvas,
                        diagonalMode,
                        groupedSeries || [{ label: column, color: '#00c896', values }],
                    );
                });
                const meta = document.createElement('div');
                meta.className = 'scatter-diagonal-meta';
                meta.textContent = groupedSeries
                    ? `${describeDistributionMode(diagonalMode)} grouped by ${controls.selectedColorColumn}`
                    : describeDistributionMode(diagonalMode);
                diagonal.append(canvas, meta);
                grid.appendChild(diagonal);
                continue;
            }

            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'scatter-matrix-cell';
            if (controls.x === column && controls.y === rowColumn) {
                cell.classList.add('active');
            }

            const canvas = createMiniCanvas('scatter-matrix-cell-canvas', 92);
            const categoryGroups = buildCategoricalColorGroups(data.colorLabels);
            drawJobs.push(() => {
                drawMiniScatterCanvas(canvas, data.points, {
                    color: '#4a9eff',
                    colorValues: data.colorValues,
                    colorLabels: categoryGroups ? data.colorLabels : null,
                    colorScale: controls.colorScale,
                    categoryColors: categoryGroups?.colorByLabel,
                });
            });

            const meta = document.createElement('div');
            meta.className = 'scatter-matrix-meta';
            meta.innerHTML = `<span>${escapeHtml(column)} → ${escapeHtml(rowColumn)}</span><span>${escapeHtml(fmt.format(Number(data.totalPoints || data.points.length || 0)))} pts</span>`;

            cell.append(canvas, meta);
            cell.addEventListener('click', async () => {
                try {
                    await selectMatrixPair(column, rowColumn);
                } catch (error) {
                    console.error(error);
                    showError(String(error?.message ?? error));
                }
            });
            grid.appendChild(cell);
        }
    }

    container.appendChild(grid);
    for (const draw of drawJobs) {
        draw();
    }
}

async function renderScatterOverview() {
    const columns = buildOverviewColumns();
    if (columns.length < 2) {
        renderMatrixGrid(columns, new Map());
        return;
    }

    const controls = currentControls();
    setPanelStatus('scatter-matrix-status', 'Refreshing matrix for the current filters and linked time window...');
    const context = buildScatterQueryContext();
    const requestId = ++state.overviewRequestId;
    const pairs = [];
    for (const rowColumn of columns) {
        for (const column of columns) {
            pairs.push([column, rowColumn]);
        }
    }

    try {
        const resolved = await Promise.all(pairs.map(async ([column, rowColumn]) => {
            const data = await fetchMatrixCellData(column, rowColumn, context, controls.selectedColorColumn);
            return { key: `${column}|${rowColumn}`, data };
        }));
        if (requestId !== state.overviewRequestId) return;

        const datasets = new Map(resolved.map((entry) => [entry.key, entry.data]));
        renderMatrixGrid(columns, datasets);
        const groups = buildCategoricalColorGroups(state.colorLabels);
        const groupText = groups && controls.selectedColorColumn
            ? ` Grouped distributions use ${controls.selectedColorColumn}.`
            : '';
        setPanelStatus('scatter-matrix-status', `Matrix shows ${columns.length} linked columns with ${describeDistributionMode(controls.diagonalMode)} diagonals.${groupText}`);
    } catch (error) {
        if (requestId !== state.overviewRequestId) return;
        console.error(error);
        renderMatrixGrid(columns, new Map());
        setPanelStatus('scatter-matrix-status', 'Matrix preview is temporarily unavailable for this query.');
    }
}

async function renderScatterMatrixView() {
    await renderScatterOverview();
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
        const colorOptions = [''].concat((state.metadata?.columns || []).map((column) => String(column?.name || '')).filter(Boolean));
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
    const colorColumn = ctl.selectedColorColumn || null;
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
    state.allColorLabels = Array.isArray(response.color_labels) ? response.color_labels : null;
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
    await refreshActiveScatterView();
}

async function rerenderScatterFromCache(resetView = true) {
    if (Array.isArray(state.allPoints) && state.allPoints.length > 0) {
        applyScatterStateFromCache(resetView);
        if (state.chart) {
            renderCurrentOption();
        }
        updateCorrelationStats();
        renderSuggestions(state.lastSuggestions);
    }
    await refreshActiveScatterView();
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
    const categoricalGroups = buildCategoricalColorGroups(state.colorLabels);

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
        if (controls.selectedColorColumn && categoricalGroups) {
            fill = categoricalGroups.colorByLabel.get(normalizeCategoryLabel(state.colorLabels?.[index])) || fill;
        } else if (controls.selectedColorColumn && Array.isArray(state.colorValues) && Number.isFinite(state.colorMin) && Number.isFinite(state.colorMax)) {
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

    const showContinuousLegend = controls.renderMode === 'density' || (
        controls.selectedColorColumn
        && !buildCategoricalColorGroups(state.colorLabels)
        && Number.isFinite(state.colorMin)
        && Number.isFinite(state.colorMax)
        && state.colorMax > state.colorMin
    );
    if (showContinuousLegend) {
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
            controls.renderMode === 'density' ? `Density (${controls.colormap})` : `${controls.selectedColorColumn} (${controls.colorScale})`,
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
    const diagonalModeSelect = getEl('scatter-diagonal-mode');
    const colorColumnSelect = getEl('scatter-color-column');
    const colorScaleSelect = getEl('scatter-color-scale');
    const linkBrushInput = getEl('scatter-link-brush');
    const exportPngBtn = getEl('scatter-export-png-btn');
    const exportSvgBtn = getEl('scatter-export-svg-btn');
    const exportHtmlBtn = getEl('scatter-export-html-btn');
    const exportCsvBtn = getEl('scatter-export-csv-btn');
    const exportJsonBtn = getEl('scatter-export-json-btn');

    if (!xSelect || !ySelect || !binSizeInput || !binSizeValue || !colormapSelect || !normalizationSelect || !renderModeSelect) return;

    window.__edatime = window.__edatime || {};
    window.__edatime.exportScatterData = exportScatterData;

    binSizeValue.textContent = binSizeInput.value;
    syncModeUI();
    void setScatterView(state.activeView, { render: false });

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
    diagonalModeSelect?.addEventListener('change', () => {
        void refreshActiveScatterView();
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
    exportCsvBtn?.addEventListener('click', () => exportScatterData('csv'));
    exportJsonBtn?.addEventListener('click', () => exportScatterData('json'));

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
        if (page?.hidden) return;
        try {
            if (state.activeView === 'distributions') {
                await fetchAndRenderDistributions();
            } else if (isLinkedBrushEnabled()) {
                await renderScatter();
            }
        } catch (err) {
            console.error(err);
            showError(String(err?.message ?? err));
        }
    });

    window.addEventListener('edatime:column-filters-change', async () => {
        const page = getEl('page-scatter');
        if (page?.hidden) return;
        try {
            if (state.activeView === 'distributions') {
                await fetchAndRenderDistributions();
            } else {
                await renderScatter();
            }
        } catch (err) {
            console.error(err);
            showError(String(err?.message ?? err));
        }
    });

    window.addEventListener('edatime:adaptive-filters-change', async () => {
        const page = getEl('page-scatter');
        if (page?.hidden) return;
        try {
            if (state.activeView === 'distributions') {
                await fetchAndRenderDistributions();
            } else {
                await renderScatter();
            }
        } catch (err) {
            console.error(err);
            showError(String(err?.message ?? err));
        }
    });

    window.addEventListener('edatime:page-change', async (ev) => {
        if (ev?.detail?.page !== 'scatter') return;
        state.activeView = normalizeAnalyticsView(ev?.detail?.analyticsView);
        await setScatterView(state.activeView, { render: false });
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
                    await rerenderScatterFromCache(true);
                }
            } catch (err) {
                console.error(err);
                showError(String(err?.message ?? err));
            }
        }
        void refreshActiveScatterView();
    });
}

export async function initScatterPage(metadata) {
    const page = getEl('page-scatter');
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');

    if (!page || !xSelect || !ySelect) return;

    const numeric = (metadata?.numeric_columns || []).filter((c) => c);
    state.metadata = metadata || null;
    state.selectedDistributionColumn = '';
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
