import { setSelectedCols } from '../../store/index.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export type SelectionWorkspace = Pick<WorkspaceStore, 'getSnapshot' | 'setSelection'>;
export type FilterWorkspace = Pick<WorkspaceStore, 'getSnapshot' | 'setFilters'>;
export type TimeseriesWorkspace = SelectionWorkspace & FilterWorkspace;

/**
 * Updates the canonical workspace selection and mirrors it to the legacy
 * rendering state until chart overlays are migrated to WorkspaceStore.
 */
export function setTimeseriesSelection(workspace: SelectionWorkspace, columns: readonly string[]): void {
    const colorColumn = workspace.getSnapshot().selection.colorColumn;
    workspace.setSelection(columns, colorColumn);
    setSelectedCols([...columns]);
}

export function getTimeseriesSelection(workspace: SelectionWorkspace): readonly string[] {
    return workspace.getSnapshot().selection.columns;
}
