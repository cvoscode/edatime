/**
 * File source logic — handles file selection, drag/drop, and upload submission.
 */
import {
    uploadDataset,
} from '../../services/api/index.js';
import { appState } from '../../store/appStateCompat.js';
import {
    setMetadata,
    setDatasetRevision,
} from '../../store/index.js';
import { buildMetaBar } from '../../ui/metaBar.js';
import { formatCount } from '../../utils/format.js';
import { toast } from '../../utils/toast.js';
import { validateFileSize } from './partialLoadControls.js';
import type { DatasetMetadata } from '../../types.js';

export { loadedRowCountFromResponse } from './preview.js';
export { formatUploadRowCountValue } from './partialLoadControls.js';

// ── Progress animation ───────────────────────────────────────────────────────

export function animateProgress(bar: HTMLElement, wrap: HTMLElement | null): () => void {
    let w = 0;
    if (wrap) wrap.setAttribute('aria-valuenow', '0');
    const t = setInterval(() => {
        w = Math.min(w + Math.random() * 8, 85);
        bar.style.width = w + '%';
        if (wrap) wrap.setAttribute('aria-valuenow', String(Math.round(w)));
        if (w >= 85) clearInterval(t);
    }, 120);
    return () => {
        clearInterval(t);
        if (wrap) {
            const current = Number(wrap.getAttribute('aria-valuenow') || '0');
            wrap.setAttribute('aria-valuenow', String(Math.max(current, 100)));
        }
    };
}

// ── Upload submission ────────────────────────────────────────────────────────

export interface FileUploadDeps {
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
}

export interface FileUploadParams {
    selectedFile: File;
    partialEnabled: boolean;
    nRowsInput: HTMLInputElement;
    skipInput: HTMLInputElement;
    timeStartInput: HTMLInputElement | null;
    timeEndInput: HTMLInputElement | null;
    uploadBtn: HTMLButtonElement;
    statusEl: HTMLElement;
    progressWrap: HTMLElement;
    progressBar: HTMLElement;
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
        progressWrap,
        progressBar,
        fileInput,
        fileDisplay,
        deps,
        hydrateColumnProfiles,
        renderColumnProfilesGrid,
    } = params;

    const invalidFileMsg = validateFileSize(selectedFile);
    if (invalidFileMsg) {
        statusEl.textContent = invalidFileMsg;
        statusEl.className = 'upload-status error';
        toast(invalidFileMsg, 'error', {});
        return;
    }

    if (!appState.previewTimeColumn && !(appState.metadata && appState.metadata.time_range)) {
        statusEl.textContent = 'No time column selected. Please choose a time column in the upload panel before ingest.';
        statusEl.className = 'upload-status error';
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
            statusEl.textContent = 'Enter a valid Max rows value for partial load.';
            statusEl.className = 'upload-status error';
            toast('Enter a valid Max rows value for partial load.', 'error', {});
            uploadBtn.disabled = false;
            progressWrap.style.display = 'none';
            progressBar.style.width = '0';
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
            statusEl.textContent = 'Start time must be before end time.';
            statusEl.className = 'upload-status error';
            toast('Start time must be before end time.', 'error', {});
            return;
        }
        if (tStartIso) formData.append('time_start', tStartIso);
        if (tEndIso) formData.append('time_end', tEndIso);
    }

    const selectedColumns = Array.isArray(appState.previewSelectedColumns)
        ? appState.previewSelectedColumns.filter(Boolean)
        : [];
    if (selectedColumns.length > 0) {
        formData.append('columns', JSON.stringify(selectedColumns));
    }

    const timeColumn = String(appState.previewTimeColumn || '').trim();
    if (timeColumn) formData.append('time_column', timeColumn);

    uploadBtn.disabled = true;
    statusEl.textContent = 'Uploading…';
    statusEl.className = 'upload-status loading';
    progressWrap.style.display = 'block';
    const stopProgress = animateProgress(progressBar, progressWrap);

    try {
        const res = await uploadDataset(formData);
        progressBar.style.width = '100%';
        if (!res.ok) {
            const txt = await res.text();
            let message = txt;
            try {
                const parsed = JSON.parse(txt);
                if (parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
                    message = parsed.error;
                }
            } catch { /* ignore */ }
            statusEl.textContent = 'Error: ' + message;
            statusEl.className = 'upload-status error';
            toast(`Upload failed: ${message}`, 'error', {});
        } else {
            const result = await res.json();
            statusEl.textContent = `Loaded ${result.rows.toLocaleString()} rows. Refreshing stats…`;
            statusEl.className = 'upload-status success';
            toast(`${formatCount(Number(result.rows || 0))} rows loaded. Dataset ready.`, 'success', {});
            // Fetch fresh metadata and refresh the profile grid without page reload
            try {
                const { fetchMetadata } = await import('../../services/api/index.js');
                const freshMetadata = await fetchMetadata();
                setMetadata(freshMetadata);
                const revision = freshMetadata?.revision;
                setDatasetRevision(typeof revision === 'number' ? revision : 0);
                // Reset upload state
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                void selectedFile; // clear from outer scope
                fileInput.value = '';
                fileDisplay.textContent = '';
                // Re-hydrate and render the profile grid with the new dataset metadata
                hydrateColumnProfiles(freshMetadata);
                // Update header meta stats and UI controls
                buildMetaBar(freshMetadata);
                deps.buildColumnToggles();
                deps.buildRangeControls();
            } catch {
                // Fall back to reload if metadata refresh fails
                setTimeout(() => window.location.reload(), 1200);
            }
        }
    } catch (e: unknown) {
        statusEl.textContent = 'Error: ' + (e instanceof Error ? e.message : String(e));
        statusEl.className = 'upload-status error';
        toast(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 'error', {});
    } finally {
        stopProgress();
        uploadBtn.disabled = false;
        setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0'; }, 1500);
    }
}