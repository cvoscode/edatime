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
import { normalizeCorrelationMetric } from '../utils/correlationModes.js';
import { getSetting } from '../utils/settings.js';
import { getEl } from './helpers.js';
import { ensureOptions } from './state.js';
import { updateCorrelationStats, updateColorbarUI } from './rendering.js';

/**
 * Callback invoked when a correlation pill is clicked. The scatter page
 * supplies a closure that updates the X/Y dropdowns, re-fetches the
 * correlation list for the new X, and re-renders the scatter points. The
 * callback is only invoked when the clicked pair differs from the current
 * X/Y selection, so re-clicking the active pill is a no-op.
 */
export type SuggestionApplyHandler = (x: string, y: string) => void | Promise<void>;

/**
 * Module-scoped handler that the scatter page registers on init. We hold
 * the most recently supplied callback so `renderSuggestions` can re-attach
 * it to freshly built buttons after a refresh, and `refreshCorrelationsAnd
 * Suggestions` can pass it through automatically.
 */
let activeApplyHandler: SuggestionApplyHandler | null = null;

/**
 * Register the apply handler for correlation pills. The scatter page calls
 * this once during init so subsequent `renderSuggestions` invocations (from
 * threshold changes, page re-entry, etc.) keep the click → re-render
 * wiring intact without forcing every caller to pass the handler.
 */
export function setSuggestionApplyHandler(handler: SuggestionApplyHandler | null): void {
    activeApplyHandler = handler;
}

/**
 * Renders the list of correlation suggestion buttons in the scatter panel.
 *
 * Each suggestion entry has the shape `{ x, y, correlation }` (see
 * `CorrelationSuggestion` in `types.ts`). Buttons pair a base column with a
 * suggested partner and let the user apply the pair to the X/Y dropdowns.
 *
 * The handler registered via `setSuggestionApplyHandler` is fired after a
 * pill is clicked and the dropdowns have been updated. The scatter page
 * uses it to re-fetch the correlation list for the new X and re-render the
 * scatter points so the chart reflects the chosen pair without requiring
 * the user to manually tweak the X or Y selects afterwards.
 */
export function renderSuggestions(
    suggestions: Array<{ x: string; y: string; correlation: number }>
): void {
    const box = getEl('scatter-suggestions');
    if (!box) return;
    const xValue = getDropdownValue('scatter-x-col');
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
        const x = typeof item?.x === 'string' ? item.x.trim() : '';
        const y = typeof item?.y === 'string' ? item.y.trim() : '';
        if (!x || !y) continue;
        const corr = Number.isFinite(item.correlation) ? item.correlation.toFixed(2) : '--';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scatter-suggestion-btn';
        btn.dataset.xColumn = x;
        btn.dataset.yColumn = y;
        if (xValue === x && yValue === y) btn.classList.add('active');
        btn.textContent = `${x} ↔ ${y}  |corr| ${corr}`;
        btn.title = `Use ${x} (X) and ${y} (Y) — |corr| ${corr}`;
        btn.addEventListener('click', () => {
            if (getDropdownValue('scatter-x-col') === x && getDropdownValue('scatter-y-col') === y) return;
            setDropdownValue('scatter-x-col', x);
            setDropdownValue('scatter-y-col', y);
            updateCorrelationStats();
            renderSuggestions(appState.scatter.lastSuggestions);
            const handler = activeApplyHandler;
            if (handler) {
                void Promise.resolve(handler(x, y)).catch((err) => {
                    console.error('scatter: suggestion apply handler failed', err);
                });
            }
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
    const mode = normalizeCorrelationMetric(getSetting('defaultCorrelationMetric'));
    const response = await fetchScatterCorrelations(currentX || null, appState.scatter.suggestionThreshold, mode);

    const numeric = Array.isArray(response.numeric_columns) ? response.numeric_columns : [];
    if (numeric.length < 2) throw new Error('Need at least two numeric columns for scatter plotting.');

    const selectedX = ensureOptions(xSelect, numeric, currentX || response.base_column || numeric[0], { searchable: true });
    const yCandidates = numeric.filter((c: string) => c !== selectedX);
    const selectedY = ensureOptions(ySelect, yCandidates, currentY, { searchable: true });

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
            searchable: true,
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
