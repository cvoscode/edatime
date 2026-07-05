/**
 * causal/chipPanel — column chip rendering for the causal page.
 * Uses renderSeriesChipList; does not own chart state.
 */
import { renderSeriesChipList } from '../ui/index.js';
import { syncCausalEmptyState } from './statusView.js';
import {
    _chipColors,
    _selectedColumns,
    metadataColumns,
    numericSet,
    ensureNodeMetadata,
    type CausalDeps,
    type CausalMetadata,
} from './selectionState.js';

export function renderColumnChips(
    deps: CausalDeps,
    columnsBar: HTMLElement,
    openEditPanel: (target: { kind: 'node'; col: string }) => void,
): void {
    const meta = deps.getMetadata();
    if (!meta) return;
    const numeric = numericSet(meta);
    const cols = metadataColumns(meta);
    columnsBar.innerHTML = '';

    const numericCols = cols.filter((item) => numeric.has(item.name));
    const selectedNumericCount = () => numericCols.filter((item) => _selectedColumns.has(item.name)).length;
    const allSelected = numericCols.length > 0 && numericCols.every((item) => _selectedColumns.has(item.name));
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = `series-chip fft-trace-chip causal-column-action${allSelected ? ' active' : ''}`;
    selectAllBtn.type = 'button';
    selectAllBtn.innerHTML = `<span class="chip-label">${allSelected ? 'Clear all' : 'Select all'}</span>`;
    selectAllBtn.title = allSelected ? 'Clear the causal column selection' : 'Select all columns in the pane';
    selectAllBtn.addEventListener('click', () => {
        const tauInputEl = document.getElementById('causal-tau-max') as HTMLInputElement | null;
        const savedTauMax = tauInputEl?.value;
        if (allSelected) {
            _selectedColumns.clear();
        } else {
            numericCols.forEach((item) => _selectedColumns.add(item.name));
        }
        renderColumnChips(deps, columnsBar, openEditPanel);
        syncCausalEmptyState(selectedNumericCount());
        if (savedTauMax && tauInputEl && tauInputEl.value !== savedTauMax) {
            tauInputEl.value = savedTauMax;
        }
    });

    renderSeriesChipList({
        container: columnsBar,
        items: cols.map((item) => {
            const col = item.name;
            const numericColumn = numeric.has(col);
            ensureNodeMetadata(col, meta, deps);
            const currentColor = _chipColors.get(col) ?? '#00a8ff';
            const active = numericColumn && _selectedColumns.has(col);
            return {
                column: col,
                checked: active,
                color: currentColor,
                title: numericColumn
                    ? `Toggle ${col} for causal discovery`
                    : `Toggle ${col} as a manual graph/meta node`,
                onToggle: (checked) => {
                    if (!numericColumn) return;
                    if (checked) _selectedColumns.add(col);
                    else _selectedColumns.delete(col);
                    renderColumnChips(deps, columnsBar, openEditPanel);
                    syncCausalEmptyState(selectedNumericCount());
                },
                onColorInput: (color) => {
                    _chipColors.set(col, color);
                },
                onMenuClick: () => openEditPanel({ kind: 'node', col }),
                menuLabel: `Edit ${col} causal node`,
            };
        }),
        chipClass: 'fft-trace-chip',
        postChipAttributes: { role: 'button', tabIndex: '0' },
        postChipClass: (item) => {
            const col = item.column;
            return numeric.has(col) ? '' : 'causal-chip-nonnumeric';
        },
        onColorUpdate: (col, color) => {
            const chip = columnsBar.querySelector(`[data-col="${col}"]`) as HTMLElement | null;
            if (chip) chip.style.setProperty('--chip-accent', color);
        },
    });
    columnsBar.prepend(selectAllBtn);

    for (const item of cols) {
        if (numeric.has(item.name)) continue;
        const existing = columnsBar.querySelector<HTMLElement>(`[data-col="${item.name}"]`);
        if (!existing) continue;

        const metaChip = document.createElement('span');
        metaChip.className = 'series-chip fft-trace-chip causal-chip-nonnumeric';
        metaChip.dataset.col = item.name;
        metaChip.setAttribute('role', 'note');
        metaChip.setAttribute('title', `${item.name} metadata column`);
        metaChip.innerHTML = `<span class="chip-label">${item.name}</span>`;
        existing.replaceWith(metaChip);
    }
}
