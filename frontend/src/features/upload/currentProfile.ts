import {
    fetchDatasetProfile,
    fetchSampledDatasetProfile,
    startDatasetProfile,
} from '../../services/api/profile.js';
import type { DatasetMetadata } from '../../types/api.js';
import type { DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';
import {
    datasetProfileKind,
    datasetProfiles,
    matchesProfileSource,
    type DatasetProfileKind,
    type DatasetProfileSource,
} from '../../services/profile/datasetProfiles.js';

export interface CurrentDatasetProfileUi {
    hydrateColumnProfiles(metadata: DatasetMetadata): void;
    renderColumnProfilesGrid(reset: boolean): void;
    setUploadPreviewStatus(message: string): void;
    applyTimeRangeFromMetadata?(metadata: DatasetMetadata, overwriteInputs?: boolean): void;
    setProfileMode?(mode: 'dataset' | 'preview' | 'exact' | 'sampled' | 'unavailable'): void;
}

function sourceFromMetadata(metadata: DatasetMetadata): DatasetProfileSource | null {
    const id = String(metadata.source_version_id || '').trim();
    if (!id) return null;
    const revision = Number(metadata.source_version_revision ?? metadata.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) return null;
    return {
        id,
        revision,
        datasetFingerprint: String(metadata.dataset_fingerprint || '').trim() || null,
    };
}

function isRunning(status: DatasetProfileResponse['status']): boolean {
    return ['queued', 'running', 'cancelling'].includes(status);
}

function isPreviewMode(): boolean {
    return document.getElementById('profile-mode-badge')?.getAttribute('data-mode') === 'preview';
}

export async function loadCurrentDatasetProfile(
    signal: AbortSignal,
    isCurrent: () => boolean,
    metadata: DatasetMetadata,
    datasetUi: CurrentDatasetProfileUi,
    options: { buildExact?: boolean } = {},
): Promise<void> {
    const source = sourceFromMetadata(metadata);
    const buildButton = document.getElementById('upload-profile-build-btn') as HTMLButtonElement | null;
    const active = () => !signal.aborted && isCurrent();
    const canRender = () => active() && !isPreviewMode();
    const showStatus = (message: string) => {
        if (canRender()) datasetUi.setUploadPreviewStatus(message);
    };
    const setBuildAvailable = (available: boolean) => {
        if (buildButton && canRender()) buildButton.hidden = !available;
    };
    if (!active() || isPreviewMode()) return;

    datasetUi.setProfileMode?.(metadata.profile_status === 'exact' ? 'exact' : metadata.profile_status === 'sampled' ? 'sampled' : 'unavailable');
    datasetUi.applyTimeRangeFromMetadata?.(metadata, false);
    datasetUi.hydrateColumnProfiles(metadata);
    datasetUi.renderColumnProfilesGrid(false);
    if (!source) {
        setBuildAvailable(false);
        showStatus('Current dataset source identity is unavailable, so its profile cannot be recovered.');
        return;
    }

    const getProfile = (kind: DatasetProfileKind) => kind === 'exact' ? fetchDatasetProfile : fetchSampledDatasetProfile;
    const startExact = () => startDatasetProfile({ signal });
    const cachedProfile = (): DatasetProfileResponse | null => {
        for (const kind of ['exact', 'sampled'] as const) {
            const cached = datasetProfiles.get(source, kind);
            if (cached && matchesProfileSource(source, cached)
                && (cached.status === 'ready' || isRunning(cached.status))) return cached;
        }
        return null;
    };

    const accept = (response: DatasetProfileResponse, kind: DatasetProfileKind): boolean => {
        if (!canRender()) return false;
        if (!matchesProfileSource(source, response) || datasetProfileKind(response) !== kind) {
            setBuildAvailable(true);
            showStatus('The saved profile no longer matches the active dataset. Reload the dataset profile.');
            return false;
        }
        if (response.status === 'ready' && response.metadata) {
            datasetUi.hydrateColumnProfiles(response.metadata);
            datasetUi.renderColumnProfilesGrid(false);
            datasetUi.setProfileMode?.(kind);
            setBuildAvailable(false);
            showStatus(`Showing ${kind === 'exact' ? 'exact' : 'sampled'} profile for the active dataset.`);
            return false;
        }
        if (isRunning(response.status)) {
            setBuildAvailable(false);
            const progress = response.job?.progressPercent;
            showStatus(`Profiling current dataset${progress != null ? ` (${progress}%)` : ''}…`);
            return true;
        }
        if (response.status === 'failed') {
            setBuildAvailable(true);
            showStatus(`Dataset profiling failed${response.job?.message ? `: ${response.job.message}` : '.'} Build a new exact report to retry.`);
            return false;
        }
        setBuildAvailable(true);
        showStatus(response.status === 'cancelled'
            ? 'Dataset profiling was cancelled. Build an exact report to try again.'
            : 'No completed profile is available. Build an exact report when you need column statistics.');
        return false;
    };

    const pollUntilDone = async (kind: DatasetProfileKind, initial: DatasetProfileResponse): Promise<void> => {
        let response = initial;
        while (active() && isRunning(response.status)) {
            await new Promise<void>((resolve) => {
                const finish = () => {
                    clearTimeout(timer);
                    signal.removeEventListener('abort', finish);
                    resolve();
                };
                const timer = setTimeout(finish, 500);
                signal.addEventListener('abort', finish, { once: true });
            });
            if (!active()) return;
            try {
                response = await getProfile(kind)({ signal });
                if (!accept(response, kind)) return;
            } catch (error) {
                if (!active()) return;
                setBuildAvailable(true);
                showStatus(`Could not load the current dataset profile: ${error instanceof Error ? error.message : String(error)}.`);
                return;
            }
        }
    };

    if (options.buildExact) {
        setBuildAvailable(false);
        showStatus('Starting exact column profiling…');
        try {
            let response = await startExact();
            if (!active()) return;
            if (response.status === 'not_started') response = await startExact();
            const shouldPoll = accept(response, 'exact');
            if (shouldPoll) await pollUntilDone('exact', response);
            else if (response.status === 'not_started') {
                setBuildAvailable(true);
                showStatus('Exact profiling did not start. Try building the report again.');
            }
        } catch (error) {
            if (!active()) return;
            setBuildAvailable(true);
            showStatus(`Could not start exact profiling: ${error instanceof Error ? error.message : String(error)}.`);
        }
        return;
    }

    const cached = cachedProfile();
    if (cached) {
        const kind = datasetProfileKind(cached)!;
        if (accept(cached, kind)) await pollUntilDone(kind, cached);
        return;
    }

    showStatus('Checking for a saved column profile…');
    let failedMessage = '';
    for (const kind of ['exact', 'sampled'] as const) {
        if (!active()) return;
        try {
            const response = await getProfile(kind)({ signal });
            if (!active()) return;
            if (!matchesProfileSource(source, response) || datasetProfileKind(response) !== kind) continue;
            if (response.status === 'failed') {
                failedMessage = response.job?.message || 'The previous profile job failed.';
                continue;
            }
            if (response.status === 'not_started') continue;
            if (accept(response, kind)) await pollUntilDone(kind, response);
            return;
        } catch (error) {
            if (!active()) return;
            failedMessage = error instanceof Error ? error.message : String(error);
        }
    }
    if (!active()) return;
    setBuildAvailable(true);
    showStatus(failedMessage
        ? `No usable saved profile was recovered (${failedMessage}). Build an exact report when you need column statistics.`
        : 'No saved column profile is available. Build an exact report when you need column statistics.');
}
