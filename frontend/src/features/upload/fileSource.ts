/**
 * File source logic — handles file selection, drag/drop, and upload submission.
 *
 * Upload progress is shown via the `upload-loading` overlay (the same
 * `chart-loading-overlay` pattern used by other pages); the legacy inline
 * progress bar has been removed.
 */
import {
    uploadDataset,
} from '../../services/api/index.js';
import { uploadProfile } from './profileState.js';
import { uploadUi } from './uploadUi.js';
import { setProfileMode } from './preview.js';
import { formatCount } from '../../utils/format.js';
import { toast } from '../../utils/toast.js';
import { validateFileSize } from './partialLoadControls.js';
import type { DatasetMetadata } from '../../types/api.js';

export { loadedRowCountFromResponse } from './preview.js';
export { formatUploadRowCountValue } from './partialLoadControls.js';

// ── Upload loading overlay helper ──────────────────────────────────────────────────

const UPLOAD_LOADING_ID = 'upload-loading';

function getUploadLoading(): HTMLElement | null {
    return document.getElementById(UPLOAD_LOADING_ID);
}

function showUploadLoading(show: boolean): void {
    const overlay = getUploadLoading();
    if (overlay) overlay.hidden = !show;
}

// ── Upload submission ────────────────────────────────────────────────────────

export interface FileUploadDeps {
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    refreshDatasetAfterMutation?: () => Promise<void>;
}

export interface FileUploadParams {
    signal?: AbortSignal;
    selectedFile: File;
    partialEnabled: boolean;
    nRowsInput: HTMLInputElement;
    skipInput: HTMLInputElement;
    timeStartInput: HTMLInputElement | null;
    timeEndInput: HTMLInputElement | null;
    uploadBtn: HTMLButtonElement;
    statusEl: HTMLElement | null;
    fileInput: HTMLInputElement;
    fileDisplay: HTMLElement;
    deps: FileUploadDeps;
    hydrateColumnProfiles: (metadata: DatasetMetadata) => void;
    renderColumnProfilesGrid: (resetScroll: boolean) => void;
}

export async function submitFileUpload(params: FileUploadParams): Promise<void> {
    const {
        selectedFile,
        partialEnabled,
        nRowsInput,
        skipInput,
        timeStartInput,
        timeEndInput,
        uploadBtn,
        statusEl,
        fileInput,
        fileDisplay,
        deps,
        hydrateColumnProfiles,
        renderColumnProfilesGrid,
    } = params;

    const invalidFileMsg = validateFileSize(selectedFile);
    if (invalidFileMsg) {
        statusEl!.textContent = invalidFileMsg;
        statusEl!.className = 'upload-status error';
        toast(invalidFileMsg, 'error', {});
        return;
    }

    if (!uploadUi.previewTimeColumn && !(uploadProfile.metadata && uploadProfile.metadata.time_range)) {
        statusEl!.textContent = 'No time column selected. Please choose a time column in the upload panel before ingest.';
        statusEl!.className = 'upload-status error';
        toast('No time column selected. Please choose a time column in the upload panel before ingest.', 'error', {});
        return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    if (partialEnabled) {
        const nRows = parseInt(nRowsInput.value, 10);
        const skipRows = parseInt(skipInput.value, 10) || 0;
        if (!isNaN(nRows) && nRows > 0) {
            formData.append('n_rows', String(nRows));
        } else {
            statusEl!.textContent = 'Enter a valid Max rows value for partial load.';
            statusEl!.className = 'upload-status error';
            toast('Enter a valid Max rows value for partial load.', 'error', {});
            uploadBtn.disabled = false;
            return;
        }
        if (skipRows > 0) formData.append('skip_rows', String(skipRows));

        const toIsoOrNull = (v: string): string | null => {
            const s = (v || '').trim();
            if (!s) return null;
            const ms = Date.parse(s);
            if (!Number.isFinite(ms)) return null;
            return new Date(ms).toISOString();
        };
        const tStartIso = toIsoOrNull(timeStartInput?.value || '');
        const tEndIso = toIsoOrNull(timeEndInput?.value || '');
        if (tStartIso && tEndIso && Date.parse(tStartIso) > Date.parse(tEndIso)) {
            statusEl!.textContent = 'Start time must be before end time.';
            statusEl!.className = 'upload-status error';
            toast('Start time must be before end time.', 'error', {});
            return;
        }
        if (tStartIso) formData.append('time_start', tStartIso);
        if (tEndIso) formData.append('time_end', tEndIso);
    }

    const selectedColumns = Array.isArray(uploadUi.previewSelectedColumns)
        ? uploadUi.previewSelectedColumns.filter(Boolean)
        : [];
    if (selectedColumns.length > 0) {
        formData.append('columns', JSON.stringify(selectedColumns));
    }

    const timeColumn = String(uploadUi.previewTimeColumn || '').trim();
    if (timeColumn) formData.append('time_column', timeColumn);

    uploadBtn.disabled = true;
    if (statusEl) {
        statusEl.textContent = 'Uploading…';
        statusEl.className = 'upload-status loading';
    }
    showUploadLoading(true);

    try {
        const res = await uploadDataset(formData, { signal: params.signal });
        const result = await res.json();
        if (params.signal?.aborted) return;
        if (statusEl) {
            statusEl.className = 'upload-status';
        }
        toast(`${formatCount(Number(result.rows || 0))} rows loaded. Dataset ready.`, 'success', {});
        fileInput.value = '';
        fileDisplay.textContent = '';

        try {
            if (deps.refreshDatasetAfterMutation) {
                await deps.refreshDatasetAfterMutation();
            } else {
                const { fetchMetadata } = await import('../../services/api/index.js');
                const freshMetadata = await fetchMetadata({ signal: params.signal });
                if (params.signal?.aborted) return;
                uploadProfile.metadata = freshMetadata;
                hydrateColumnProfiles(freshMetadata);
                renderColumnProfilesGrid(true);
                deps.buildColumnToggles();
                deps.buildRangeControls();
                setProfileMode('dataset');
            }
        } catch {
            if (params.signal?.aborted) return;
            // Fall back to reload if metadata refresh fails
            setTimeout(() => { if (!params.signal?.aborted) window.location.reload(); }, 1200);
        }
    } catch (e: unknown) {
        if (params.signal?.aborted) return;
        if (statusEl) {
            statusEl.textContent = 'Error: ' + (e instanceof Error ? e.message : String(e));
            statusEl.className = 'upload-status error';
        }
        toast(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 'error', {});
    } finally {
        showUploadLoading(false);
        uploadBtn.disabled = false;
    }
}
