/**
 * scatter/correlationsPanel.ts — Suggestion rendering and correlation refresh.
 *
 * Exports:
 *   - renderSuggestions() — renders correlation suggestion buttons
 *   - refreshCorrelationsAndSuggestions() — fetches and applies correlation data
 *   - openScatterPairInCausal() — dispatches causal page preselect event
 */

import { fetchScatterCorrelations } from '../services/api/index.js';
import { appState } from '../store/index.js';
import { getDropdownValue, setDropdownOptions, setDropdownValue } from '../ui/primitives/Dropdown.js';
import { getEl } from './helpers.js';
import { ensureOptions } from './state.js';
import { updateCorrelationStats, updateColorbarUI } from './rendering.js';

/**
 * Renders the list of correlation suggestion buttons in the scatter panel.
 */
export function renderSuggestions(
    suggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>
): void {
    const box = getEl('scatter-suggestions');
    if (!box) return;
    const yValue = getDropdownValue('scatter-y-col');

    appState.scatter.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
    box.innerHTML = '';

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'scatter-suggestion-empty';
        empty.textContent = `No suggestions above |corr| >= ${appState.scatter.suggestionThreshold.toFixed(2)}.`;
        box.appendChild(empty);
        return;
    }

    for (const item of suggestions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scatter-suggestion-btn';
        if (yValue === item.column) btn.classList.add('active');
        const r = Number.isFinite(item.pearson) ? item.pearson!.toFixed(2) : '--';
        const rho = Number.isFinite(item.spearman) ? item.spearman!.toFixed(2) : '--';
        btn.textContent = `${item.column}  Pearson ${r}  Spearman ${rho}`;
        btn.addEventListener('click', () => {
            if (getDropdownValue('scatter-y-col') === item.column) return;
            setDropdownValue('scatter-y-col', item.column);
            updateCorrelationStats();
            renderSuggestions(appState.scatter.lastSuggestions);
        });
        box.appendChild(btn);
    }
}

/**
 * Fetches correlation data for the current X/Y selection and updates the UI.
 */
export async function refreshCorrelationsAndSuggestions(): Promise<void> {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    if (!xSelect || !ySelect) return;

    const meta = appState.scatter.metadata as any;
    const numericCols = Array.isArray(meta?.numeric_columns) ? meta.numeric_columns : [];
    if (numericCols.length < 2) return;

    const currentX = getDropdownValue('scatter-x-col');
    const currentY = getDropdownValue('scatter-y-col');
    const currentColor = getDropdownValue('scatter-color-column');
    const response = await fetchScatterCorrelations(currentX || null, appState.scatter.suggestionThreshold);

    const numeric = Array.isArray(response.numeric_columns) ? response.numeric_columns : [];
    if (numeric.length < 2) throw new Error('Need at least two numeric columns for scatter plotting.');

    const selectedX = ensureOptions(xSelect, numeric, currentX || response.base_column || numeric[0]);
    const yCandidates = numeric.filter((c: string) => c !== selectedX);
    const selectedY = ensureOptions(ySelect, yCandidates, currentY);

    if (getEl('scatter-color-column')) {
        const colorOptions = [''].concat(
            ((appState.scatter.metadata as any)?.columns || [])
                .map((col: any) => String(col?.name || ''))
                .filter(Boolean),
        );
        const preferredColor = appState.scatter.colorColumn || currentColor;
        setDropdownOptions('scatter-color-column', colorOptions.map((col) => ({
            value: col,
            label: col || 'None',
        })), {
            preferredValue: colorOptions.includes(preferredColor) ? preferredColor : '',
        });
    }

    appState.scatter.correlationsByColumn = new Map();
    for (const row of response.correlations || []) {
        appState.scatter.correlationsByColumn.set(row.column, row);
    }

    if (!selectedY && yCandidates.length > 0) setDropdownValue('scatter-y-col', yCandidates[0]!);

    renderSuggestions(response.suggestions || []);
    updateCorrelationStats();
    updateColorbarUI();
}

/**
 * Dispatches the causal preselect event to open the causal page with the current X/Y columns.
 */
export function openScatterPairInCausal(): void {
    const xCol = getDropdownValue('scatter-x-col');
    const yCol = getDropdownValue('scatter-y-col');
    if (!xCol || !yCol) return;
    window.dispatchEvent(new CustomEvent('edatime:causal-preselect', {
        detail: { columns: [xCol, yCol] },
    }));
    document.querySelector<HTMLElement>('.sidebar .nav-item[data-page="causal"]')?.click?.();
}
