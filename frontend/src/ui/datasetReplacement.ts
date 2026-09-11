import type { WorkspaceStore } from '../contracts/workspace.js';

export type DatasetReplacementWorkspace = Pick<WorkspaceStore, 'getSnapshot'>;

/**
 * Ask before replacing a populated workspace. Loading the first dataset never
 * prompts; replacing an existing source always names both sides of the action.
 */
export function confirmDatasetReplacement(
    workspace: DatasetReplacementWorkspace | undefined,
    incomingName: string,
    confirmAction: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
    const snapshot = workspace?.getSnapshot();
    const metadata = snapshot?.dataset.metadata;
    if (!metadata || Number(metadata.total_rows || 0) <= 0) return true;

    const activeName = String(metadata.source_name || snapshot?.dataset.activeSourceVersionId || 'the active dataset');
    const filterCount = Object.keys(snapshot?.filters.columnRanges ?? {}).length
        + (snapshot?.filters.adaptiveLines.length ?? 0);
    const stateSummary = [
        snapshot?.selection.columns.length ? `${snapshot.selection.columns.length} selected series` : '',
        filterCount ? `${filterCount} active filter${filterCount === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' and ');
    const suffix = stateSummary ? ` The workspace currently has ${stateSummary}; dataset-specific state will reset.` : '';

    return confirmAction(`Replace ${activeName} with ${incomingName}?${suffix}`);
}
