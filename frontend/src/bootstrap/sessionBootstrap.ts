import { getHashPage } from '../utils/router.js';
import {
    applySession,
    autoRestoreSession,
    exportSessionToFile,
    importSessionFromFile,
    initAutoSave,
} from '../utils/session.js';

interface RestoreSessionDeps {
    metadataTimeRange: { min: number; max: number } | null;
    currentDatasetRevision: number;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
}

export async function restoreSessionAfterChartReady(deps: RestoreSessionDeps): Promise<void> {
    const savedSession = autoRestoreSession();
    if (!savedSession) return;

    applySession(savedSession, {
        metadataTimeRange: deps.metadataTimeRange,
        currentDatasetRevision: deps.currentDatasetRevision,
        preferHashPage: !!getHashPage(),
    });
    deps.buildColumnToggles();
    deps.buildRangeControls();
    deps.renderCurrentData();
    await deps.fetchAndRender();
}

export function startSessionPersistence(): void {
    initAutoSave();
    (window as any).__edatime = (window as any).__edatime || {};
    (window as any).__edatime.exportSession = exportSessionToFile;
    (window as any).__edatime.importSession = importSessionFromFile;
}