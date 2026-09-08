import { getEffectiveNumericColumns } from '../../platform/analyticsColumns.js';
/**
 * features/timeseries/chipComposition — compose chip-list items from store slices.
 *
 * Transforms current selection/filter store slices into the `SeriesChipListItem[]` shape consumed
 * by `renderSeriesChipList`. Encapsulates the state→item mapping so callers
 * don't need to know about store shape details. Extracted from buildColumnToggles
 * so the domain-to-item transformation stays testable and isolated.
 */
import {
    setAdaptiveFilterColumn,
    setPendingAdaptivePoint,
    timeseriesInteraction,
} from './interaction.js';
import { getColumnSeriesColor, setSeriesColor } from '../../utils/seriesColors.js';
import { primaryChart } from '../../charts/primaryChart.js';
import { ensureAdaptiveTargetStillValid } from './columnSelection.js';
import { getTimeseriesSelection, setTimeseriesSelection, type SelectionWorkspace } from './selectionIntent.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { formatAnalysisNumber } from '../../utils/format.js';

export interface ChipCompositionOptions {
    workspace: SelectionWorkspace;
    filterText: string;
    renderCurrentDataFn: (() => void) | null;
    buildRangeControlsFn: () => void;
    fetchAndRender: () => void;
    openColumnFilter?: (column: string | null) => void;
}

export interface ChipListItem {
    column: string;
    label?: string;
    checked: boolean;
    color: string;
    adaptiveTarget: boolean;
    title: string;
    onToggle: (checked: boolean) => void;
    onColorInput: (nextColor: string) => void;
    onMenuClick: () => void;
    menuLabel: string;
}

export function composeChipListItems(options: ChipCompositionOptions): ChipListItem[] {
    const { filterText, buildRangeControlsFn, fetchAndRender, renderCurrentDataFn, workspace } = options;
    const openColumnFilter = options.openColumnFilter ?? (() => {});
    const selection = getTimeseriesSelection(workspace);

    const visibleCols = getEffectiveNumericColumns(workspace.getSnapshot().dataset.metadata, cleaningPlanStore.getSnapshot()).filter((col) => {
        if (!filterText) return true;
        return col.toLowerCase().includes(filterText.toLowerCase());
    });

    if (visibleCols.length === 0) return [];

    return visibleCols.map((col) => {
        const color = getColumnSeriesColor(col);
        const isActive = selection.includes(col);
        const isAdaptiveTarget = isActive && timeseriesInteraction.adaptiveFilterColumn === col;

        const chipTitle = isAdaptiveTarget
            ? `Adaptive filter target: ${col}`
            : `Ctrl+click to target adaptive filters to ${col}`;
        const range = workspace.getSnapshot().filters.columnRanges[col];
        const rangeLabel = range
            ? ` [${formatAnalysisNumber(range.from)}, ${formatAnalysisNumber(range.to)}]`
            : '';

        return {
            column: col,
            label: `${col}${rangeLabel}`,
            checked: isActive,
            color,
            adaptiveTarget: isAdaptiveTarget,
            title: range ? `${chipTitle}. Active filter ${range.from} to ${range.to}.` : chipTitle,
            onToggle: (checked: boolean) => {
                const currentSelection = getTimeseriesSelection(workspace);
                const nextSelection = checked
                    ? (currentSelection.includes(col) ? currentSelection : [...currentSelection, col])
                    : currentSelection.filter((column) => column !== col);
                setTimeseriesSelection(workspace, nextSelection);
                ensureAdaptiveTargetStillValid(workspace);
                buildRangeControlsFn();
                const updatedIncrementally = primaryChart.current?.setVisibleColumns?.(nextSelection) ?? false;
                primaryChart.current?.requestOverlayRender?.();
                if (!updatedIncrementally) fetchAndRender();
            },
            onColorInput: (nextColor: string) => {
                const updated = setSeriesColor(col, nextColor);
                if (!updated) return;
                const updatedIncrementally = primaryChart.current?.setColumnColor?.(col, updated) ?? false;
                primaryChart.current?.requestOverlayRender?.();
                if (!updatedIncrementally) renderCurrentDataFn?.();
            },
            onMenuClick: () => {
                openColumnFilter(col);
            },
            menuLabel: `Filter range for ${col}`,
        };
    });
}

export function bindChipCtrlClick(
    container: HTMLElement,
    rebuildAndRender: () => void,
    buildRangeControlsFn: () => void,
    renderCurrentDataFn: (() => void) | null,
    fetchAndRender: () => void,
    workspace: SelectionWorkspace,
): void {
    for (const chip of container.querySelectorAll<HTMLElement>('.series-chip')) {
        chip.addEventListener(
            'click',
            (e: MouseEvent) => {
                if ((e.target as HTMLElement)?.closest?.('.chip-color-picker')) return;
                if (!e.ctrlKey) return;
                e.preventDefault();
                e.stopPropagation();

                const input = chip.querySelector<HTMLInputElement>('input[type="checkbox"]');
                const col = input?.value;
                if (!col) return;

                const selection = getTimeseriesSelection(workspace);
                const hadColumn = selection.includes(col);
                if (!hadColumn) setTimeseriesSelection(workspace, [...selection, col]);
                setAdaptiveFilterColumn(col);
                setPendingAdaptivePoint(null);

                rebuildAndRender();
                (primaryChart.current as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();

                if (!hadColumn) fetchAndRender();
            },
            true, // capture phase
        );
    }
}
