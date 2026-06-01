/**
 * Column toggle chip UI + column range filter controls.
 */

import {
    appStateComposite as appState,
} from '../../store/index.js';
import { renderSeriesChipList } from '../../ui/index.js';
import { sanitizeSelectedColumns, ensureAdaptiveTargetStillValid } from './columnSelection.js';
import { buildRangeControls } from './rangeControls.js';
import { applyCollapse } from './seriesCollapse.js';
import { bindChipContextMenu } from './chipContextMenu.js';
import { composeChipListItems, bindChipCtrlClick } from './chipComposition.js';
import { initFilterModalController } from './filterModalController.js';
export { initSeriesCollapse } from './seriesCollapse.js';

// ─── Column toggles (chips) ─────────────────────────────────────────────────

export function buildColumnToggles(
    fetchAndRender: () => void,
    buildRangeControlsFn: () => void,
    renderCurrentDataFn: (() => void) | null = null,
): void {
    const container = document.getElementById('column-toggles');
    if (!container || (container as any)?.dataset?.rebuilding) return;
    container.dataset.rebuilding = '1';
    sanitizeSelectedColumns();
    ensureAdaptiveTargetStillValid();
    container.innerHTML = '';
    const finish = () => { container.dataset.rebuilding = ''; };

    bindChipContextMenu(container);

    const items = composeChipListItems({
        filterText: appState.filterText ?? '',
        buildRangeControlsFn,
        fetchAndRender,
        renderCurrentDataFn,
    });

    if (items.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'series-empty';
        empty.textContent = 'No matching columns';
        container.appendChild(empty);
        return;
    }

    renderSeriesChipList({
        container,
        items: items.map((item) => ({ ...item, onToggle: item.onToggle })),
        chipClass: 'timeseries-chip',
        onColorUpdate: (col, color) => {
            const chip = container.querySelector(`[data-col="${col}"]`) as HTMLElement | null;
            if (chip) chip.style.setProperty('--chip-accent', color);
        },
    });

    bindChipCtrlClick(
        container,
        () => {
            buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn);
            buildRangeControlsFn();
        },
        buildRangeControlsFn,
        renderCurrentDataFn,
        fetchAndRender,
    );
    finish();
    applyCollapse();
}

// ─── Range control chips (delegated) ──────────────────────────────────────────
export { buildRangeControls } from './rangeControls.js';

// ─── Column filter modal ───────────────────────────────────────────────────

export function initColumnFilterModal(
    renderCurrentData: () => void,
    updateAnalysisYRange: (min: number, max: number, source: string) => void,
): void {
    initFilterModalController({
        renderCurrentData,
        updateAnalysisYRange,
    });
}
