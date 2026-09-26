import type { CleaningPreviewResponse, CleaningPreviewRow } from './api.js';

export function renderPreviewEvidence(result: CleaningPreviewResponse): HTMLElement | null {
    if (!result.examples && !result.sourceColumns && !result.resultColumns) return null;
    const evidence = document.createElement('section');
    evidence.className = 'cleaning-plan-preview-evidence';
    const heading = document.createElement('h3');
    heading.textContent = 'Source and working data examples';
    const schema = document.createElement('p');
    schema.className = 'cleaning-plan-preview-evidence__hint';
    schema.textContent = `Source columns: ${(result.sourceColumns ?? []).join(', ') || 'unknown'} · Working columns: ${(result.resultColumns ?? []).join(', ') || 'unknown'}`;
    const scope = document.createElement('p');
    scope.className = 'cleaning-plan-preview-evidence__hint';
    scope.textContent = 'Examples are drawn independently from each result. Row positions can change after filtering or sorting; these are not counts of affected values.';
    evidence.append(heading, schema);
    if (result.sourceColumns && result.resultColumns) {
        const source = new Set(result.sourceColumns);
        const working = new Set(result.resultColumns);
        const added = result.resultColumns.filter((column) => !source.has(column));
        const removed = result.sourceColumns.filter((column) => !working.has(column));
        const changes = document.createElement('p');
        changes.className = 'cleaning-plan-preview-evidence__hint';
        changes.textContent = added.length || removed.length
            ? [`Added columns: ${added.join(', ') || 'none'}`, `Removed columns: ${removed.join(', ') || 'none'}`].join(' · ')
            : 'Column names are unchanged. Values may still be transformed.';
        evidence.append(changes);
    }
    evidence.append(scope);

    const renderRows = (title: string, rows: CleaningPreviewRow[] | undefined) => {
        const section = document.createElement('details');
        section.open = true;
        const summary = document.createElement('summary');
        summary.textContent = `${title} examples (${rows?.length ?? 0})`;
        section.appendChild(summary);
        if (!rows?.length) {
            const empty = document.createElement('p');
            empty.className = 'cleaning-plan-preview-evidence__hint';
            empty.textContent = 'No example rows were returned.';
            section.appendChild(empty);
            return section;
        }
        const table = document.createElement('table');
        table.className = 'cleaning-plan-preview-table';
        const caption = document.createElement('caption');
        caption.className = 'sr-only';
        caption.textContent = `${title} example rows from the preview`;
        table.append(caption);
        const head = document.createElement('tr');
        for (const label of ['Row', 'Timestamp', 'Values']) {
            const cell = document.createElement('th');
            cell.scope = 'col';
            cell.textContent = label;
            head.appendChild(cell);
        }
        const thead = document.createElement('thead');
        thead.appendChild(head);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const row of rows) {
            const tr = document.createElement('tr');
            for (const value of [String(row.rowNumber), row.timestamp, Object.entries(row.values).map(([key, item]) => `${key}=${item}`).join(' · ')]) {
                const cell = document.createElement('td');
                cell.textContent = value;
                tr.appendChild(cell);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        section.appendChild(table);
        return section;
    };
    evidence.append(renderRows('Raw', result.examples?.raw), renderRows('Working', result.examples?.working));
    return evidence;
}

