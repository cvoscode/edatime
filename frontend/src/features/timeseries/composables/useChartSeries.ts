/**
 * useChartSeries — composable for series selection, color management,
 * and trace column derivation.
 *
 * Replaces the manual createMemo chains in TimeseriesPage for:
 * - allTraceColumns
 * - traceColumns (visible columns after filtering)
 * - colorPalette
 * - mergedColors (custom colors + palette fallback)
 *
 * Consumers get a stable reactive interface; UI state changes
 * (selectedColumns, hiddenColumns, colors) flow through the memos.
 */
import { createMemo, Accessor } from 'solid-js';
import { datasetStore } from '@/stores/datasetStore';
import { timeseriesStore } from '@/domain/timeseries/store';
import { uiStore } from '@/stores/uiStore';
import { getColorPalette } from '@/utils/colorScale';

export interface UseChartSeriesReturn {
    /** All numeric columns except the time axis */
    allTraceColumns: Accessor<string[]>;
    /** Trace columns with hidden ones excluded */
    traceColumns: Accessor<string[]>;
    /** Signal: selected columns from timeseriesStore */
    selectedColumns: Accessor<string[]>;
    /** Current color palette */
    colorPalette: Accessor<string[]>;
    /** Per-column color map (custom overrides + palette fallback) */
    mergedColors: Accessor<Record<string, string>>;
    /** Column bounds for all numeric columns */
    columnBounds: Accessor<Record<string, { min: number; max: number }>>;
    /** The time-axis column */
    xAxisColumn: Accessor<string | null>;
}

export function useChartSeries(): UseChartSeriesReturn {
    const xAxisColumn = createMemo(() =>
        datasetStore.state.xAxisColumn ?? datasetStore.state.metadata?.timestampColumn ?? null
    );

    const numericCols = createMemo(() => datasetStore.state.numericCols);

    const allTraceColumns = createMemo(() =>
        numericCols().filter(c => c !== xAxisColumn())
    );

    const selectedColumns = createMemo(() => {
        const s = timeseriesStore.state.selectedColumns;
        const xCol = xAxisColumn();
        if (s.length === 0) {
            return numericCols().filter(c => c !== xCol);
        }
        return s;
    });

    const traceColumns = createMemo(() =>
        selectedColumns().filter(c =>
            c !== xAxisColumn() && !timeseriesStore.state.hiddenColumns.includes(c)
        )
    );

    const colorPalette = createMemo(() =>
        getColorPalette(uiStore.state.colorScale, allTraceColumns().length)
    );

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
        for (const col of numericCols()) {
            const profile = datasetStore.state.columns.find(c => c.name === col);
            if (profile?.min !== undefined && profile?.max !== undefined) {
                bounds[col] = { min: profile.min, max: profile.max };
            }
        }
        return bounds;
    });

    return {
        allTraceColumns,
        traceColumns,
        selectedColumns,
        colorPalette,
        mergedColors,
        columnBounds,
        xAxisColumn,
    };
}