/**
 * causal/chipPanel — column chip rendering for the causal page.
 * Uses renderSeriesChipList; does not own chart state.
 */
import { renderSeriesChipList } from '../../ui/index.js';
import { setStatus, syncCausalEmptyState } from './statusView.js';
import {
    _chipColors,
    _selectedColumns,
    metadataColumns,
    numericSet,
    ensureNodeMetadata,
    workspaceMetadata,
    type CausalDeps,
    type CausalMetadata,
} from './selectionState.js';

export function syncCausalComputeActionState(deps: CausalDeps): void {
    const meta = workspaceMetadata(deps);
    const numeric = numericSet(meta);
    const selectedCount = Array.from(_selectedColumns).filter((column) => numeric.has(column)).length;
    const overlay = document.getElementById('causal-loading');
    const busy = Boolean(overlay && !overlay.hidden);
    const reason = busy
        ? 'Causal discovery is running. Use Cancel discovery to stop it.'
        : selectedCount < 2 ? 'Select at least two numeric series to run causal discovery.' : '';
    const reasonEl = document.getElementById('causal-compute-reason');
    if (reasonEl) reasonEl.textContent = reason || 'Runs causal discovery on the selected numeric series.';
    const button = document.getElementById('causal-compute-btn') as HTMLButtonElement | null;
    if (button) {
        button.disabled = busy || selectedCount < 2;
        button.title = reason;
    }
}

export function renderColumnChips(
    deps: CausalDeps,
    columnsBar: HTMLElement,
    openEditPanel: (target: { kind: 'node'; col: string }) => void,
): void {
    const meta = workspaceMetadata(deps);
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
        syncCausalComputeActionState(deps);
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
                    ? `Include ${col} in causal discovery`
                    : `Toggle ${col} as a manual graph/meta node`,
                onToggle: (checked) => {
                    if (!numericColumn) return;
                    if (checked) _selectedColumns.add(col);
                    else if (selectedNumericCount() <= 2) {
                        setStatus('Keep at least 2 numeric traces selected for causal discovery.', 'error');
                        return;
                    } else _selectedColumns.delete(col);
                    renderColumnChips(deps, columnsBar, openEditPanel);
                    syncCausalEmptyState(selectedNumericCount());
                    syncCausalComputeActionState(deps);
                },
                onColorInput: (color) => {
                    _chipColors.set(col, color);
                },
                onMenuClick: () => openEditPanel({ kind: 'node', col }),
                menuLabel: `Edit ${col} causal node`,
            };
        }),
        chipClass: 'fft-trace-chip',
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
    syncCausalComputeActionState(deps);

    for (const item of cols) {
        if (numeric.has(item.name)) continue;
        const existing = columnsBar.querySelector<HTMLElement>(`[data-col="${item.name}"]`);
        if (!existing) continue;

        const metaChip = document.createElement('span');
        metaChip.className = 'series-chip fft-trace-chip causal-chip-nonnumeric';
        metaChip.dataset.col = item.name;
        metaChip.setAttribute('role', 'note');
        metaChip.setAttribute('title', `${item.name} is metadata and is not used in numeric discovery`);
        const label = document.createElement('span');
        label.className = 'chip-label';
        label.textContent = `${item.name} · metadata`;
        metaChip.append(label);
        existing.replaceWith(metaChip);
    }
}
