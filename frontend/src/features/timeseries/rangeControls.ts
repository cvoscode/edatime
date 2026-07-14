/**
 * features/timeseries/rangeControls — range filter chip rendering.
 *
 * Builds the clickable range chips shown below the column-toggles strip.
 * Each chip opens the column-filter modal for that column.
 *
 * Architecture: this file is a state-to-items composer. It derives
 * RangeControlItem[] from current Timeseries state and delegates
 * DOM construction to the canonical RangeControls surface.
 */
import { formatAnalysisNumber } from '../../utils/format.js';
import {
    setPendingAdaptivePoint,
    uiState,
} from '../../store/uiState.js';
import { chartState } from '../../store/chartState.js';
import { RangeControls, RangeControlItem } from '../../ui/composites/RangeControls.js';
import type { FilterWorkspace } from './selectionIntent.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';

/**
 * Render clickable range chips for selected columns and active adaptive filters.
 * Called whenever the selected column set or adaptive filter state changes.
 */
export function buildRangeControls(
    workspace: FilterWorkspace,
    openColumnFilter: (column: string | null) => void = () => {},
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'removeStage'>,
): void {
    const container = document.getElementById('column-range-controls');
    if (!container) return;
    container.innerHTML = '';

    const items: RangeControlItem[] = [];
    const snapshot = workspace.getSnapshot();
    const selectedColumns = snapshot.selection.columns;
    const filters = snapshot.filters;
    const activePlan = cleaningPlanStore?.getSnapshot();

    const removePlanAdaptiveStage = (filter: { column: string; x1: number; y1: number; x2: number; y2: number }) => {
        if (!activePlan || !cleaningPlanStore) return false;
        const stage = activePlan.stages.find((candidate) => candidate.kind === 'adaptiveLine'
            && candidate.sourcePage === 'timeseries'
            && candidate.column === filter.column
            && candidate.x1Ms === filter.x1
            && candidate.y1 === filter.y1
            && candidate.x2Ms === filter.x2
            && candidate.y2 === filter.y2);
        if (!stage) return false;
        cleaningPlanStore.removeStage(stage.id);
        return true;
    };

    // Adaptive filter target chip (static — not clickable)
    if (uiState.adaptiveFilterColumn && selectedColumns.includes(uiState.adaptiveFilterColumn)) {
        items.push({
            key: 'adaptive-target',
            name: 'Adaptive target',
            range: uiState.adaptiveFilterColumn,
        });
    }

    // Per-column range chips — clickable, opens filter modal for that column
    for (const col of selectedColumns) {
        const range = filters.columnRanges[col];
        if (!range) continue;

        const colCopy = col; // capture for closure
        items.push({
            key: `col-${col}`,
            name: col,
            range: `${formatAnalysisNumber(range.from)} → ${formatAnalysisNumber(range.to)}`,
            className: 'range-chip range-chip--clickable',
            ariaLabel: `Filter ${col}`,
            onActivate: () => { openColumnFilter(colCopy); },
        });
    }

    // Adaptive line-filter removal chips — clickable
    for (const filter of filters.adaptiveLines) {
        const filterId = (filter as unknown as { id?: string }).id ?? '';
        const filterIdCopy = filterId; // capture for closure
        items.push({
            key: `filter-${filterId}`,
            name: `Adaptive ${filter.column}`,
            range: filter.keepAbove ? 'keep above' : 'keep below',
            className: 'range-chip range-chip--clickable',
            ariaLabel: `Remove adaptive filter for ${filter.column}`,
            onActivate: () => {
                if (removePlanAdaptiveStage(filter)) {
                    setPendingAdaptivePoint(null);
                    buildRangeControls(workspace, openColumnFilter, cleaningPlanStore);
                    return;
                }
                const nextAdaptiveLines = filters.adaptiveLines.filter(
                        (item) => (item as unknown as { id?: string }).id !== filterIdCopy,
                );
                workspace.setFilters({ ...filters, adaptiveLines: nextAdaptiveLines });
                setPendingAdaptivePoint(null);
                buildRangeControls(workspace, openColumnFilter, cleaningPlanStore);
            },
        });
    }

    // Clear-all chip when any adaptive filters are active
    if (filters.adaptiveLines.length > 0 || uiState.pendingAdaptivePoint) {
        items.push({
            key: 'clear-all',
            name: 'Adaptive filters',
            range: 'Clear all',
            className: 'range-chip range-chip--clickable',
            ariaLabel: 'Clear adaptive filters',
            onActivate: () => {
                if (activePlan && cleaningPlanStore) {
                    for (const stage of activePlan.stages) {
                        if (stage.kind === 'adaptiveLine' && stage.sourcePage === 'timeseries') {
                            cleaningPlanStore.removeStage(stage.id);
                        }
                    }
                    setPendingAdaptivePoint(null);
                    buildRangeControls(workspace, openColumnFilter, cleaningPlanStore);
                    return;
                }
                workspace.setFilters({ ...filters, adaptiveLines: [] });
                setPendingAdaptivePoint(null);
                buildRangeControls(workspace, openColumnFilter, cleaningPlanStore);
                (chartState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();
            },
        });
    }

    container.appendChild(RangeControls({ items }));
}
