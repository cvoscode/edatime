import { createAccessibilitySummaryTable, type SeriesSummary } from '../../chart/accessibilityTable.js';
import { scatterState } from '../../store/scatterState.js';
import { getSetting } from '../../utils/settings.js';
import { normalizeCorrelationMetric } from '../../utils/correlationModes.js';
import { currentControls } from './state.js';
import { getCleaningPlanHash } from '../../cleaning/store.js';

type ScatterAxis = { name: string; index: 0 | 1 };

// Chart redraws can happen for viewport and style changes while the plotted
// points stay the same. Cache their summaries with that exact data array.
const pointSummaryCache = new WeakMap<object, Map<string, SeriesSummary[]>>();

export function getScatterPointSummaries(
    points: readonly [number, number][],
    axes: readonly ScatterAxis[],
    contextKey = scatterState.lastQueryContextKey,
): SeriesSummary[] {
    let summariesByContext = pointSummaryCache.get(points);
    if (!summariesByContext) {
        summariesByContext = new Map();
        pointSummaryCache.set(points, summariesByContext);
    }
    const key = contextKey + '\u001f' + JSON.stringify(axes.map(({ name, index }) => [name, index]));
    const cached = summariesByContext.get(key);
    if (cached) return cached;

    const summaries = axes.flatMap(({ name, index }) => {
        const values = points
            .map((point) => point[index])
            .filter((value) => typeof value === 'number' && Number.isFinite(value));
        if (values.length === 0) return [];
        const sorted = [...values].sort((left, right) => left - right);
        const total = values.reduce((sum, value) => sum + value, 0);
        let min = values[0]!;
        let max = values[0]!;
        for (const value of values) {
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        const mean = total / values.length;
        const midpoint = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
            ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2
            : sorted[midpoint]!;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
        return [{
            name,
            count: values.length,
            min,
            max,
            mean,
            std: Math.sqrt(variance),
            median,
            missingCount: points.length - values.length,
        }];
    });
    summariesByContext.set(key, summaries);
    return summaries;
}

function correlationContextKey(): string {
    const { x, y } = currentControls();
    return JSON.stringify([x, y, scatterState.lastQueryContextKey, getCleaningPlanHash(), getSetting('defaultCorrelationMetric')]);
}

function renderCorrelationRows(table: HTMLTableElement): void {
    table.querySelector('tbody.chart-summary-table__correlations')?.remove();
    const useDifferences = normalizeCorrelationMetric(getSetting('defaultCorrelationMetric')).endsWith('_diff');
    const suffix = useDifferences ? ' (first differences)' : '';
    // Changing only Y reuses the per-column responses. The pair snapshot can
    // still describe the previous Y until another correlation request finishes.
    const y = currentControls().y;
    const family = useDifferences ? 'diff' : 'raw';
    const pearson = scatterState.correlationsByMode.get(`pearson_${family}`)?.get(y);
    const spearman = scatterState.correlationsByMode.get(`spearman_${family}`)?.get(y);
    const pairStats = scatterState.correlationsByMode.size === 0 ? scatterState.currentPairStats : null;
    const rows: Array<[string, number | null | undefined]> = [
        ['Pearson r' + suffix, pearson?.value ?? (useDifferences ? pairStats?.pearsonDiff : pairStats?.pearsonRaw)],
        ['Spearman ρ' + suffix, spearman?.value ?? (useDifferences ? pairStats?.spearmanDiff : pairStats?.spearmanRaw)],
    ];
    const body = document.createElement('tbody');
    body.className = 'chart-summary-table__correlations';
    const scopeRow = document.createElement('tr');
    const scopeCell = document.createElement('th');
    scopeCell.colSpan = 8;
    scopeCell.scope = 'rowgroup';
    const count = pearson?.count ?? spearman?.count ?? pairStats?.count;
    const countLabel = typeof count === 'number' && Number.isFinite(count)
        ? ` (${count.toLocaleString()} ${useDifferences ? 'paired differences' : 'complete pairs'})`
        : '';
    scopeCell.textContent = `Correlations use all eligible working data${countLabel}; plot sampling and outlier hiding do not change them.`;
    scopeRow.append(scopeCell);
    body.append(scopeRow);
    for (const [name, value] of rows) {
        const row = document.createElement('tr');
        const heading = document.createElement('th');
        heading.scope = 'row';
        heading.textContent = name;
        const cell = document.createElement('td');
        cell.colSpan = 7;
        cell.textContent = typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '—';
        row.append(heading, cell);
        body.append(row);
    }
    table.append(body);
}

export function renderScatterAccessibilitySummary(container: HTMLElement): void {
    container.querySelector('table[data-chart-summary="scatter"]')?.remove();
    const correlationPills = document.querySelector<HTMLElement>('.scatter-stats-bar__correlations');
    const controls = currentControls();
    const axes: Array<ScatterAxis> = [
        { name: controls.x || 'X axis', index: 0 },
        { name: controls.y || 'Y axis', index: 1 },
    ];
    const summaries: SeriesSummary[] = getScatterPointSummaries(scatterState.points, axes);
    if (summaries.length === 0) {
        if (correlationPills) correlationPills.hidden = false;
        return;
    }
    const table = createAccessibilitySummaryTable('Scatter chart', summaries, { visible: true });
    table.dataset.chartSummary = 'scatter';
    table.dataset.correlationContext = correlationContextKey();
    const returned = scatterState.allPoints.length;
    const eligible = Math.max(returned, Number(scatterState.totalPoints) || 0);
    const notReturned = Math.max(0, eligible - returned);
    const hidden = Math.max(0, returned - scatterState.points.length);
    const sampleDescription = scatterState.points.length.toLocaleString()
        + ' plotted of ' + returned.toLocaleString() + ' returned complete pairs';
    const populationDescription = notReturned > 0
        ? notReturned.toLocaleString() + ' additional eligible pairs were not returned in the sample'
        : eligible.toLocaleString() + ' eligible complete pairs';
    const filteredDescription = hidden > 0
        ? hidden.toLocaleString() + ' returned pairs are hidden by outlier filtering'
        : '';
    table.querySelector('caption')!.textContent = [
        'Axis statistics use ' + sampleDescription + '; ' + populationDescription + '.',
        filteredDescription,
        'Incomplete source pairs are excluded upstream. Missing % counts invalid coordinates only among plotted pairs.',
    ].filter(Boolean).join(' ');
    renderCorrelationRows(table);
    container.appendChild(table);
    if (correlationPills) correlationPills.hidden = true;
}

/** Update visible coefficients without rebuilding the chart or its point summaries. */
export function refreshScatterAccessibilitySummaryCorrelations(): void {
    const table = document.querySelector<HTMLTableElement>('table[data-chart-summary="scatter"]');
    if (table?.dataset.correlationContext === correlationContextKey()) renderCorrelationRows(table);
}
