/**
 * scatter/correlationsPanel.ts — Suggestion rendering and correlation refresh.
 *
 * Exports:
 *   - renderSuggestions() — renders correlation suggestion buttons
 *   - refreshCorrelationsAndSuggestions() — fetches and applies correlation data
 *   - openScatterPairInCausal() — dispatches causal page preselect event
 */

import { fetchScatterCorrelations } from '../services/api/index.js';
import { appState } from '../store/appStateCompat.js';
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
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    if (!box) return;

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
        if (ySelect?.value === item.column) btn.classList.add('active');
        const r = Number.isFinite(item.pearson) ? item.pearson!.toFixed(2) : '--';
        const rho = Number.isFinite(item.spearman) ? item.spearman!.toFixed(2) : '--';
        btn.textContent = `${item.column}  Pearson ${r}  Spearman ${rho}`;
        btn.addEventListener('click', () => {
            if (!ySelect || ySelect.value === item.column) return;
            ySelect.value = item.column;
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
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const colorSelect = getEl('scatter-color-column') as HTMLSelectElement | null;
    if (!xSelect || !ySelect) return;

    const meta = appState.scatter.metadata as any;
    const numericCols = Array.isArray(meta?.numeric_columns) ? meta.numeric_columns : [];
    if (numericCols.length < 2) return;

    const response = await fetchScatterCorrelations(xSelect.value || null, appState.scatter.suggestionThreshold);

    const numeric = Array.isArray(response.numeric_columns) ? response.numeric_columns : [];
    if (numeric.length < 2) throw new Error('Need at least two numeric columns for scatter plotting.');

    ensureOptions(xSelect, numeric, xSelect.value || response.base_column || numeric[0]);
    const yCandidates = numeric.filter((c: string) => c !== xSelect.value);
    const selectedY = ensureOptions(ySelect, yCandidates, ySelect.value);

    if (colorSelect) {
        const colorOptions = [''].concat(
            ((appState.scatter.metadata as any)?.columns || [])
                .map((col: any) => String(col?.name || ''))
                .filter(Boolean),
        );
        const preferredColor = appState.scatter.colorColumn || colorSelect.value;
        colorSelect.innerHTML = '';
        for (const col of colorOptions) {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col || 'None';
            colorSelect.appendChild(opt);
        }
        if (colorOptions.includes(preferredColor)) colorSelect.value = preferredColor;
        else colorSelect.value = '';
    }

    appState.scatter.correlationsByColumn = new Map();
    for (const row of response.correlations || []) {
        appState.scatter.correlationsByColumn.set(row.column, row);
    }

    if (!selectedY && yCandidates.length > 0) ySelect.value = yCandidates[0];

    renderSuggestions(response.suggestions || []);
    updateCorrelationStats();
    updateColorbarUI();
}

/**
 * Dispatches the causal preselect event to open the causal page with the current X/Y columns.
 */
export function openScatterPairInCausal(): void {
    const xCol = (getEl('scatter-x-col') as HTMLSelectElement | null)?.value;
    const yCol = (getEl('scatter-y-col') as HTMLSelectElement | null)?.value;
    if (!xCol || !yCol) return;
    window.dispatchEvent(new CustomEvent('edatime:causal-preselect', {
        detail: { columns: [xCol, yCol] },
    }));
    document.querySelector<HTMLElement>('.sidebar .nav-item[data-page="causal"]')?.click?.();
}