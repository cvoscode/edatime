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
import { formatAnalysisTime, formatAnalysisNumber, formatCount, formatToDatetimeLocal, toFiniteNumberOrNull } from '../utils/format.js';
import { buildMetaBar } from './metaBar.js';
import {
    connectDatabase,
    deleteDatabaseConnection,
    fetchDatabaseStatus,
    fetchDatabaseTables,
    fetchMetadata as dataClientFetchMetadata,
    loadDatabaseTable,
    previewUpload,
    uploadDataset,
} from '../services/api/index.js';
import {
    setDatasetRevision,
    setMetadata,
    setPreviewSelectedColumns,
    setPreviewTimeColumn,
} from '../store/index.js';
import type { DatasetMetadata } from '../types.js';
import { toast } from '../utils/toast.js';
import {
    validateFileSize,
    getPartialTimeRangeInputs,
    clearPartialTimeRangeInputs,
    setPartialTimeRangeInputs,
    UI_MAX_UPLOAD_BYTES,
} from '../features/upload/partialLoadControls.js';
import {
    setUploadPreviewStatus,
    setProfileMode,
    runFilePreview,
    applyPreviewColumnSelection,
    applyTimeRangeFromMetadata,
} from '../features/upload/preview.js';

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
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            setStatus('Please select a file first.', 'error');
            notify('Please select a file first.', 'error');
            return;
        }

        const invalidFileMsg = validateFileSize(selectedFile);
        if (invalidFileMsg) {
            setStatus(invalidFileMsg, 'error');
            notify(invalidFileMsg, 'error');
            return;
        }

        if (!appState.previewTimeColumn && !(appState.metadata && appState.metadata.time_range)) {
            setStatus('No time column selected. Please choose a time column in the upload panel before ingest.', 'error');
            notify('No time column selected. Please choose a time column in the upload panel before ingest.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', selectedFile);

        if (partialChk!.checked) {
            const nRows = parseInt(nRowsInput!.value, 10);
            const skipRows = parseInt(skipInput!.value, 10) || 0;
            if (!isNaN(nRows) && nRows > 0) {
                formData.append('n_rows', String(nRows));
            } else {
                setStatus('Enter a valid Max rows value for partial load.', 'error');
                notify('Enter a valid Max rows value for partial load.', 'error');
                uploadBtn!.disabled = false;
                progressWrap!.style.display = 'none';
                progressBar!.style.width = '0';
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
                setStatus('Start time must be before end time.', 'error');
                notify('Start time must be before end time.', 'error');
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

        uploadBtn!.disabled = true;
        setStatus('Uploading…', 'loading');
        progressWrap!.style.display = 'block';
        const stopProgress = animateProgress(progressBar!);

        try {
            const res = await uploadDataset(formData);
            progressBar!.style.width = '100%';
            if (!res.ok) {
                const txt = await res.text();
                let message = txt;
                try {
                    const parsed = JSON.parse(txt);
                    if (parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
                        message = parsed.error;
                    }
                } catch { /* ignore */ }
                setStatus('Error: ' + message, 'error');
                notify(`Upload failed: ${message}`, 'error');
            } else {
                const result = await res.json();
                setStatus(`Loaded ${result.rows.toLocaleString()} rows. Refreshing stats…`, 'success');
                notify(`${formatCount(Number(result.rows || 0))} rows loaded. Dataset ready.`, 'success');
                // Fetch fresh metadata and refresh the profile grid without page reload
                try {
                    const freshMetadata = await dataClientFetchMetadata();
                    setMetadata(freshMetadata);
                    const revision = freshMetadata?.revision;
                    setDatasetRevision(typeof revision === 'number' ? revision : 0);
                    // Reset upload state
                    selectedFile = null;
                    fileInput!.value = '';
                    fileDisplay!.textContent = '';
                    setUploadPreviewStatus('Upload complete. Select a file to preview.', '');
                    setProfileMode('dataset');
                    // Re-hydrate and render the profile grid with the new dataset metadata
                    hydrateColumnProfiles(freshMetadata);
                    applyTimeRangeFromMetadata(freshMetadata, false);
                    renderColumnProfilesGrid(true);
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
            setStatus('Error: ' + (e instanceof Error ? e.message : String(e)), 'error');
            notify(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            stopProgress();
            uploadBtn!.disabled = false;
            setTimeout(() => { progressWrap!.style.display = 'none'; progressBar!.style.width = '0'; }, 1500);
        }
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
    async function refreshDbTables(): Promise<void> {
        if (!dbTableSelect) return;
        try {
            const data = await fetchDatabaseTables() as { tables?: Array<{ schema: string; name: string; kind: string }> };
            const tables: Array<{ schema: string; name: string; kind: string }> = data.tables ?? [];
            // Use DOM methods instead of innerHTML to avoid XSS
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '— select table —';
            dbTableSelect.replaceChildren(placeholder);
            for (const t of tables) {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = t.kind === 'hypertable' ? `⏱ ${t.schema}.${t.name}` : `${t.schema}.${t.name}`;
                dbTableSelect.appendChild(opt);
            }
        } catch {
            // ignore; user can still type the name manually
        }
    }

    /** Sync table select → text input. */
    dbTableSelect?.addEventListener('change', () => {
        const tableInput = document.getElementById('db-table-input') as HTMLInputElement | null;
        if (tableInput && dbTableSelect.value) tableInput.value = dbTableSelect.value;
    });

    /** Connect button — establishes the pool, no data load yet. */
    if (dbConnectBtn) {
        dbConnectBtn.addEventListener('click', async () => {
            const connectionString = (document.getElementById('db-connection-input') as HTMLInputElement | null)?.value ?? '';
            const schema = (document.getElementById('db-schema-input') as HTMLInputElement | null)?.value.trim() || 'public';

            if (!connectionString.trim()) {
                if (dbStatus) { dbStatus.textContent = 'Connection string is required.'; dbStatus.className = 'upload-status error'; }
                notify('Connection string is required.', 'error');
                return;
            }

            dbConnectBtn.disabled = true;
            if (dbStatus) { dbStatus.textContent = 'Connecting…'; dbStatus.className = 'upload-status loading'; }

            try {
                const result = await connectDatabase({
                    connection_string: connectionString.trim(),
                    schema,
                    load_snapshot: false,
                }) as { message?: string; error?: string };
                if (result) {
                    if (dbStatus) { dbStatus.textContent = 'Connected. Choose a table and click Load data.'; dbStatus.className = 'upload-status success'; }
                    notify('Database connected. Choose a table and click Load data.', 'success');
                    if (dbLoadBtn) dbLoadBtn.disabled = false;
                    if (dbDisconnectBtn) dbDisconnectBtn.hidden = false;
                    await refreshDbTables();
                }
            } catch (e: unknown) {
                if (dbStatus) { dbStatus.textContent = 'Error: ' + (e instanceof Error ? e.message : String(e)); dbStatus.className = 'upload-status error'; }
                notify(`Database connection failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
            } finally {
                dbConnectBtn.disabled = false;
            }
        });
    }

    /** Load data button — pulls selected table into in-memory store. */
    if (dbLoadBtn) {
        dbLoadBtn.addEventListener('click', async () => {
            const schema = (document.getElementById('db-schema-input') as HTMLInputElement | null)?.value.trim() || 'public';
            const table = (document.getElementById('db-table-input') as HTMLInputElement | null)?.value.trim()
                ?? dbTableSelect?.value ?? '';
            const timeColumn = (document.getElementById('db-time-col-input') as HTMLInputElement | null)?.value.trim();

            if (!table) {
                if (dbStatus) { dbStatus.textContent = 'Select or enter a table name.'; dbStatus.className = 'upload-status error'; }
                notify('Select or enter a table name.', 'error');
                return;
            }

            dbLoadBtn.disabled = true;
            if (dbStatus) { dbStatus.textContent = 'Loading data…'; dbStatus.className = 'upload-status loading'; }

            try {
                const result = await loadDatabaseTable({
                    schema,
                    table,
                    time_column: timeColumn || null,
                    limit: 1_000_000,
                }) as { message?: string; error?: string };
                if (result) {
                    const loadedRows = (() => {
                        if (!result || typeof result !== 'object') return 0;
                        const count = Number((result as Record<string, unknown>).rows ?? (result as Record<string, unknown>).rows_loaded);
                        return Number.isFinite(count) && count >= 0 ? count : 0;
                    })();
                    if (dbStatus) {
                        dbStatus.textContent = `Loaded ${loadedRows.toLocaleString()} rows from ${table}.`;
                        dbStatus.className = 'upload-status success';
                    }
                    notify(`${formatCount(loadedRows)} rows loaded from ${table}.`, 'success');
                    // Trigger a full metadata reload so the chart page refreshes.
                    window.dispatchEvent(new CustomEvent('edatime:dataset-changed', { detail: { source: 'database', table } }));
                }
            } catch (e: unknown) {
                if (dbStatus) { dbStatus.textContent = 'Error: ' + (e instanceof Error ? e.message : String(e)); dbStatus.className = 'upload-status error'; }
                notify(`Database load failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
            } finally {
                dbLoadBtn.disabled = false;
            }
        });
    }

    /** Disconnect button. */
    if (dbDisconnectBtn) {
        dbDisconnectBtn.addEventListener('click', async () => {
            try {
                await deleteDatabaseConnection();
            } catch { /* ignore */ }
            if (dbStatus) { dbStatus.textContent = 'Disconnected.'; dbStatus.className = 'upload-status'; }
            notify('Database disconnected.', 'info');
            if (dbLoadBtn) dbLoadBtn.disabled = true;
            if (dbDisconnectBtn) dbDisconnectBtn.hidden = true;
            if (dbTableSelect) {
                dbTableSelect.replaceChildren();
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = '— connect first —';
                dbTableSelect.appendChild(placeholder);
            }
        });
    }

    let dbStatusLoaded = false;

    async function syncDatabaseStatus(): Promise<void> {
        if (dbStatusLoaded) return;
        dbStatusLoaded = true;
        try {
            const s = await fetchDatabaseStatus() as { connected?: boolean; table?: string };
            if (s.connected) {
                if (dbLoadBtn) dbLoadBtn.disabled = false;
                if (dbDisconnectBtn) dbDisconnectBtn.hidden = false;
                if (dbStatus) { dbStatus.textContent = `Connected to ${s.table || '(no table loaded)'}`; dbStatus.className = 'upload-status success'; }
                void refreshDbTables();
            }
        } catch {
            dbStatusLoaded = false;
        }
    }

}