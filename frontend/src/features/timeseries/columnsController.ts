import { getEffectiveNumericColumns } from '../../platform/analyticsColumns.js';
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
    timeseriesInteraction,
} from './interaction.js';
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
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot'>,
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
        onColorColumnChange: () => {
            buildColumnToggles(
                fetchAndRender,
                buildRangeControlsFn,
                renderCurrentDataFn,
                workspace,
                openColumnFilter,
                cleaningPlanStore,
            );
            fetchAndRender();
        },
    });

    const items = composeChipListItems({
        workspace,
        filterText: timeseriesInteraction.filterText ?? '',
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
        container.setAttribute('title', 'No matching series.');
        container.setAttribute('aria-label', 'No matching series.');
        const disclosureValue = document.getElementById('timeseries-series-disclosure-value');
        if (disclosureValue) disclosureValue.textContent = 'No matching series';
        finish();
        return;
    }

    const syncSummary = () => {
        const total = getEffectiveNumericColumns(workspace.getSnapshot().dataset.metadata, cleaningPlanStore?.getSnapshot()).length;
        const active = workspace.getSnapshot().selection.columns.length;
        const summaryText = total > 0
            ? `${active} of ${total} active. Click chips to add more.`
            : 'No numeric series available.';
        container.setAttribute('title', summaryText);
        container.setAttribute('aria-label', summaryText);
        const disclosureValue = document.getElementById('timeseries-series-disclosure-value');
        if (disclosureValue) disclosureValue.textContent = `${active} of ${total} active`;
    };

    renderSeriesChipList({
        container,
        items: items.map((item) => ({
            ...item,
            onToggle: (checked: boolean) => {
                item.onToggle(checked);
                syncSummary();
            },
        })),
        chipClass: 'timeseries-chip',
        onColorUpdate: (col, color) => {
            const chip = container.querySelector(`[data-col="${col}"]`) as HTMLElement | null;
            if (chip) chip.style.setProperty('--chip-accent', color);
        },
    });

    const colorSource = workspace.getSnapshot().selection.colorColumn;
    if (colorSource) {
        const sourceChip = Array.from(container.querySelectorAll<HTMLElement>('.series-chip'))
            .find((chip) => chip.dataset.col === colorSource);
        if (sourceChip) {
            sourceChip.classList.add('is-color-source');
            const badge = document.createElement('span');
            badge.className = 'scatter-filter-badge series-chip__color-source-badge';
            badge.textContent = 'Color source';
            sourceChip.appendChild(badge);
            sourceChip.title = `${sourceChip.title ? `${sourceChip.title}. ` : ''}${colorSource} is active as the coloring source.`;
        }
    }

    // Annotate the rail container with the active / total counts so the
    // information previously shown in the removed chip-status summary row
    // is still available via the native tooltip on hover/focus.
    syncSummary();

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
    rebuildColumns?: () => void,
) {
    return initFilterModalController({
        renderCurrentData,
        updateAnalysisYRange,
        workspace,
        openColumnFilter,
        getCurrentData,
        cleaningPlanStore,
        rebuildColumns,
    });
}
