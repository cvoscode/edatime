/**
 * useSeriesSelection — manages selected, hidden, and color state for series columns.
 *
 * Provides:
 * - selectedColumns: signal of currently selected series columns
 * - visibleColumns: memo of selected minus hidden
 * - allTraceColumns: memo of all numeric columns except x-axis
 * - mergedColors: memo combining store colors with palette defaults
 * - setColumnColor, toggleVisibility, setColorColumn actions
 */
import { createMemo } from 'solid-js';
import { datasetStore } from '@/stores/datasetStore';
import { uiStore } from '@/stores/uiStore';
import { timeseriesStore, setSelectedColumns, setHiddenColumns, setColumnColor, setColorColumn } from '../domain/store';
import { getColorPalette, type ColorScaleName } from '@/utils/colorScale';

export interface UseSeriesSelectionResult {
    /** All numeric columns (excluding x-axis) */
    allTraceColumns: () => string[];
    /** Selected columns for charting */
    selectedColumns: () => string[];
    /** Visible columns (selected - hidden) */
    visibleColumns: () => string[];
    /** Per-column color map (store + palette defaults) */
    mergedColors: () => Record<string, string>;
    /** Per-column data range */
    columnBounds: () => Record<string, { min: number; max: number }>;
    /** Actions */
    setColumnColor: (col: string, color: string) => void;
    toggleVisibility: (col: string) => void;
    setColorColumn: (col: string | null) => void;
    setSelectedColumns: (cols: string[]) => void;
}

export function useSeriesSelection(): UseSeriesSelectionResult {
    const allTraceColumns = createMemo(() => {
        const xCol = datasetStore.state.xAxisColumn;
        return datasetStore.state.numericCols.filter(c => c !== xCol);
    });

    const selectedColumns = createMemo(() => {
        const s = timeseriesStore.state.selectedColumns;
        const xCol = datasetStore.state.xAxisColumn;
        if (s.length === 0) {
            // Default: all non-x-axis numeric columns
            return allTraceColumns();
        }
        return s;
    });

    const visibleColumns = createMemo(() => {
        const hidden = timeseriesStore.state.hiddenColumns;
        return selectedColumns().filter(c => !hidden.includes(c));
    });

    const colorPalette = createMemo(() => {
        const scale = uiStore.state.colorScale as ColorScaleName;
        return getColorPalette(scale, allTraceColumns().length);
    });

    const mergedColors = createMemo(() => {
        const result: Record<string, string> = { ...timeseriesStore.state.colors };
        allTraceColumns().forEach((col, idx) => {
            if (!result.hasOwnProperty(col)) {
                result[col] = colorPalette()[idx % colorPalette().length];
            }
        });
        return result;
    });

    const columnBounds = createMemo(() => {
        const bounds: Record<string, { min: number; max: number }> = {};
        for (const col of datasetStore.state.numericCols) {
            const profile = datasetStore.state.columns.find(c => c.name === col);
            if (profile?.min !== undefined && profile?.max !== undefined) {
                bounds[col] = { min: profile.min, max: profile.max };
            }
        }
        return bounds;
    });

    return {
        allTraceColumns,
        selectedColumns,
        visibleColumns,
        mergedColors,
        columnBounds,
        setColumnColor,
        toggleVisibility: (col: string) => timeseriesStore.toggleColumnVisibility(col),
        setColorColumn,
        setSelectedColumns,
    };
}