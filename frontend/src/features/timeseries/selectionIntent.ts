import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export type SelectionWorkspace = Pick<WorkspaceStore, 'getSnapshot' | 'setSelection'>;
export type FilterWorkspace = Pick<WorkspaceStore, 'getSnapshot' | 'setFilters'>;
export type TimeseriesWorkspace = SelectionWorkspace & FilterWorkspace & Pick<WorkspaceStore, 'setViewport'>;

/** Updates the canonical Timeseries selection. */
export function setTimeseriesSelection(workspace: SelectionWorkspace, columns: readonly string[]): void {
    const colorColumn = workspace.getSnapshot().selection.colorColumn;
    workspace.setSelection(columns, colorColumn);
}

export function getTimeseriesSelection(workspace: SelectionWorkspace): readonly string[] {
    return workspace.getSnapshot().selection.columns;
}
