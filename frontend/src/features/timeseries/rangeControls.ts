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
    appStateComposite as appState,
    setAdaptiveLineFilters,
    setPendingAdaptivePoint,
} from '../../store/index.js';
import { RangeControls, RangeControlItem } from '../../ui/composites/RangeControls.js';
import type { FilterWorkspace } from './selectionIntent.js';

/**
 * Render clickable range chips for selected columns and active adaptive filters.
 * Called whenever the selected column set or adaptive filter state changes.
 */
export function buildRangeControls(workspace: FilterWorkspace): void {
    const container = document.getElementById('column-range-controls');
    if (!container) return;
    container.innerHTML = '';

    const items: RangeControlItem[] = [];
    const snapshot = workspace.getSnapshot();
    const selectedColumns = snapshot.selection.columns;
    const filters = snapshot.filters;

    // Adaptive filter target chip (static — not clickable)
    if (appState.adaptiveFilterColumn && selectedColumns.includes(appState.adaptiveFilterColumn)) {
        items.push({
            key: 'adaptive-target',
            name: 'Adaptive target',
            range: appState.adaptiveFilterColumn,
            kind: 'static',
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
            kind: 'column-range',
            ariaLabel: `Filter ${col}`,
            onActivate: () => {
                const fn = window.__edatime?.openFilterForCol;
                if (typeof fn === 'function') fn(colCopy);
            },
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
            kind: 'filter-removal',
            ariaLabel: `Remove adaptive filter for ${filter.column}`,
            onActivate: () => {
                const nextAdaptiveLines = filters.adaptiveLines.filter(
                        (item) => (item as unknown as { id?: string }).id !== filterIdCopy,
                );
                workspace.setFilters({ ...filters, adaptiveLines: nextAdaptiveLines });
                setAdaptiveLineFilters(nextAdaptiveLines);
                setPendingAdaptivePoint(null);
                buildRangeControls(workspace);
                window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change'));
            },
        });
    }

    // Clear-all chip when any adaptive filters are active
    if (filters.adaptiveLines.length > 0 || appState.pendingAdaptivePoint) {
        items.push({
            key: 'clear-all',
            name: 'Adaptive filters',
            range: 'Clear all',
            className: 'range-chip range-chip--clickable',
            kind: 'clear-all',
            ariaLabel: 'Clear adaptive filters',
            onActivate: () => {
                workspace.setFilters({ ...filters, adaptiveLines: [] });
                setAdaptiveLineFilters([]);
                setPendingAdaptivePoint(null);
                buildRangeControls(workspace);
                (appState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();
                window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change'));
            },
        });
    }

    container.appendChild(RangeControls({ items }));
}
