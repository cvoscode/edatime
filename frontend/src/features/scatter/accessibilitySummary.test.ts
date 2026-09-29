import { beforeEach, describe, expect, it } from 'vitest';
import { scatterState } from '../../store/scatterState.js';
import { updateSetting } from '../../utils/settings.js';
import {
    getScatterPointSummaries,
    refreshScatterAccessibilitySummaryCorrelations,
    renderScatterAccessibilitySummary,
} from './accessibilitySummary.js';

describe('Pair plot accessible summaries', () => {
    beforeEach(() => {
        localStorage.clear();
        updateSetting('defaultCorrelationMetric', 'pearson_raw');
        scatterState.correlationsByMode = new Map();
        document.body.innerHTML = '<div id="scatter-chart"><div class="scatter-stats-bar__correlations"></div></div>';
        scatterState.points = [[1, 10], [3, 30]];
        scatterState.allPoints = [[1, 10], [2, 20], [3, 30], [4, 40], [5, 50]];
        scatterState.totalPoints = 10;
        scatterState.lastQueryContextKey = 'dataset-a';
        scatterState.currentPairStats = {
            pearsonRaw: 0.12, spearmanRaw: 0.23,
            pearsonDiff: 0.81, spearmanDiff: 0.92, count: 2,
        };
    });

    it('labels the plotted sample, eligible population, hidden outliers, and missing-value scope', () => {
        const container = document.getElementById('scatter-chart')!;
        renderScatterAccessibilitySummary(container);
        const table = container.querySelector<HTMLTableElement>('table[data-chart-summary="scatter"]')!;

        expect(table.caption?.textContent).toContain('2 plotted of 5 returned complete pairs');
        expect(table.caption?.textContent).toContain('5 additional eligible pairs were not returned');
        expect(table.caption?.textContent).toContain('3 returned pairs are hidden by outlier filtering');
        expect(table.caption?.textContent).toContain('Missing % counts invalid coordinates only among plotted pairs');
        expect(table.textContent).toContain('0.00%');
        expect(table.querySelector('.chart-summary-table__correlations')?.textContent)
            .toContain('Correlations use all eligible working data');
        expect(table.textContent).toContain('0.1200');
        expect(container.querySelector('.chart-summary-actions button')?.textContent).toBe('Copy Pair plot summary');
        const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));
        expect(rows[0]?.tabIndex).toBe(0);
        rows[0]?.focus();
        rows[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(rows[1]);
        expect(container.querySelector('.chart-summary-focus')?.textContent).toContain('Focused Pair plot summary');
    });

    it('keeps the expandable data summary outside the chart and preserves its open state on refresh', () => {
        document.body.innerHTML = `
            <section data-page-name="scatter">
                <div class="scatter-view"><main class="main"><div id="scatter-chart"><canvas></canvas></div></main></div>
                <details id="scatter-summary-details">
                    <summary>Pair plot data summary</summary>
                    <section id="scatter-accessibility-summary"></section>
                </details>
            </section>`;
        const container = document.getElementById('scatter-chart')!;
        const details = document.getElementById('scatter-summary-details') as HTMLDetailsElement;
        renderScatterAccessibilitySummary(container);
        expect(details.open).toBe(false);
        expect(details.querySelector('table')?.textContent).toContain('0.1200');
        expect(container.querySelector('table')).toBeNull();
        expect(container.querySelector('canvas')).not.toBeNull();

        details.open = true;
        scatterState.points = [[5, 50], [6, 60]];
        renderScatterAccessibilitySummary(container);
        expect(details.open).toBe(true);
        expect(details.querySelectorAll('table')).toHaveLength(1);
        expect(details.querySelectorAll('.chart-summary-actions')).toHaveLength(1);
        expect(details.querySelector('table')?.textContent).toContain('5.5');
    });

    it('shows and refreshes the active first-difference family without recreating the table', () => {
        updateSetting('defaultCorrelationMetric', 'pearson_diff');
        const container = document.getElementById('scatter-chart')!;
        renderScatterAccessibilitySummary(container);
        const table = container.querySelector<HTMLTableElement>('table[data-chart-summary="scatter"]')!;

        expect(table.textContent).toContain('Pearson r (first differences)');
        expect(table.textContent).toContain('Spearman ρ (first differences)');
        expect(table.textContent).toContain('0.8100');
        expect(table.textContent).toContain('0.9200');
        expect(table.textContent).not.toContain('0.1200');

        scatterState.currentPairStats = {
            pearsonRaw: -0.12, spearmanRaw: -0.23,
            pearsonDiff: 0.44, spearmanDiff: 0.55, count: 5,
        };
        refreshScatterAccessibilitySummaryCorrelations();

        expect(container.querySelector('table[data-chart-summary="scatter"]')).toBe(table);
        expect(table.textContent).toContain('0.4400');
        expect(table.textContent).toContain('0.5500');
        expect(table.textContent).toContain('5 paired differences');
        expect(table.textContent).not.toContain('0.8100');
    });

    it('uses the selected Y column when cached correlations avoid a new request', () => {
        document.body.insertAdjacentHTML('beforeend', '<select id="scatter-x-col"><option value="x">x</option></select><select id="scatter-y-col"><option value="previous">previous</option><option value="current">current</option></select>');
        scatterState.correlationsByMode = new Map([
            ['pearson_raw', new Map([
                ['previous', { value: 0.12, count: 2 }],
                ['current', { value: 0.67, count: 8 }],
            ])],
            ['spearman_raw', new Map([
                ['previous', { value: 0.23, count: 2 }],
                ['current', { value: 0.78, count: 8 }],
            ])],
        ]);
        const container = document.getElementById('scatter-chart')!;
        renderScatterAccessibilitySummary(container);
        (document.getElementById('scatter-y-col') as HTMLSelectElement).value = 'current';
        renderScatterAccessibilitySummary(container);
        const correlations = container.querySelector('.chart-summary-table__correlations')!;

        expect(correlations.textContent).toContain('0.6700');
        expect(correlations.textContent).toContain('0.7800');
        expect(correlations.textContent).toContain('8 complete pairs');
        expect(correlations.textContent).not.toContain('0.1200');
    });

    it('does not attach coefficients for a newly selected pair to the previous table', () => {
        document.body.insertAdjacentHTML('beforeend', '<select id="scatter-y-col"><option value="previous">previous</option><option value="current">current</option></select>');
        const container = document.getElementById('scatter-chart')!;
        renderScatterAccessibilitySummary(container);
        const table = container.querySelector('table')!;
        const previous = table.textContent;
        (document.getElementById('scatter-y-col') as HTMLSelectElement).value = 'current';
        scatterState.currentPairStats = { pearsonRaw: 0.67, spearmanRaw: 0.78, pearsonDiff: null, spearmanDiff: null, count: 8 };
        refreshScatterAccessibilitySummaryCorrelations();

        expect(table.textContent).toBe(previous);
    });

    it('caches axis summaries for the same data and context, and recalculates for new context or data', () => {
        const points: [number, number][] = [[1, 10], [3, 30], [Number.NaN, 50]];
        const axes = [{ name: 'left', index: 0 as const }, { name: 'right', index: 1 as const }];
        const first = getScatterPointSummaries(points, axes, 'dataset-a');

        expect(first[0]).toMatchObject({ count: 2, min: 1, max: 3, mean: 2, median: 2, missingCount: 1 });
        expect(getScatterPointSummaries(points, axes, 'dataset-a')).toBe(first);
        expect(getScatterPointSummaries(points, axes, 'dataset-b')).not.toBe(first);
        expect(getScatterPointSummaries([[1, 10], [3, 30]], axes, 'dataset-a')).not.toBe(first);
    });
});
