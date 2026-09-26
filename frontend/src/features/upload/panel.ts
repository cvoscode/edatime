import type { WorkspaceStore } from '../../contracts/workspace.js';
/**
 * Upload panel logic (file drop, partial load, preview).
 *
 * This module is the rendering surface: DOM manipulation and event binding.
 * Workflow logic and state transitions live in features/upload/*.
 */

// Re-export shared utilities and status setters from feature modules
export { setUploadPreviewStatus, setProfileMode, formatUploadRowCountValue as formatUploadRowCount, loadedRowCountFromResponse } from './preview.js';
export { applyPartialTimeRangeFromMetadata } from './partialLoadControls.js';

import {
    setUploadPreviewStatus,
    setProfileMode,
    createUploadPreviewController,
    applyTimeRangeFromMetadata,
} from './preview.js';
import {
    handleDatabaseConnect,
    handleDatabaseDisconnect,
    handleDatabaseLoad,
    syncDatabaseStatus as doSyncDatabaseStatus,
} from './databaseSource.js';
import {
    validateFileSize,
    getPartialTimeRangeInputs,
} from './partialLoadControls.js';
import { getPreviewConfigurationError, submitFileUpload } from './fileSource.js';
import { uploadProfile } from './profileState.js';
import { loadCurrentDatasetProfile } from './currentProfile.js';
import { setPreviewSelectedColumns, setPreviewTimeColumn, uploadUi } from './uploadUi.js';
import { toast } from '../../utils/toast.js';
import { getDropdownValue, setDropdownOptions } from '../../ui/primitives/Dropdown.js';
import type { DatasetMetadata } from '../../types/api.js';
import { confirmDatasetReplacement } from '../../ui/datasetReplacement.js';

interface UploadPanelDeps {
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
    ensureDatasetMetadata?: () => Promise<'ready' | 'empty'>;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    refreshDatasetAfterMutation?: () => Promise<void>;
}

function notify(message: string, kind: 'success' | 'error' | 'warning' | 'info'): void {
    toast(message, kind, {});
}

export function initUploadPanel(
    hydrateColumnProfiles: (metadata: DatasetMetadata) => void,
    renderColumnProfilesGrid: (resetScroll: boolean) => void,
    deps: UploadPanelDeps,
): () => void {
    const listenerAbort = new AbortController();
    const listenerOptions = { signal: listenerAbort.signal };
    const previewController = createUploadPreviewController();
    const toggleBtn = document.getElementById('upload-toggle-btn');
    const panel = document.getElementById('upload-panel');
    const browseBtn = document.getElementById('browse-btn');
    const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
    const dropZone = document.getElementById('drop-zone');
    const fileDisplay = document.getElementById('file-name-display');
    const partialChk = document.getElementById('partial-enabled') as HTMLInputElement | null;
    const partialFlds = document.getElementById('partial-fields');
    const nRowsInput = document.getElementById('n-rows-input') as HTMLInputElement | null;
    const nRowsRange = document.getElementById('n-rows-range') as HTMLInputElement | null;
    const nRowsDisp = document.getElementById('n-rows-display');
    const skipInput = document.getElementById('skip-rows-input') as HTMLInputElement | null;
    const timeStartInput = document.getElementById('time-start-input') as HTMLInputElement | null;
    const timeEndInput = document.getElementById('time-end-input') as HTMLInputElement | null;
    const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement | null;
    const uploadStatus = document.getElementById('upload-status') as HTMLElement | null;
    const previewRetryBtn = document.getElementById('upload-preview-retry-btn') as HTMLButtonElement | null;
    const profileBuildBtn = document.getElementById('upload-profile-build-btn') as HTMLButtonElement | null;
    const selectAllBtn = document.getElementById('profile-select-all-btn');
    const selectNoneBtn = document.getElementById('profile-select-none-btn');
    const selectInvertBtn = document.getElementById('profile-select-invert-btn');
    const selectAllCheckbox = document.getElementById('profile-select-all-checkbox') as HTMLInputElement | null;

    if (
        !panel || !browseBtn || !fileInput || !dropZone || !fileDisplay ||
        !partialChk || !partialFlds || !nRowsInput || !nRowsRange || !nRowsDisp ||
        !skipInput || !uploadBtn
    ) {
        console.error('Upload panel is missing required elements.');
        return () => { listenerAbort.abort(); previewController.dispose(); };
    }

    let selectedFile: File | null = null;
    let fileGeneration = 0;
    let previewSequence = 0;
    let uploadPending = false;
    let previewedFileGeneration: number | null = null;

    const currentProfileUi = {
        hydrateColumnProfiles,
        renderColumnProfilesGrid,
        setUploadPreviewStatus,
        applyTimeRangeFromMetadata,
        setProfileMode,
    };
    const restoreCurrentProfile = (metadata: DatasetMetadata, buildExact = false) => loadCurrentDatasetProfile(
        listenerAbort.signal,
        () => !listenerAbort.signal.aborted && !selectedFile && uploadProfile.metadata === metadata,
        metadata,
        currentProfileUi,
        { buildExact },
    );

    function formatUploadRowCountLocal(rowCount: number): string {
        return rowCount >= 1_000_000
            ? (rowCount / 1_000_000).toFixed(1) + 'M'
            : rowCount >= 1_000 ? (rowCount / 1_000).toFixed(0) + 'K' : String(rowCount);
    }

    function syncUploadButtonState(): void {
        if (!uploadBtn) return;
        const hasFile = !!selectedFile && selectedFile.size > 0;
        const previewReady = hasFile && previewedFileGeneration === fileGeneration;
        const previewError = uploadProfile.metadata
            ? getPreviewConfigurationError(uploadProfile.metadata, uploadUi.previewSelectedColumns, uploadUi.previewTimeColumn)
            : 'Preview the selected file before ingesting it.';
        const canUpload = hasFile && previewReady && !previewError && !uploadPending;
        uploadBtn.disabled = !canUpload;
        uploadBtn.setAttribute('aria-disabled', canUpload ? 'false' : 'true');
        uploadBtn.title = uploadPending
            ? 'Loading the selected file…'
            : !hasFile
            ? 'Pick a CSV/Parquet file above first.'
            : !previewReady
                ? 'Wait for the selected file preview to finish.'
                : previewError || '';
    }

    function clearFilePreviewState(): void {
        uploadProfile.metadata = null;
        uploadProfile.columnProfiles = [];
        setPreviewSelectedColumns([]);
        setPreviewTimeColumn(null);
        setDropdownOptions('time-column-select', [{ value: '', label: 'Auto-detect' }], { preferredValue: '' });
        applyTimeRangeFromMetadata(null, true);
        const timeInputs = getPartialTimeRangeInputs();
        if (timeInputs) {
            timeInputs.startInput.value = '';
            timeInputs.endInput.value = '';
        }
        hydrateColumnProfiles({
            total_rows: 0,
            columns: [],
            numeric_columns: [],
            time_column: null,
            time_range: null,
            column_profiles: [],
        });
        setProfileMode('preview');
        renderColumnProfilesGrid(true);
        setUploadPreviewStatus('Select a file to preview its columns');
        if (previewRetryBtn) previewRetryBtn.hidden = true;
    }

    // Panel open/close
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            panel!.classList.toggle('open');
            toggleBtn.classList.toggle('btn-primary');
            toggleBtn.classList.toggle('btn-ghost');
        }, listenerOptions);
    } else {
        panel.classList.add('open');
    }

    async function runPreviewWithCurrentFile(file: File, generation = fileGeneration): Promise<void> {
        const sequence = ++previewSequence;
        previewedFileGeneration = null;
        if (previewRetryBtn) previewRetryBtn.hidden = true;
        syncUploadButtonState();
        const result = await previewController.run(file, {
            hydrateColumnProfiles,
            renderColumnProfilesGrid,
            onTimeColumnChanged: () => {
                if (selectedFile && generation === fileGeneration) {
                    void runPreviewWithCurrentFile(selectedFile, generation);
                }
            },
            signal: listenerAbort.signal,
        });
        if (listenerAbort.signal.aborted || sequence !== previewSequence
            || generation !== fileGeneration || selectedFile !== file || result === 'ignored') return;
        previewedFileGeneration = result === 'ready' ? generation : null;
        if (previewRetryBtn) previewRetryBtn.hidden = result !== 'failed';
        syncUploadButtonState();
    }

    function selectFile(file: File | null): void {
        previewController.cancel();
        previewSequence += 1;
        fileGeneration += 1;
        const generation = fileGeneration;
        selectedFile = file;
        previewedFileGeneration = null;
        fileDisplay!.textContent = file?.name ?? '';
        if (profileBuildBtn) profileBuildBtn.hidden = true;
        clearFilePreviewState();

        const invalidFileMsg = validateFileSize(file);
        if (invalidFileMsg) {
            selectedFile = null;
            if (fileInput) fileInput.value = '';
            fileDisplay!.textContent = '';
            setUploadPreviewStatus(invalidFileMsg, 'error');
            notify(invalidFileMsg, 'error');
            syncUploadButtonState();
            return;
        }
        syncUploadButtonState();
        if (file) void runPreviewWithCurrentFile(file, generation);
    }

    // Browse / choose
    dropZone.addEventListener('click', (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('#browse-btn')) return;
        fileInput!.click();
    }, listenerOptions);
    dropZone.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        fileInput!.click();
    }, listenerOptions);
    browseBtn.addEventListener('click', () => fileInput!.click(), listenerOptions);
    fileInput.addEventListener('change', () => {
        selectFile(fileInput!.files?.[0] ?? null);
    }, listenerOptions);

    // Drag and drop
    dropZone.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); dropZone!.classList.add('dragover'); }, listenerOptions);
    dropZone.addEventListener('dragleave', () => dropZone!.classList.remove('dragover'), listenerOptions);
    dropZone.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        dropZone!.classList.remove('dragover');
        selectFile(e.dataTransfer?.files[0] ?? null);
    }, listenerOptions);
    previewRetryBtn?.addEventListener('click', () => {
        if (selectedFile) void runPreviewWithCurrentFile(selectedFile, fileGeneration);
    }, listenerOptions);
    profileBuildBtn?.addEventListener('click', () => {
        const metadata = uploadProfile.metadata;
        if (metadata && !selectedFile) void restoreCurrentProfile(metadata, true);
    }, listenerOptions);

    // Partial load toggle
    partialChk.addEventListener('change', () => {
        partialFlds!.classList.toggle('visible', partialChk!.checked);
    }, listenerOptions);
    partialFlds.classList.toggle('visible', partialChk.checked);

    // Sync range ↔ number input
    nRowsRange.addEventListener('input', () => {
        const v = parseInt(nRowsRange!.value, 10);
        nRowsInput!.value = String(v);
        nRowsDisp!.textContent = formatUploadRowCountLocal(v);
    }, listenerOptions);
    nRowsInput.addEventListener('input', () => {
        const v = parseInt(nRowsInput!.value, 10);
        if (!isNaN(v)) {
            nRowsRange!.value = String(Math.min(v, parseInt(nRowsRange!.max, 10)));
            nRowsDisp!.textContent = formatUploadRowCountLocal(v);
        }
    }, listenerOptions);

    const defaultRows = parseInt(nRowsRange.value, 10);
    if (!isNaN(defaultRows) && defaultRows > 0) {
        nRowsInput.value = String(defaultRows);
        nRowsDisp.textContent = formatUploadRowCountLocal(defaultRows);
    }

    const activateCurrentDataset = (metadata: DatasetMetadata) => {
        if (listenerAbort.signal.aborted || selectedFile) return;
        uploadProfile.metadata = metadata;
        applyTimeRangeFromMetadata(metadata, false);
        setProfileMode('dataset');
        hydrateColumnProfiles(metadata);
        renderColumnProfilesGrid(true);
        setUploadPreviewStatus('Showing the active dataset profile');
        void restoreCurrentProfile(metadata);
    };

    uploadProfile.metadata = deps.workspace?.getSnapshot().dataset.metadata ?? null;
    setProfileMode('dataset');
    if (uploadProfile.metadata) {
        activateCurrentDataset(uploadProfile.metadata);
    } else {
        if (profileBuildBtn) profileBuildBtn.hidden = true;
        setUploadPreviewStatus('Checking for an active dataset…', 'loading');
        void (async () => {
            try {
                let freshMetadata: DatasetMetadata | null = null;
                if (deps.ensureDatasetMetadata) {
                    const result = await deps.ensureDatasetMetadata();
                    if (result === 'ready') freshMetadata = deps.workspace?.getSnapshot().dataset.metadata ?? null;
                } else {
                    const { fetchMetadata } = await import('../../services/api/index.js');
                    freshMetadata = await fetchMetadata({ signal: listenerAbort.signal });
                }
                if (listenerAbort.signal.aborted || selectedFile) return;
                if (freshMetadata) {
                    activateCurrentDataset(freshMetadata);
                } else {
                    setUploadPreviewStatus('No active dataset. Select a file to preview its columns.');
                }
            } catch (error) {
                if (listenerAbort.signal.aborted || selectedFile) return;
                const apiError = error as { status?: unknown; code?: unknown };
                if (Number(apiError?.status) === 404 && apiError.code === 'not_found') {
                    setUploadPreviewStatus('No active dataset. Select a file to preview its columns.');
                    return;
                }
                setUploadPreviewStatus(`Could not load the active dataset: ${error instanceof Error ? error.message : String(error)}.`, 'error');
            }
        })();
    }
    syncUploadButtonState();

    selectAllBtn?.addEventListener('click', () => setSelectionMode('all'), listenerOptions);
    selectNoneBtn?.addEventListener('click', () => setSelectionMode('none'), listenerOptions);
    selectInvertBtn?.addEventListener('click', () => setSelectionMode('invert'), listenerOptions);
    selectAllCheckbox?.addEventListener('change', () => {
        setSelectionMode(selectAllCheckbox!.checked ? 'all' : 'none');
    }, listenerOptions);

    function setSelectionMode(mode: 'all' | 'none' | 'invert') {
        const columns = Array.isArray(uploadProfile.columnProfiles)
            ? uploadProfile.columnProfiles.map((profile) => profile.name)
            : [];
        const next = new Set<string>();
        if (uploadUi.previewTimeColumn) next.add(uploadUi.previewTimeColumn);
        if (mode === 'all') {
            for (const name of columns) next.add(name);
        } else if (mode === 'invert') {
            const selected = new Set(uploadUi.previewSelectedColumns);
            for (const name of columns) {
                if (!selected.has(name)) next.add(name);
            }
        }
        setPreviewSelectedColumns(Array.from(next));
        renderColumnProfilesGrid(false);
    }

    // Upload submit
    uploadBtn.addEventListener('click', () => {
        if (uploadPending) return;
        if (!selectedFile) {
            notify('Please select a file first.', 'error');
            return;
        }
        const previewMetadata = uploadProfile.metadata;
        const previewError = previewMetadata
            ? getPreviewConfigurationError(previewMetadata, uploadUi.previewSelectedColumns, uploadUi.previewTimeColumn)
            : 'Preview the selected file before ingesting it.';
        if (previewedFileGeneration !== fileGeneration || previewError || !previewMetadata) {
            const message = previewError || 'Wait for the selected file preview to finish before ingesting it.';
            setUploadPreviewStatus(message, 'error');
            notify(message, 'error');
            syncUploadButtonState();
            return;
        }
        if (!confirmDatasetReplacement(deps.workspace, selectedFile.name)) return;

        const submittedFile = selectedFile;
        const submittedGeneration = fileGeneration;
        uploadPending = true;
        syncUploadButtonState();
        void submitFileUpload({
            selectedFile,
            previewMetadata,
            selectedColumns: [...uploadUi.previewSelectedColumns],
            timeColumn: uploadUi.previewTimeColumn,
            partialEnabled: partialChk!.checked,
            nRowsInput: nRowsInput!,
            skipInput: skipInput!,
            timeStartInput: timeStartInput,
            timeEndInput: timeEndInput,
            statusEl: uploadStatus,
            signal: listenerAbort.signal,
            deps,
        }).then((result) => {
            uploadPending = false;
            if (!listenerAbort.signal.aborted) syncUploadButtonState();
            if (result.status !== 'success' || listenerAbort.signal.aborted
                || selectedFile !== submittedFile || fileGeneration !== submittedGeneration) return;
            selectedFile = null;
            fileGeneration += 1;
            previewedFileGeneration = null;
            if (fileInput) fileInput.value = '';
            if (fileDisplay) fileDisplay.textContent = '';
            if (profileBuildBtn) profileBuildBtn.hidden = true;
            clearFilePreviewState();
            const activeMetadata = result.metadata ?? deps.workspace?.getSnapshot().dataset.metadata ?? null;
            if (activeMetadata) activateCurrentDataset(activeMetadata);
            else {
                setProfileMode('dataset');
                setUploadPreviewStatus('No active dataset. Select a file to preview its columns.');
            }
            syncUploadButtonState();
        });
    }, listenerOptions);

    /* ── Upload source tabs (File | Database) ───────────── */
    const fileTabBtn = document.getElementById('upload-source-file-btn');
    const dbTabBtn = document.getElementById('upload-source-database-btn');
    const filePanel = document.querySelector('[data-upload-source-panel="file"]');
    const dbPanel = document.querySelector('[data-upload-source-panel="database"]');

    function switchUploadSource(source: 'file' | 'database'): void {
        if (source === 'database') {
            fileTabBtn?.setAttribute('aria-selected', 'false');
            dbTabBtn?.setAttribute('aria-selected', 'true');
            fileTabBtn?.classList.remove('active');
            dbTabBtn?.classList.add('active');
            if (filePanel) (filePanel as HTMLElement).hidden = true;
            if (dbPanel) (dbPanel as HTMLElement).hidden = false;
            // Sync database status when switching to db tab
            void syncDatabaseStatus();
        } else {
            dbTabBtn?.setAttribute('aria-selected', 'false');
            fileTabBtn?.setAttribute('aria-selected', 'true');
            dbTabBtn?.classList.remove('active');
            fileTabBtn?.classList.add('active');
            if (dbPanel) (dbPanel as HTMLElement).hidden = true;
            if (filePanel) (filePanel as HTMLElement).hidden = false;
        }
    }

    fileTabBtn?.addEventListener('click', () => switchUploadSource('file'), listenerOptions);
    dbTabBtn?.addEventListener('click', () => switchUploadSource('database'), listenerOptions);

    /* ── Database connection ─────────────────────────────── */
    const dbConnectBtn = document.getElementById('db-connect-btn') as HTMLButtonElement | null;
    const dbLoadBtn = document.getElementById('db-load-btn') as HTMLButtonElement | null;
    const dbDisconnectBtn = document.getElementById('db-disconnect-btn') as HTMLButtonElement | null;
    const dbStatus = document.getElementById('db-status');
    const dbTableSelect = document.getElementById('db-table-select') as HTMLElement | null;

    /** Sync table select → text input. */
    dbTableSelect?.addEventListener('change', () => {
        const tableInput = document.getElementById('db-table-input') as HTMLInputElement | null;
        const table = getDropdownValue('db-table-select');
        if (tableInput && table) tableInput.value = table;
    }, listenerOptions);

    /** Connect button — delegates to databaseSource handler. */
    if (dbConnectBtn) {
        dbConnectBtn.addEventListener('click', () => {
            const connectionString = (document.getElementById('db-connection-input') as HTMLInputElement | null)?.value ?? '';
            const schema = (document.getElementById('db-schema-input') as HTMLInputElement | null)?.value.trim() || 'public';
            void handleDatabaseConnect({
                connectionString,
                schema,
                dbConnectBtn,
                dbStatus: dbStatus!,
                dbLoadBtn,
                dbDisconnectBtn,
            });
        }, listenerOptions);
    }

    /** Load data button — delegates to databaseSource handler. */
    if (dbLoadBtn) {
        dbLoadBtn.addEventListener('click', () => {
            const schema = (document.getElementById('db-schema-input') as HTMLInputElement | null)?.value.trim() || 'public';
            const table = (document.getElementById('db-table-input') as HTMLInputElement | null)?.value.trim()
                || getDropdownValue('db-table-select')
                || '';
            const timeColumn = (document.getElementById('db-time-col-input') as HTMLInputElement | null)?.value.trim();
            if (!table || !confirmDatasetReplacement(deps.workspace, `${schema}.${table}`)) return;
            void handleDatabaseLoad({
                schema,
                table,
                timeColumn: timeColumn || null,
                dbLoadBtn,
                dbStatus: dbStatus!,
                refreshDatasetAfterMutation: deps.refreshDatasetAfterMutation,
            });
        }, listenerOptions);
    }

    /** Disconnect button — delegates to databaseSource handler. */
    if (dbDisconnectBtn) {
        dbDisconnectBtn.addEventListener('click', () => {
            void handleDatabaseDisconnect({
                dbDisconnectBtn,
                dbLoadBtn,
                dbStatus: dbStatus!,
                dbTableSelect,
            });
        }, listenerOptions);
    }

    let dbStatusLoaded = false;

    async function syncDatabaseStatus(): Promise<void> {
        if (dbStatusLoaded) return;
        dbStatusLoaded = true;
        await doSyncDatabaseStatus();
    }

    return () => {
        listenerAbort.abort();
        previewController.dispose();
    };

}
