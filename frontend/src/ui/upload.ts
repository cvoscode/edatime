/**
 * Upload panel logic (file drop, partial load, preview).
 *
 * This module is the rendering surface: DOM manipulation and event binding.
 * Workflow logic and state transitions live in features/upload/*.
 */

// Re-export shared utilities and status setters from feature modules
export { setUploadPreviewStatus } from '../features/upload/preview.js';
export { setProfileMode } from '../features/upload/preview.js';
export { applyPartialTimeRangeFromMetadata } from '../features/upload/partialLoadControls.js';
export { formatUploadRowCountValue as formatUploadRowCount, loadedRowCountFromResponse } from '../features/upload/preview.js';

import { appState } from '../store/appStateCompat.js';
import {
    setUploadPreviewStatus,
    setProfileMode,
    runFilePreview,
    applyPreviewColumnSelection,
    applyTimeRangeFromMetadata,
} from '../features/upload/preview.js';
import {
    handleDatabaseConnect,
    handleDatabaseDisconnect,
    handleDatabaseLoad,
    refreshDbTables,
    resetDatabaseStatusLoaded,
} from '../features/upload/databaseSource.js';
import {
    validateFileSize,
    getPartialTimeRangeInputs,
    clearPartialTimeRangeInputs,
    setPartialTimeRangeInputs,
    UI_MAX_UPLOAD_BYTES,
} from '../features/upload/partialLoadControls.js';
import { submitFileUpload } from '../features/upload/fileSource.js';
import {
    setDatasetRevision,
    setMetadata,
    setPreviewSelectedColumns,
    setPreviewTimeColumn,
} from '../store/index.js';
import { buildMetaBar } from './metaBar.js';
import { toast } from '../utils/toast.js';
import type { DatasetMetadata } from '../types.js';

interface UploadPanelDeps {
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
}

function notify(message: string, kind: 'success' | 'error' | 'warning' | 'info'): void {
    toast(message, kind, {});
}

export function initUploadPanel(
    hydrateColumnProfiles: (metadata: DatasetMetadata) => void,
    renderColumnProfilesGrid: (resetScroll: boolean) => void,
    deps: UploadPanelDeps,
): void {
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
    const statusEl = document.getElementById('upload-status');
    const progressWrap = document.getElementById('progress-wrap') as HTMLElement | null;
    const progressBar = document.getElementById('progress-bar') as HTMLElement | null;
    const selectAllBtn = document.getElementById('profile-select-all-btn');
    const selectNoneBtn = document.getElementById('profile-select-none-btn');
    const selectAllCheckbox = document.getElementById('profile-select-all-checkbox') as HTMLInputElement | null;

    if (
        !panel || !browseBtn || !fileInput || !dropZone || !fileDisplay ||
        !partialChk || !partialFlds || !nRowsInput || !nRowsRange || !nRowsDisp ||
        !skipInput || !uploadBtn || !statusEl || !progressWrap || !progressBar
    ) {
        console.error('Upload panel is missing required elements.');
        return;
    }

    let selectedFile: File | null = null;

    function setStatus(msg: string, cls = '') {
        statusEl!.textContent = msg;
        statusEl!.className = 'upload-status ' + (cls || '');
    }

    function formatUploadRowCountLocal(rowCount: number): string {
        return rowCount >= 1_000_000
            ? (rowCount / 1_000_000).toFixed(1) + 'M'
            : rowCount >= 1_000 ? (rowCount / 1_000).toFixed(0) + 'K' : String(rowCount);
    }

    function animateProgress(bar: HTMLElement): () => void {
        let w = 0;
        if (progressWrap) progressWrap.setAttribute('aria-valuenow', '0');
        const t = setInterval(() => {
            w = Math.min(w + Math.random() * 8, 85);
            bar.style.width = w + '%';
            if (progressWrap) progressWrap.setAttribute('aria-valuenow', String(Math.round(w)));
            if (w >= 85) clearInterval(t);
        }, 120);
        return () => {
            clearInterval(t);
            if (progressWrap) {
                const current = Number(progressWrap.getAttribute('aria-valuenow') || '0');
                progressWrap.setAttribute('aria-valuenow', String(Math.max(current, 100)));
            }
        };
    }

    // Panel open/close
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            panel!.classList.toggle('open');
            toggleBtn.classList.toggle('btn-primary');
            toggleBtn.classList.toggle('btn-ghost');
        });
    } else {
        panel.classList.add('open');
    }

    async function runPreviewWithCurrentFile(file: File) {
        await runFilePreview(file, {
            hydrateColumnProfiles,
            renderColumnProfilesGrid,
            onTimeColumnChanged: runPreviewWithCurrentFile,
        });
    }

    // Browse / choose
    dropZone.addEventListener('click', (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('#browse-btn')) return;
        fileInput!.click();
    });
    dropZone.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        fileInput!.click();
    });
    browseBtn.addEventListener('click', () => fileInput!.click());
    fileInput.addEventListener('change', () => {
        selectedFile = fileInput!.files?.[0] || null;
        const invalidFileMsg = validateFileSize(selectedFile);
        if (invalidFileMsg) {
            selectedFile = null;
            fileInput!.value = '';
            fileDisplay!.textContent = '';
            setStatus(invalidFileMsg, 'error');
            setUploadPreviewStatus(invalidFileMsg, 'error');
            notify(invalidFileMsg, 'error');
            return;
        }
        fileDisplay!.textContent = selectedFile ? selectedFile.name : '';
        setPreviewTimeColumn(null);
        if (selectedFile) void runPreviewWithCurrentFile(selectedFile);
    });

    // Drag and drop
    dropZone.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); dropZone!.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone!.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        dropZone!.classList.remove('dragover');
        selectedFile = e.dataTransfer?.files[0] || null;
        const invalidFileMsg = validateFileSize(selectedFile);
        if (invalidFileMsg) {
            selectedFile = null;
            fileDisplay!.textContent = '';
            setStatus(invalidFileMsg, 'error');
            setUploadPreviewStatus(invalidFileMsg, 'error');
            notify(invalidFileMsg, 'error');
            return;
        }
        fileDisplay!.textContent = selectedFile ? selectedFile.name : '';
        setPreviewTimeColumn(null);
        if (selectedFile) void runPreviewWithCurrentFile(selectedFile);
    });

    // Partial load toggle
    partialChk.addEventListener('change', () => {
        partialFlds!.classList.toggle('visible', partialChk!.checked);
    });
    partialFlds.classList.toggle('visible', partialChk.checked);

    // Sync range ↔ number input
    nRowsRange.addEventListener('input', () => {
        const v = parseInt(nRowsRange!.value, 10);
        nRowsInput!.value = String(v);
        nRowsDisp!.textContent = formatUploadRowCountLocal(v);
    });
    nRowsInput.addEventListener('input', () => {
        const v = parseInt(nRowsInput!.value, 10);
        if (!isNaN(v)) {
            nRowsRange!.value = String(Math.min(v, parseInt(nRowsRange!.max, 10)));
            nRowsDisp!.textContent = formatUploadRowCountLocal(v);
        }
    });

    const defaultRows = parseInt(nRowsRange.value, 10);
    if (!isNaN(defaultRows) && defaultRows > 0) {
        nRowsInput.value = String(defaultRows);
        nRowsDisp.textContent = formatUploadRowCountLocal(defaultRows);
    }

    applyTimeRangeFromMetadata(appState.metadata, false);

    selectAllBtn?.addEventListener('click', () => setSelectionMode('all'));
    selectNoneBtn?.addEventListener('click', () => setSelectionMode('none'));
    selectAllCheckbox?.addEventListener('change', () => {
        setSelectionMode(selectAllCheckbox!.checked ? 'all' : 'none');
    });

    function setSelectionMode(mode: 'all' | 'none') {
        const columns = Array.isArray(appState.columnProfiles)
            ? appState.columnProfiles.map((profile) => profile.name)
            : [];
        const next = new Set<string>();
        if (appState.previewTimeColumn) next.add(appState.previewTimeColumn);
        if (mode === 'all') {
            for (const name of columns) next.add(name);
        }
        setPreviewSelectedColumns(Array.from(next));
        renderColumnProfilesGrid(false);
    }

    // Upload submit
    uploadBtn.addEventListener('click', () => {
        if (!selectedFile) {
            setStatus('Please select a file first.', 'error');
            notify('Please select a file first.', 'error');
            return;
        }

        void submitFileUpload({
            selectedFile,
            partialEnabled: partialChk!.checked,
            nRowsInput: nRowsInput!,
            skipInput: skipInput!,
            timeStartInput: timeStartInput,
            timeEndInput: timeEndInput,
            uploadBtn: uploadBtn!,
            statusEl: statusEl!,
            progressWrap: progressWrap!,
            progressBar: progressBar!,
            fileInput: fileInput!,
            fileDisplay: fileDisplay!,
            deps,
            hydrateColumnProfiles,
            renderColumnProfilesGrid,
        });
    });

    /* ── Upload source tabs (File | Database) ───────────── */
    const fileTabBtn = document.getElementById('upload-source-file-btn');
    const dbTabBtn = document.getElementById('upload-source-database-btn');
    const filePanel = document.querySelector('[data-upload-source-panel="file"]');
    const dbPanel = document.querySelector('[data-upload-source-panel="database"]');

    function switchUploadSource(source: 'file' | 'database'): void {
        if (source === 'database') {
            fileTabBtn?.setAttribute('aria-selected', 'false');
            dbTabBtn?.setAttribute('aria-selected', 'true');
            fileTabBtn?.classList.remove('btn-primary');
            fileTabBtn?.classList.add('btn-ghost');
            dbTabBtn?.classList.remove('btn-ghost');
            dbTabBtn?.classList.add('btn-primary');
            if (filePanel) (filePanel as HTMLElement).hidden = true;
            if (dbPanel) (dbPanel as HTMLElement).hidden = false;
            // Sync database status when switching to db tab
            void syncDatabaseStatus();
        } else {
            dbTabBtn?.setAttribute('aria-selected', 'false');
            fileTabBtn?.setAttribute('aria-selected', 'true');
            dbTabBtn?.classList.remove('btn-primary');
            dbTabBtn?.classList.add('btn-ghost');
            fileTabBtn?.classList.remove('btn-ghost');
            fileTabBtn?.classList.add('btn-primary');
            if (dbPanel) (dbPanel as HTMLElement).hidden = true;
            if (filePanel) (filePanel as HTMLElement).hidden = false;
        }
    }

    fileTabBtn?.addEventListener('click', () => switchUploadSource('file'));
    dbTabBtn?.addEventListener('click', () => switchUploadSource('database'));

    /* ── Database connection ─────────────────────────────── */
    const dbConnectBtn = document.getElementById('db-connect-btn') as HTMLButtonElement | null;
    const dbLoadBtn = document.getElementById('db-load-btn') as HTMLButtonElement | null;
    const dbDisconnectBtn = document.getElementById('db-disconnect-btn') as HTMLButtonElement | null;
    const dbStatus = document.getElementById('db-status');
    const dbTableSelect = document.getElementById('db-table-select') as HTMLSelectElement | null;

    /** Populate the table <select> from the /api/database/tables endpoint. */
    // Delegates to databaseSource.refreshDbTables which handles the DOM
    void refreshDbTables();

    /** Sync table select → text input. */
    dbTableSelect?.addEventListener('change', () => {
        const tableInput = document.getElementById('db-table-input') as HTMLInputElement | null;
        if (tableInput && dbTableSelect.value) tableInput.value = dbTableSelect.value;
    });

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
        });
    }

    /** Load data button — delegates to databaseSource handler. */
    if (dbLoadBtn) {
        dbLoadBtn.addEventListener('click', () => {
            const schema = (document.getElementById('db-schema-input') as HTMLInputElement | null)?.value.trim() || 'public';
            const table = (document.getElementById('db-table-input') as HTMLInputElement | null)?.value.trim()
                ?? dbTableSelect?.value ?? '';
            const timeColumn = (document.getElementById('db-time-col-input') as HTMLInputElement | null)?.value.trim();
            void handleDatabaseLoad({
                schema,
                table,
                timeColumn: timeColumn || null,
                dbLoadBtn,
                dbStatus: dbStatus!,
            });
        });
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
        });
    }

    let dbStatusLoaded = false;

    async function syncDatabaseStatus(): Promise<void> {
        if (dbStatusLoaded) return;
        dbStatusLoaded = true;
        const { syncDatabaseStatus: doSync } = await import('../features/upload/databaseSource.js');
        await doSync();
    }

}