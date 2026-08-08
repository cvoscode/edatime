/**
 * scatter/correlationsPanel.ts — Suggestion rendering and correlation refresh.
 *
 * Exports:
 *   - renderSuggestions() — renders correlation suggestion buttons
 *   - refreshCorrelationsAndSuggestions() — fetches and applies correlation data
 *   - openScatterPairInCausal() — preselects a causal page pair
 */

import { fetchScatterCorrelations } from '../../services/api/index.js';
import { scatterState } from '../../store/scatterState.js';
import type { ScatterState } from '../../store/scatterState.js';
import { getDropdownValue, setDropdownOptions, setDropdownValue } from '../../ui/primitives/Dropdown.js';
import { emitFeatureEvent } from '../../platform/featureEvents.js';
import { normalizeCorrelationMetric } from '../../utils/correlationModes.js';
import { getSetting } from '../../utils/settings.js';
import { getEl } from './helpers.js';
import { ensureOptions } from './state.js';
import { updateCorrelationStats, updateColorbarUI } from './rendering.js';
import type { ScatterFetchOptions } from '../../types/scatter.js';

/**
 * Callback invoked when a correlation pill is clicked. The scatter page
 * supplies a closure that updates the X/Y dropdowns, re-fetches the
 * correlation list for the new X, and re-renders the scatter points. The
 * callback is only invoked when the clicked pair differs from the current
 * X/Y selection, so re-clicking the active pill is a no-op.
 */
export type SuggestionApplyHandler = (x: string, y: string) => void | Promise<void>;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function buildCurrentPairStats(
    responsesByMode: Map<string, { correlations?: Array<{ column: string; value?: number | null; count?: number }> }>,
    yColumn: string,
): ScatterState['currentPairStats'] {
    const findRow = (mode: string) => responsesByMode.get(mode)?.correlations?.find((row) => row.column === yColumn);
    const pearsonRaw = findRow('pearson_raw');
    const spearmanRaw = findRow('spearman_raw');
    const pearsonDiff = findRow('pearson_diff');
    const spearmanDiff = findRow('spearman_diff');
    const count = [pearsonRaw, spearmanRaw, pearsonDiff, spearmanDiff]
        .map((row) => row?.count)
        .find((value) => isFiniteNumber(value)) ?? null;
    return {
        pearsonRaw: isFiniteNumber(pearsonRaw?.value) ? pearsonRaw.value : null,
        spearmanRaw: isFiniteNumber(spearmanRaw?.value) ? spearmanRaw.value : null,
        pearsonDiff: isFiniteNumber(pearsonDiff?.value) ? pearsonDiff.value : null,
        spearmanDiff: isFiniteNumber(spearmanDiff?.value) ? spearmanDiff.value : null,
        count,
    };
}

/**
 * Renders the list of correlation suggestion buttons in the scatter panel.
 *
 * Each suggestion entry has the shape `{ x, y, correlation }` (see
 * `CorrelationSuggestion` in `types.ts`). Buttons pair a base column with a
 * suggested partner and let the user apply the pair to the X/Y dropdowns.
 *
 * The supplied handler is fired after a pill is clicked and the dropdowns
 * have been updated. The scatter page
 * uses it to re-fetch the correlation list for the new X and re-render the
 * scatter points so the chart reflects the chosen pair without requiring
 * the user to manually tweak the X or Y selects afterwards.
 */
export function renderSuggestions(
    suggestions: Array<{ x: string; y: string; correlation: number }>,
    onSuggestionApply?: SuggestionApplyHandler,
): void {
    const box = getEl('scatter-suggestions');
    if (!box) return;
    const xValue = getDropdownValue('scatter-x-col');
    const yValue = getDropdownValue('scatter-y-col');

    scatterState.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
    box.innerHTML = '';

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        const topPairs = Array.isArray(scatterState.lastTopPairs)
            ? scatterState.lastTopPairs.filter((pair) => pair?.x && pair?.y).slice(0, 5)
            : [];
        if (topPairs.length > 0) {
            const fallback = document.createElement('div');
            fallback.className = 'scatter-suggestion-fallback';

            const summary = document.createElement('span');
            summary.className = 'scatter-suggestion-empty';
            summary.textContent = `Showing top ${topPairs.length} by |corr|`;
            fallback.appendChild(summary);

            for (const pair of topPairs) {
                const fallbackButton = buildSuggestionButton(pair.x, pair.y, pair.correlation, xValue, yValue, onSuggestionApply);
                fallbackButton.classList.add('scatter-suggestion-btn-top-pair');
                fallbackButton.setAttribute('aria-label', `Top pair ${pair.x} and ${pair.y}`);
                fallback.insertAdjacentElement('beforeend', fallbackButton);
            }
            box.appendChild(fallback);
            return;
        }
        const empty = document.createElement('span');
        empty.className = 'scatter-suggestion-empty';
        empty.textContent = `No suggestions above |corr| >= ${scatterState.suggestionThreshold.toFixed(2)}.`;
        box.appendChild(empty);
        return;
    }

    for (const item of suggestions) {
        const x = typeof item?.x === 'string' ? item.x.trim() : '';
        const y = typeof item?.y === 'string' ? item.y.trim() : '';
        if (!x || !y) continue;
        box.appendChild(buildSuggestionButton(x, y, item.correlation, xValue, yValue, onSuggestionApply));
    }
}

function buildSuggestionButton(
    x: string,
    y: string,
    correlation: number,
    activeX: string,
    activeY: string,
    onSuggestionApply?: SuggestionApplyHandler,
): HTMLButtonElement {
    const corr = Number.isFinite(correlation) ? correlation.toFixed(2) : '--';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scatter-suggestion-btn';
    btn.dataset.xColumn = x;
    btn.dataset.yColumn = y;
    if (activeX === x && activeY === y) btn.classList.add('active');
    btn.textContent = `${x} ↔ ${y}  |corr| ${corr}`;
    btn.title = `Use ${x} (X) and ${y} (Y) — |corr| ${corr}`;
    btn.addEventListener('click', () => {
        if (getDropdownValue('scatter-x-col') === x && getDropdownValue('scatter-y-col') === y) return;
        setDropdownValue('scatter-x-col', x);
        setDropdownValue('scatter-y-col', y);
        updateCorrelationStats();
        renderSuggestions(scatterState.lastSuggestions, onSuggestionApply);
        if (onSuggestionApply) {
            void Promise.resolve(onSuggestionApply(x, y)).catch((err) => {
                console.error('scatter: suggestion apply handler failed', err);
            });
        }
    });
    return btn;
}

/**
 * Fetches correlation data for the current X/Y selection and updates the UI.
 */
export async function refreshCorrelationsAndSuggestions(
    options: {
        preferTopPairOnFirstLoad?: boolean;
        onSuggestionApply?: SuggestionApplyHandler;
        queryContext?: ScatterFetchOptions;
    } = {},
): Promise<void> {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    if (!xSelect || !ySelect) return;

    const meta = scatterState.metadata as any;
    const numericCols = Array.isArray(meta?.numeric_columns) ? meta.numeric_columns : [];
    if (numericCols.length < 2) return;

    const currentX = getDropdownValue('scatter-x-col');
    const currentY = getDropdownValue('scatter-y-col');
    const currentColor = getDropdownValue('scatter-color-column');
    const mode = normalizeCorrelationMetric(getSetting('defaultCorrelationMetric'));
    const response = await fetchScatterCorrelations(
        currentX || null,
        scatterState.suggestionThreshold,
        mode,
        options.queryContext ?? null,
    );

    const numeric = Array.isArray(response.numeric_columns) ? response.numeric_columns : [];
    if (numeric.length < 2) throw new Error('Need at least two numeric columns for scatter plotting.');

    // On the *very first* scatter init with no restored user choice, bias
    // X/Y to the strongest pair in the matrix (top_pairs[0]) so the
    // landing view is the most striking correlation in the dataset. Once
    // the user has picked a pair, preserve that choice across refreshes.
    const topPairs = Array.isArray(response.top_pairs) ? response.top_pairs : [];
    scatterState.lastTopPairs = topPairs.slice();
    const hasUserPair = !!(currentX && currentY) && !options.preferTopPairOnFirstLoad;
    const preferredX = hasUserPair
        ? currentX
        : (topPairs[0]?.x ?? response.base_column ?? numeric[0]);
    const preferredY = hasUserPair
        ? currentY
        : (topPairs[0]?.y ?? numeric.find((c: string) => c !== preferredX) ?? numeric[1] ?? numeric[0]);

    const selectedX = ensureOptions(xSelect, numeric, preferredX, { searchable: true });
    const yCandidates = numeric.filter((c: string) => c !== selectedX);
    const selectedY = ensureOptions(ySelect, yCandidates, preferredY, { searchable: true });

    if (getEl('scatter-color-column')) {
        const colorOptions = [''].concat(
            ((scatterState.metadata as any)?.columns || [])
                .map((col: any) => String(col?.name || ''))
                .filter(Boolean),
        );
        const preferredColor = scatterState.colorColumn || currentColor;
        setDropdownOptions('scatter-color-column', colorOptions.map((col) => ({
            value: col,
            label: col || 'None',
        })), {
            preferredValue: colorOptions.includes(preferredColor) ? preferredColor : '',
            searchable: true,
        });
    }

    const selectedBase = selectedX || response.base_column || currentX || null;
    const familyModes = mode.endsWith('_diff')
        ? ['pearson_diff', 'spearman_diff']
        : ['pearson_raw', 'spearman_raw'];
    const settledResponses = await Promise.allSettled(familyModes.map(async (familyMode) => {
        if (familyMode === mode && response.base_column === selectedBase) {
            return [familyMode, response] as const;
        }
        return [familyMode, await fetchScatterCorrelations(
            selectedBase,
            scatterState.suggestionThreshold,
            familyMode as typeof mode,
            options.queryContext ?? null,
        )] as const;
    }));
    const responsesByMode = new Map<string, typeof response>();
    for (const settled of settledResponses) {
        if (settled.status === 'fulfilled') {
            responsesByMode.set(settled.value[0], settled.value[1]);
        }
    }
    const activeResponse = responsesByMode.get(mode) ?? response;

    if (!selectedY && yCandidates.length > 0) setDropdownValue('scatter-y-col', yCandidates[0]!);

    scatterState.correlationsByColumn = new Map();
    for (const row of activeResponse.correlations || []) {
        scatterState.correlationsByColumn.set(row.column, row);
    }
    // Store every family-mode correlation map so the chip renderer can
    // look up the current Y directly when only Y changes (the Y handler
    // does not trigger a network refresh — only the X handler does).
    scatterState.correlationsByMode = new Map();
    for (const [familyMode, familyResponse] of responsesByMode) {
        const byColumn = new Map<string, { value?: number | null; count?: number; column?: string }>();
        for (const row of familyResponse?.correlations || []) {
            byColumn.set(row.column, row);
        }
        scatterState.correlationsByMode.set(familyMode, byColumn);
    }
    const activeY = getDropdownValue('scatter-y-col') || selectedY || '';
    scatterState.currentPairStats = activeY ? buildCurrentPairStats(responsesByMode, activeY) : null;

    renderSuggestions(activeResponse.suggestions || [], options.onSuggestionApply);
    updateCorrelationStats();
    updateColorbarUI();
}

/**
 * Preselects the active pair before navigating to the Causal page.
 */
export function openScatterPairInCausal(): void {
    const xCol = getDropdownValue('scatter-x-col');
    const yCol = getDropdownValue('scatter-y-col');
    if (!xCol || !yCol) return;
    emitFeatureEvent('causal:preselect', { columns: [xCol, yCol] });
    document.querySelector<HTMLElement>('.sidebar .nav-item[data-page="causal"]')?.click?.();
}
