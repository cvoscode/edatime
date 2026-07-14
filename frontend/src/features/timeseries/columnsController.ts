/**
 * Column toggle chip UI + column range filter controls.
 *
 * The previous version of this module also rendered two persistent
 * discovery affordances below the chip rail — a "X of Y active" text
 * summary and an inline "Ctrl + click" adaptive-filter hint chip —
 * which were clipped off the right edge of the panel at intermediate
 * viewports (1100 / 768 / 414 / 375 px) and added a fixed ~50 px tall
 * row at every width. Both have been removed; the chip rail's own
 * tooltips and the Draw toolbar "?" help button now carry that
 * discoverability information (see `frontend/src/ui/drawControls.ts`).
 */

import {
    uiState,
} from '../../store/uiState.js';
import { datasetState } from '../../store/datasetState.js';
import { renderSeriesChipList } from '../../ui/index.js';
import { sanitizeSelectedColumns, ensureAdaptiveTargetStillValid } from './columnSelection.js';
import { buildRangeControls } from './rangeControls.js';
import { bindChipContextMenu } from './chipContextMenu.js';
import { composeChipListItems, bindChipCtrlClick } from './chipComposition.js';
import { initFilterModalController } from './filterModalController.js';
import { renderColorByControl } from './colorByControl.js';
import type { SelectionWorkspace } from './selectionIntent.js';
import type { FilterWorkspace } from './selectionIntent.js';
import type { DataObject } from '../../types/api.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';

// ─── Column toggles (chips) ─────────────────────────────────────────────────

export function buildColumnToggles(
    fetchAndRender: () => void,
    buildRangeControlsFn: () => void,
    renderCurrentDataFn: (() => void) | null = null,
    workspace: SelectionWorkspace,
    openColumnFilter: (column: string | null) => void = () => {},
): void {
    const container = document.getElementById('column-toggles');
    if (!container || (container as any)?.dataset?.rebuilding) return;
    container.dataset.rebuilding = '1';
    sanitizeSelectedColumns(workspace);
    ensureAdaptiveTargetStillValid(workspace);
    container.innerHTML = '';
    const finish = () => { container.dataset.rebuilding = ''; };

    bindChipContextMenu(container, openColumnFilter);
    renderColorByControl({
        workspace,
        onColorColumnChange: fetchAndRender,
    });

    const items = composeChipListItems({
        workspace,
        filterText: uiState.filterText ?? '',
        buildRangeControlsFn,
        fetchAndRender,
        renderCurrentDataFn,
        openColumnFilter,
    });

    if (items.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'series-empty';
        empty.textContent = 'No matching columns';
        container.appendChild(empty);
        finish();
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

    // Annotate the rail container with the active / total counts so the
    // information previously shown in the removed chip-status summary row
    // is still available via the native tooltip on hover/focus.
    const total = Array.isArray(datasetState.numericCols) ? datasetState.numericCols.length : 0;
    const active = workspace.getSnapshot().selection.columns.length;
    const summaryText = total > 0
        ? `${active} of ${total} active. Click chips to add more.`
        : 'No numeric series available.';
    container.setAttribute('title', summaryText);
    container.setAttribute('aria-label', summaryText);

    bindChipCtrlClick(
        container,
        () => {
            buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn, workspace, openColumnFilter);
            buildRangeControlsFn();
        },
        buildRangeControlsFn,
        renderCurrentDataFn,
        fetchAndRender,
        workspace,
    );
    finish();
}

// ─── Range control chips (delegated) ──────────────────────────────────────────
export { buildRangeControls } from './rangeControls.js';

// ─── Column filter modal ───────────────────────────────────────────────────

export function initColumnFilterModal(
    renderCurrentData: () => void,
    updateAnalysisYRange: (min: number, max: number, source: string) => void,
    workspace: FilterWorkspace,
    openColumnFilter: (column: string | null) => void,
    getCurrentData: () => DataObject | null,
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage' | 'updateStage' | 'removeStage'>,
) {
    return initFilterModalController({
        renderCurrentData,
        updateAnalysisYRange,
        workspace,
        openColumnFilter,
        getCurrentData,
        cleaningPlanStore,
    });
}
