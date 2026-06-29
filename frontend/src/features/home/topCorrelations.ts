/**
 * Home page "Top correlations" widget — surfaces the strongest pairs
 * across the full numeric matrix for the currently-loaded dataset.
 *
 * Clicking a pair jumps to the scatter page with that X/Y already
 * selected. See `usage_issue.md` §9 and the `usage_issue.md` follow-up
 * list at the top of the file.
 */

import { fetchScatterCorrelations } from '../../services/api/index.js';
import { setDropdownValue } from '../../ui/primitives/Dropdown.js';
import { appState, store } from '../../store/index.js';
import { normalizeCorrelationMetric } from '../../utils/correlationModes.js';
import { getSetting } from '../../utils/settings.js';
import type { DatasetMetadata, TopPairItem } from '../../types.js';

let lastRenderKey: string | null = null;

function isReady(metadata: DatasetMetadata | null): boolean {
    if (!metadata) return false;
    const numeric = Array.isArray(metadata.numeric_columns) ? metadata.numeric_columns : [];
    return numeric.length >= 2;
}

function navigateToScatter(x: string, y: string): void {
    setDropdownValue('scatter-x-col', x);
    setDropdownValue('scatter-y-col', y);
    const navButton = document.querySelector<HTMLElement>('.sidebar .nav-item[data-page="scatter"]');
    navButton?.click?.();
    // Dispatch a page-change so the scatter page re-init picks up the new
    // X/Y selection even if it was already initialized.
    window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'scatter' } }));
}

function buildRow(item: TopPairItem): HTMLButtonElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'home-top-pair-row';
    const x = String(item.x || '').trim();
    const y = String(item.y || '').trim();
    const corr = Number.isFinite(item.correlation) ? item.correlation : 0;
    const strongNegative = corr <= -0.5;
    row.classList.toggle('negative', strongNegative);
    row.innerHTML = `
        <span class="home-top-pair-row__x">${x}</span>
        <span class="home-top-pair-row__arrow">↔</span>
        <span class="home-top-pair-row__y">${y}</span>
        <span class="home-top-pair-row__corr">${corr >= 0 ? '' : '−'}${Math.abs(corr).toFixed(2)}</span>
    `;
    row.title = `${x} (X) ↔ ${y} (Y) — signed r = ${corr.toFixed(3)}, n = ${item.count ?? '?'}`;
    row.addEventListener('click', () => navigateToScatter(x, y));
    return row;
}

async function renderHomeTopCorrelations(metadata: DatasetMetadata | null): Promise<void> {
    const section = document.getElementById('home-top-correlations-section');
    const list = document.getElementById('home-top-correlations');
    if (!section || !list) return;
    if (!isReady(metadata)) {
        section.hidden = true;
        list.innerHTML = '';
        lastRenderKey = null;
        return;
    }
    const renderKey = `top-pairs|${appState.datasetRevision ?? 0}`;
    if (renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;
    section.hidden = false;
    list.innerHTML = '<span class="muted">Loading…</span>';
    try {
        const mode = normalizeCorrelationMetric(getSetting('defaultCorrelationMetric'));
        const response = await fetchScatterCorrelations(null, 0, mode);
        const pairs = Array.isArray(response.top_pairs) ? response.top_pairs.slice(0, 6) : [];
        if (pairs.length === 0) {
            list.innerHTML = '<span class="muted">No strong pairs detected for the current dataset.</span>';
            return;
        }
        list.innerHTML = '';
        for (const pair of pairs) {
            list.appendChild(buildRow(pair));
        }
    } catch (error) {
        console.warn('[edatime:home] top pairs fetch failed', error);
        list.innerHTML = '<span class="muted">Could not load top correlations.</span>';
    }
}

/**
 * Wire the home page "Top correlations" widget. Safe to call multiple
 * times — the dataset-revision key short-circuits repeated renders.
 */
export function wireHomeTopCorrelations(): void {
    renderHomeTopCorrelations(appState.metadata);
    store.subscribe('dataset:metadata', () => {
        // Reset the cached key so a metadata change forces a re-render.
        lastRenderKey = null;
        renderHomeTopCorrelations(appState.metadata);
    });
    store.subscribe('dataset:datasetRevision', () => {
        lastRenderKey = null;
        renderHomeTopCorrelations(appState.metadata);
    });
}
