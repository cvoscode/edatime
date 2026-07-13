import { getHashPage } from '../utils/router.js';
import {
    applySession,
    autoRestoreSession,
    configureSessionWorkspace,
    initAutoSave,
} from '../utils/session.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

interface RestoreSessionDeps {
    metadataTimeRange: { min: number; max: number } | null;
    currentDatasetRevision: number;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setSelection' | 'setFilters' | 'setViewport' | 'subscribe'>;
}

export async function restoreSessionAfterChartReady(deps: RestoreSessionDeps): Promise<void> {
    const savedSession = autoRestoreSession();
    if (!savedSession) return;

    applySession(savedSession, {
        metadataTimeRange: deps.metadataTimeRange,
        currentDatasetRevision: deps.currentDatasetRevision,
        preferHashPage: !!getHashPage(),
        workspace: deps.workspace,
    });
    deps.buildColumnToggles();
    deps.buildRangeControls();
    deps.renderCurrentData();
    await deps.fetchAndRender();
}

export function startSessionPersistence(workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setSelection' | 'setFilters' | 'setViewport' | 'subscribe'>): () => void {
    configureSessionWorkspace(workspace);
    return initAutoSave();
}
