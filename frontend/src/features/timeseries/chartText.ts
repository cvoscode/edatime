import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

type TimeseriesAppearance = ReturnType<WorkspaceStore['getSnapshot']>['appearance'];

/**
 * Resolve truthful default labels for the current Signals view.
 *
 * Source files do not carry engineering-unit metadata today. Keep the axis
 * concise without inventing units; the legend already identifies each trace.
 */
export function getDefaultTimeseriesChartText(
    appearance: TimeseriesAppearance | undefined,
    selectedColumns: readonly string[] = [],
): { title: string; xLabel: string; yLabel: string } {
    const configured = appearance?.chartText;
    const seriesLabel = selectedColumns.length === 1
        ? `${selectedColumns[0]} value`
        : selectedColumns.length > 1 ? 'Series values' : 'Value';
    return {
        title: configured?.title || '',
        xLabel: configured?.xLabel || `Time (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
        yLabel: configured?.yLabel || seriesLabel,
    };
}
