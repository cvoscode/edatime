/**
 * features/timeseries/chipComposition — compose chip-list items from app state.
 *
 * Transforms current appState into the `SeriesChipListItem[]` shape consumed
 * by `renderSeriesChipList`. Encapsulates the state→item mapping so callers
 * don't need to know about store shape details. Extracted from buildColumnToggles
 * so the domain-to-item transformation stays testable and isolated.
 */
import {
    appStateComposite as appState,
    getSeriesColor,
    setAdaptiveFilterColumn,
    setPendingAdaptivePoint,
    setSeriesColor,
} from '../../store/index.js';
import { ensureAdaptiveTargetStillValid } from './columnSelection.js';
import { getTimeseriesSelection, setTimeseriesSelection, type SelectionWorkspace } from './selectionIntent.js';

export interface ChipCompositionOptions {
    workspace: SelectionWorkspace;
    filterText: string;
    renderCurrentDataFn: (() => void) | null;
    buildRangeControlsFn: () => void;
    fetchAndRender: () => void;
}

export interface ChipListItem {
    column: string;
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
    const selection = getTimeseriesSelection(workspace);

    const visibleCols = appState.numericCols.filter((col) => {
        if (!filterText) return true;
        return col.toLowerCase().includes(filterText.toLowerCase());
    });

    if (visibleCols.length === 0) return [];

    return visibleCols.map((col) => {
        const colIdx = appState.numericCols.indexOf(col);
        const color = getSeriesColor(col, colIdx >= 0 ? colIdx : 0);
        const isActive = selection.includes(col);
        const isAdaptiveTarget = isActive && appState.adaptiveFilterColumn === col;

        const chipTitle = isAdaptiveTarget
            ? `Adaptive filter target: ${col}`
            : `Ctrl+click to target adaptive filters to ${col}`;

        return {
            column: col,
            checked: isActive,
            color,
            adaptiveTarget: isAdaptiveTarget,
            title: chipTitle,
            onToggle: (checked: boolean) => {
                if (checked) {
                    if (!selection.includes(col)) setTimeseriesSelection(workspace, [...selection, col]);
                } else {
                    setTimeseriesSelection(workspace, selection.filter((column) => column !== col));
                }
                ensureAdaptiveTargetStillValid(workspace);
                buildRangeControlsFn();
                (appState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();
                fetchAndRender();
            },
            onColorInput: (nextColor: string) => {
                const updated = setSeriesColor(col, nextColor);
                if (!updated) return;
                renderCurrentDataFn?.();
            },
            onMenuClick: () => {
                const open = window.__edatime?.openFilterForCol;
                if (typeof open === 'function') open(col);
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
                (appState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();

                if (!hadColumn) fetchAndRender();
            },
            true, // capture phase
        );
    }
}
