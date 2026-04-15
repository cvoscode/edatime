/**
 * Distribution cards: fetch, render, stats display.
 */

import { fetchDistributions } from '../dataClient.js';
import { formatTwoDecimals } from '../formatUtils.js';
import {
    getEl,
    fmt,
    escapeHtml,
    setPanelStatus,
    createMiniCanvas,
    drawDistributionCanvas,
    buildHistogramFromValues,
    expandHistogramValues,
    computeDistributionStats,
    buildCategoricalColorGroups,
    formatValueForColumn,
    normalizeCategoryLabel,
    type DistributionSeries,
} from './helpers.js';
import {
    state,
    currentControls,
    getProfileForColumn,
    getProfileHistogram,
    getCurrentScatterValues,
    getDistributionColumns,
    resolveSelectedDistributionColumn,
    describeDistributionColumnKind,
    buildDistributionsContext,
    type DistributionData,
} from './state.js';

/* ── Stats panel ──────────────────────────────────────── */

export function setDistributionStats(stats: Record<string, number | null> | null, column: string): void {
    const values: Record<string, number | null | undefined> = {
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
        if (el) el.textContent = formatTwoDecimals(value as number);
    }

    const statsPanel = getEl('distributions-stats-panel');
    if (statsPanel) {
        statsPanel.dataset.column = column || '';
        statsPanel.setAttribute('aria-label', column ? `Summary statistics for ${column}` : 'Summary statistics');
    }
}

export function updateDistributionStats(): void {
    const targetColumn = resolveSelectedDistributionColumn();

    if (state.distributionData?.columns) {
        const liveEntry = state.distributionData.columns.find((c) => c.name === targetColumn);
        if (liveEntry) {
            const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
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

    const { values } = getDistributionSeriesData(targetColumn);
    const stats = computeDistributionStats(values);
    if (!stats) {
        setDistributionStats(null, targetColumn);
        return;
    }

    const profile = getProfileForColumn(targetColumn);
    setDistributionStats({
        ...stats,
        min: Number.isFinite(profile?.min) ? Number(profile.min) : stats.min,
        max: Number.isFinite(profile?.max) ? Number(profile.max) : stats.max,
    }, targetColumn);
}

/* ── Series data resolution ───────────────────────────── */

export function getDistributionSeriesData(column: string): { profile: any; histogram: any; values: number[]; live?: boolean } {
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
    return { profile, histogram, values };
}

export function buildGroupedDistributionSeries(values: number[], labels?: unknown[] | null): DistributionSeries[] | null {
    if (!Array.isArray(labels) || !Array.isArray(values) || values.length !== labels.length) return null;
    const groups = buildCategoricalColorGroups(labels);
    if (!groups) return null;

    const seriesByLabel = new Map<string, number[]>(groups.categories.map((l) => [l, []]));
    for (let i = 0; i < values.length; i++) {
        const v = Number(values[i]);
        if (!Number.isFinite(v)) continue;
        const label = normalizeCategoryLabel(labels[i]);
        seriesByLabel.get(label)?.push(v);
    }

    const series: DistributionSeries[] = [];
    for (const label of groups.categories) {
        const groupValues = seriesByLabel.get(label) || [];
        if (groupValues.length === 0) continue;
        series.push({ label, color: groups.colorByLabel.get(label) || '#4a9eff', values: groupValues });
    }
    return series.length > 1 ? series : null;
}

/* ── Distribution fetch ───────────────────────────────── */

export async function fetchAndRenderDistributions(): Promise<void> {
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
        state.distributionData = data as unknown as DistributionData;
    } catch (err) {
        if (fetchId !== state.distributionsFetchId) return;
        console.warn('Distribution fetch failed, using profile data:', err);
        state.distributionData = null;
    }

    renderDistributionCards();
}

/* ── Card rendering ───────────────────────────────────── */

function describeDistributionMode(mode: string): string {
    if (mode === 'kde') return 'KDE';
    if (mode === 'boxplot') return 'Box Plot';
    return 'Histogram';
}

function buildDistributionMeta(column: string, values: number[]) {
    if (state.distributionData?.columns) {
        const liveEntry = state.distributionData.columns.find((c) => c.name === column);
        if (liveEntry) {
            const span = Number.isFinite(Number(liveEntry.min)) && Number.isFinite(Number(liveEntry.max))
                ? Math.max(1, Number(liveEntry.max) - Number(liveEntry.min))
                : 1;
            const minText = Number.isFinite(Number(liveEntry.min))
                ? formatValueForColumn(column, Number(liveEntry.min), span, state.columnTypes)
                : '—';
            const maxText = Number.isFinite(Number(liveEntry.max))
                ? formatValueForColumn(column, Number(liveEntry.max), span, state.columnTypes)
                : '—';
            return { minText, maxText, count: Math.max(0, liveEntry.count || 0) };
        }
    }
    const profile = getProfileForColumn(column);
    const histogram = getProfileHistogram(column) || buildHistogramFromValues(values);
    const minValue = Number.isFinite(profile?.min) ? Number(profile.min) : histogram?.min;
    const maxValue = Number.isFinite(profile?.max) ? Number(profile.max) : histogram?.max;
    const span = histogram ? Math.max(1, histogram.max - histogram.min) : Math.max(1, (maxValue ?? 0) - (minValue ?? 0));
    const minText = Number.isFinite(minValue) ? formatValueForColumn(column, minValue!, span, state.columnTypes) : '—';
    const maxText = Number.isFinite(maxValue) ? formatValueForColumn(column, maxValue!, span, state.columnTypes) : '—';
    return { minText, maxText, count: Math.max(0, Number(profile?.non_null_count) || values.length) };
}

export function renderDistributionCards(): void {
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
    setPanelStatus('scatter-distribution-status', `${describeDistributionMode(controls.diagonalMode)} for ${entries.length} numeric or temporal columns. ${dataNote}`);

    const drawJobs: (() => void)[] = [];
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
        card.addEventListener('keydown', (event: KeyboardEvent) => {
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

    for (const draw of drawJobs) draw();
    updateDistributionStats();
}
