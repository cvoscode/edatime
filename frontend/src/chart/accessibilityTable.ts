/**
 * Accessibility utility for generating accessible statistical summaries
 * for HTML5 Canvas and WebGPU chart layers.
 */

export interface SeriesSummary {
    name: string;
    count: number;
    min: number;
    max: number;
    mean: number;
    std?: number;
    median?: number;
    missingCount?: number;
}

/**
 * Build a hidden HTML table element containing statistical summaries
 * for screen readers (using sr-only accessibility styling).
 */
export function createAccessibilitySummaryTable(
    chartTitle: string,
    summaries: readonly SeriesSummary[],
    options: { visible?: boolean } = {},
): HTMLTableElement {
    const table = document.createElement('table');
    table.className = options.visible ? 'chart-summary-table' : 'sr-only';
    table.setAttribute('aria-label', `Statistical summary for ${chartTitle}`);

    const caption = document.createElement('caption');
    caption.textContent = `Data summary for ${chartTitle}`;
    table.appendChild(caption);

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const headers = ['Series', 'Count', 'Min', 'Max', 'Mean', 'Std', 'Median', 'Missing %'];
    for (const text of headers) {
        const th = document.createElement('th');
        th.setAttribute('scope', 'col');
        th.textContent = text;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const summary of summaries) {
        const row = document.createElement('tr');

        const th = document.createElement('th');
        th.setAttribute('scope', 'row');
        th.textContent = summary.name;
        row.appendChild(th);

        const tdCount = document.createElement('td');
        tdCount.textContent = summary.count.toLocaleString();
        row.appendChild(tdCount);

        const tdMin = document.createElement('td');
        tdMin.textContent = summary.min.toLocaleString(undefined, { maximumFractionDigits: 4 });
        row.appendChild(tdMin);

        const tdMax = document.createElement('td');
        tdMax.textContent = summary.max.toLocaleString(undefined, { maximumFractionDigits: 4 });
        row.appendChild(tdMax);

        const tdMean = document.createElement('td');
        tdMean.textContent = summary.mean.toLocaleString(undefined, { maximumFractionDigits: 4 });
        row.appendChild(tdMean);

        const tdStd = document.createElement('td');
        tdStd.textContent = Number.isFinite(summary.std)
            ? summary.std!.toLocaleString(undefined, { maximumFractionDigits: 4 })
            : '—';
        row.appendChild(tdStd);

        const tdMedian = document.createElement('td');
        tdMedian.textContent = Number.isFinite(summary.median)
            ? summary.median!.toLocaleString(undefined, { maximumFractionDigits: 4 })
            : '—';
        row.appendChild(tdMedian);

        const tdMissing = document.createElement('td');
        const missingCount = Math.max(0, summary.missingCount ?? 0);
        const observedCount = Math.max(0, summary.count);
        const denominator = observedCount + missingCount;
        tdMissing.textContent = denominator > 0 ? `${((missingCount / denominator) * 100).toFixed(2)}%` : '—';
        row.appendChild(tdMissing);

        tbody.appendChild(row);
    }
    table.appendChild(tbody);

    return table;
}
