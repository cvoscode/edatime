import { startDatasetProfile, fetchDatasetProfile } from '../../services/api/profile.js';
import type { DatasetMetadata } from '../../types/api.js';

export async function loadCurrentDatasetProfile(signal: AbortSignal, isCurrent: () => boolean, datasetUi: {
    hydrateColumnProfiles(metadata: DatasetMetadata): void;
    renderColumnProfilesGrid(reset: boolean): void;
    setUploadPreviewStatus(message: string): void;
}): Promise<void> {
    const active = () => !signal.aborted && isCurrent();
    const showStatus = (message: string) => {
        if (active() && document.getElementById('profile-mode-badge')?.getAttribute('data-mode') !== 'preview') {
            datasetUi.setUploadPreviewStatus(message);
        }
    };
    try {
        if (!active()) return;
        let response = await startDatasetProfile({ signal });
        let restarted = false;
        while (active()) {
            if (response.metadata) {
                if (document.getElementById('profile-mode-badge')?.getAttribute('data-mode') !== 'preview') {
                    datasetUi.hydrateColumnProfiles(response.metadata);
                    datasetUi.renderColumnProfilesGrid(false);
                    showStatus('Showing current dataset profile. Drop/select a file to preview before loading.');
                }
                return;
            }
            // Recover a missing/evicted profile job once, without restarting
            // deliberately cancelled jobs or repeatedly retrying failures.
            if (response.status === 'not_started' && !restarted) {
                restarted = true;
                response = await startDatasetProfile({ signal });
                continue;
            }
            if (!['queued', 'running', 'cancelling'].includes(response.status)) {
                showStatus(`Dataset profiling ${response.status === 'failed' ? 'failed' : 'did not complete'}${response.job?.message ? `: ${response.job.message}` : '.'} Reload the dataset to retry.`);
                return;
            }
            showStatus(`Profiling current dataset${response.job?.progressPercent != null ? ` (${response.job.progressPercent}%)` : ''}…`);
            await new Promise<void>((resolve) => setTimeout(resolve, 500));
            if (!active()) return;
            response = await fetchDatasetProfile({ signal });
        }
    } catch (error) {
        showStatus(`Could not load the dataset profile: ${error instanceof Error ? error.message : String(error)}. Reload the dataset to retry.`);
    }
}
