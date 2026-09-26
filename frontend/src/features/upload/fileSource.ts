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

export type FileUploadResult =
    | { status: 'success'; metadata?: DatasetMetadata }
    | { status: 'failed' | 'ignored' | 'invalid' };

export interface FileUploadParams {
    signal?: AbortSignal;
    selectedFile: File;
    previewMetadata: DatasetMetadata;
    selectedColumns: readonly string[];
    timeColumn: string | null;
    partialEnabled: boolean;
    nRowsInput: HTMLInputElement;
    skipInput: HTMLInputElement;
    timeStartInput: HTMLInputElement | null;
    timeEndInput: HTMLInputElement | null;
    statusEl: HTMLElement | null;
    deps: FileUploadDeps;
}

export function getPreviewConfigurationError(
    metadata: DatasetMetadata | null | undefined,
    selectedColumns: readonly string[],
    timeColumn: string | null,
): string | null {
    if (!metadata || !Array.isArray(metadata.columns)) return 'Preview this file before ingesting it.';
    const availableColumns = new Set(metadata.columns
        .map((column) => String(column?.name ?? '').trim())
        .filter(Boolean));
    if (selectedColumns.some((column) => !availableColumns.has(String(column).trim()))) {
        return 'The selected columns do not match this file preview. Preview the file again.';
    }

    const selectedTimeColumn = String(timeColumn ?? '').trim();
    if (selectedTimeColumn && !availableColumns.has(selectedTimeColumn)) {
        return 'The selected time column is not present in this file preview.';
    }
    const min = metadata.time_range?.min;
    const max = metadata.time_range?.max;
    const hasDetectedTimeRange = min != null && max != null
        && Number.isFinite(Number(min)) && Number.isFinite(Number(max));
    if (!selectedTimeColumn && !hasDetectedTimeRange) {
        return 'No time column selected. Please choose a time column in the upload panel before ingest.';
    }
    return null;
}

export async function submitFileUpload(params: FileUploadParams): Promise<FileUploadResult> {
    const {
        selectedFile,
        previewMetadata,
        selectedColumns: previewSelectedColumns,
        timeColumn: previewTimeColumn,
        partialEnabled,
        nRowsInput,
        skipInput,
        timeStartInput,
        timeEndInput,
        statusEl,
        deps,
    } = params;

    const invalidFileMsg = validateFileSize(selectedFile);
    if (invalidFileMsg) {
        if (statusEl) {
            statusEl.textContent = invalidFileMsg;
            statusEl.className = 'upload-status error';
        }
        toast(invalidFileMsg, 'error', {});
        return { status: 'invalid' };
    }

    const previewError = getPreviewConfigurationError(previewMetadata, previewSelectedColumns, previewTimeColumn);
    if (previewError) {
        if (statusEl) {
            statusEl.textContent = previewError;
            statusEl.className = 'upload-status error';
        }
        toast(previewError, 'error', {});
        return { status: 'invalid' };
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    if (partialEnabled) {
        const nRows = parseInt(nRowsInput.value, 10);
        const skipRows = parseInt(skipInput.value, 10) || 0;
        if (!isNaN(nRows) && nRows > 0) {
            formData.append('n_rows', String(nRows));
        } else {
            if (statusEl) {
                statusEl.textContent = 'Enter a valid Max rows value for partial load.';
                statusEl.className = 'upload-status error';
            }
            toast('Enter a valid Max rows value for partial load.', 'error', {});
            return { status: 'invalid' };
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
            if (statusEl) {
                statusEl.textContent = 'Start time must be before end time.';
                statusEl.className = 'upload-status error';
            }
            toast('Start time must be before end time.', 'error', {});
            return { status: 'invalid' };
        }
        if (tStartIso) formData.append('time_start', tStartIso);
        if (tEndIso) formData.append('time_end', tEndIso);
    }

    const selectedColumns = previewSelectedColumns.filter(Boolean);
    if (selectedColumns.length > 0) {
        formData.append('columns', JSON.stringify(selectedColumns));
    }

    const timeColumn = String(previewTimeColumn || '').trim();
    if (timeColumn) formData.append('time_column', timeColumn);

    if (statusEl) {
        statusEl.textContent = 'Uploading…';
        statusEl.className = 'upload-status loading';
    }
    showUploadLoading(true);

    try {
        const res = await uploadDataset(formData, { signal: params.signal });
        const result = await res.json();
        if (params.signal?.aborted) return { status: 'ignored' };
        if (statusEl) {
            statusEl.className = 'upload-status';
        }
        toast(`${formatCount(Number(result.rows || 0))} rows loaded. Dataset ready.`, 'success', {});

        let refreshedMetadata: DatasetMetadata | undefined;
        try {
            if (deps.refreshDatasetAfterMutation) {
                await deps.refreshDatasetAfterMutation();
            } else {
                const { fetchMetadata } = await import('../../services/api/index.js');
                const freshMetadata = await fetchMetadata({ signal: params.signal });
                if (params.signal?.aborted) return { status: 'ignored' };
                refreshedMetadata = freshMetadata;
                deps.buildColumnToggles();
                deps.buildRangeControls();
            }
        } catch {
            if (params.signal?.aborted) return { status: 'ignored' };
            // Fall back to reload if metadata refresh fails
            setTimeout(() => { if (!params.signal?.aborted) window.location.reload(); }, 1200);
        }
        return { status: 'success', metadata: refreshedMetadata };
    } catch (e: unknown) {
        if (params.signal?.aborted) return { status: 'ignored' };
        if (statusEl) {
            statusEl.textContent = 'Error: ' + (e instanceof Error ? e.message : String(e));
            statusEl.className = 'upload-status error';
        }
        toast(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 'error', {});
        return { status: 'failed' };
    } finally {
        showUploadLoading(false);
    }
}
