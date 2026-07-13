import type { WorkspaceSnapshot } from '../../contracts/workspace.js';

export interface TimeseriesRequestIntent {
    start: number;
    end: number;
    columns: string[];
    colorColumn: string | null;
    key: string;
}

/**
 * Projects the shared workspace into the minimal state needed to fetch a
 * Timeseries window. The workspace is the canonical owner of viewport intent;
 * chart adapters only realize the resulting view.
 */
export function resolveTimeseriesRequestIntent(
    workspace: Pick<WorkspaceSnapshot, 'selection' | 'viewport'>,
): TimeseriesRequestIntent {
    const workspaceStart = workspace.viewport?.xMin == null ? Number.NaN : Number(workspace.viewport.xMin);
    const workspaceEnd = workspace.viewport?.xMax == null ? Number.NaN : Number(workspace.viewport.xMax);
    const start = workspaceStart;
    const end = workspaceEnd;
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
