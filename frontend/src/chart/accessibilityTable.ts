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
}

/**
 * Build a hidden HTML table element containing statistical summaries
 * for screen readers (using sr-only accessibility styling).
 */
export function createAccessibilitySummaryTable(
    chartTitle: string,
    summaries: readonly SeriesSummary[],
): HTMLTableElement {
    const table = document.createElement('table');
    table.className = 'sr-only';
    table.setAttribute('aria-label', `Statistical summary for ${chartTitle}`);

    const caption = document.createElement('caption');
    caption.textContent = `Data summary for ${chartTitle}`;
    table.appendChild(caption);

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const headers = ['Series Name', 'Point Count', 'Min Value', 'Max Value', 'Mean Value'];
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

        tbody.appendChild(row);
    }
    table.appendChild(tbody);

    return table;
}
