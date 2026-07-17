import {
    applyColumnRangesToData,
    clipDataToViewport,
} from '../../services/timeseries/filtering.js';
import { isRangeOutsideDataset, type EmptyStateViewModel } from '../../ui/emptyState.js';
import type {
    AdaptiveLineFilter,
    ColumnRange,
} from '../../types/store.js';
import type { SpectralFilterPreview } from '../../types/analytics.js';
import type { DataObject, TimeRange } from '../../types/api.js';
import type { FilteredDataObject } from '../../types/chart.js';

const HIDDEN_EMPTY_STATE: EmptyStateViewModel = {
    visible: false,
    reason: '',
    title: '',
    message: '',
    showResetAction: false,
};

export type TimeseriesRenderModel =
    | { kind: 'no-selection'; emptyState: EmptyStateViewModel }
    | { kind: 'awaiting-data'; emptyState: EmptyStateViewModel }
    | { kind: 'empty'; emptyState: EmptyStateViewModel; viewport: { start: number; end: number } }
    | { kind: 'data'; emptyState: EmptyStateViewModel; data: FilteredDataObject; displayColumns: string[] };

export function buildTimeseriesRenderModel(input: {
    data: DataObject | null;
    selectedColumns: readonly string[];
    viewport: { start: number; end: number };
    columnRanges: Record<string, ColumnRange>;
    adaptiveLineFilters: readonly AdaptiveLineFilter[];
    datasetRange: TimeRange | null | undefined;
    spectralPreview: SpectralFilterPreview | null;
}): TimeseriesRenderModel {
    const selectedColumns = [...input.selectedColumns];
    if (selectedColumns.length === 0) {
        return {
            kind: 'no-selection',
            emptyState: {
                visible: true,
                reason: 'no-columns-selected',
                title: 'Select one or more series',
                message: 'Click a column chip above to add it to the chart. Start with 2-3 related columns for a clearer first view.',
                showResetAction: false,
            },
        };
    }

    if (!input.data) return { kind: 'awaiting-data', emptyState: HIDDEN_EMPTY_STATE };

    const viewportData = clipDataToViewport(input.data, input.viewport.start, input.viewport.end);
    const filtered = applyColumnRangesToData(
        viewportData,
        selectedColumns,
        input.columnRanges,
        input.adaptiveLineFilters,
    );
    const hasPoints = selectedColumns.some((column) => {
        const y = filtered.series[column]?.y;
        return !!y && Array.from(y).some(Number.isFinite);
    });
    if (!hasPoints) {
        const rangeOutside = isRangeOutsideDataset(input.datasetRange, input.viewport.start, input.viewport.end);
        return {
            kind: 'empty',
            viewport: input.viewport,
            emptyState: {
                visible: true,
                reason: rangeOutside ? 'linked-range-outside-dataset' : 'no-data-after-filters',
                title: rangeOutside ? 'Current range is outside this dataset' : 'No points match current filters',
                message: rangeOutside
                    ? 'Reset to dataset range to recover visible data.'
                    : 'Try widening the time range or clearing filters.',
                showResetAction: true,
            },
        };
    }

    if (!input.spectralPreview || input.spectralPreview.ts.length === 0 || input.spectralPreview.values.length === 0) {
        return {
            kind: 'data',
            emptyState: HIDDEN_EMPTY_STATE,
            data: filtered,
            displayColumns: selectedColumns,
        };
    }

    const previewKey = `${input.spectralPreview.column} [filtered]`;
    return {
        kind: 'data',
        emptyState: HIDDEN_EMPTY_STATE,
        data: {
            ...filtered,
            series: {
                ...filtered.series,
                [previewKey]: {
                    x: Float64Array.from(input.spectralPreview.ts),
                    y: Float64Array.from(input.spectralPreview.values),
                },
            },
        },
        displayColumns: selectedColumns.includes(previewKey)
            ? selectedColumns
            : [...selectedColumns, previewKey],
    };
}
