import type { WorkspaceSnapshot } from '../../workspace/workspaceStore.js';

export interface TimeseriesRequestIntent {
    start: number;
    end: number;
    columns: string[];
    colorColumn: string | null;
    key: string;
}

/**
 * Projects the shared workspace into the minimal state needed to fetch a
 * Timeseries window. Chart state remains only as a transition fallback while
 * old callers finish publishing viewport intent to the workspace.
 */
export function resolveTimeseriesRequestIntent(
    workspace: Pick<WorkspaceSnapshot, 'selection' | 'viewport'>,
    fallbackViewport: { start: number | null; end: number | null },
): TimeseriesRequestIntent {
    const workspaceStart = workspace.viewport?.xMin == null ? Number.NaN : Number(workspace.viewport.xMin);
    const workspaceEnd = workspace.viewport?.xMax == null ? Number.NaN : Number(workspace.viewport.xMax);
    const start = Number.isFinite(workspaceStart) ? workspaceStart : Number(fallbackViewport.start);
    const end = Number.isFinite(workspaceEnd) ? workspaceEnd : Number(fallbackViewport.end);
    const columns = [...workspace.selection.columns];
    const colorColumn = workspace.selection.colorColumn;

    return {
        start,
        end,
        columns,
        colorColumn,
        key: `${columns.join(',')}|${colorColumn}`,
    };
}
