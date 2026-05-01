/**
 * Upload panel logic (file drop, partial load, preview).
 */

import {
    appState, formatAnalysisTime, formatAnalysisNumber, formatCount,
    formatToDatetimeLocal, toFiniteNumberOrNull,
} from '../state.js';
import type { DatasetMetadata } from '../types.js';

const UI_MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

interface PartialTimeRangeInputs {
    startInput: HTMLInputElement;
    endInput: HTMLInputElement;
    hint: HTMLElement | null;
}

function getPartialTimeRangeInputs(): PartialTimeRangeInputs | null {
    const startInput = document.getElementById('time-start-input') as HTMLInputElement | null;
    const endInput = document.getElementById('time-end-input') as HTMLInputElement | null;
    if (!startInput || !endInput) return null;

    return {
        startInput,
        endInput,
        hint: document.getElementById('time-range-hint'),
    };
}

function clearPartialTimeRangeInputs(inputs: PartialTimeRangeInputs): void {
    if (inputs.hint) inputs.hint.textContent = 'Time range not detected in this file.';
    inputs.startInput.min = '';
    inputs.startInput.max = '';
    inputs.endInput.min = '';
    inputs.endInput.max = '';
}

function setPartialTimeRangeInputs(
    inputs: PartialTimeRangeInputs,
    minLocal: string,
    maxLocal: string,
    overwriteInputs: boolean,
): void {
    inputs.startInput.min = minLocal;
    inputs.startInput.max = maxLocal;
    inputs.endInput.min = minLocal;
    inputs.endInput.max = maxLocal;

    if (overwriteInputs || !inputs.startInput.value) inputs.startInput.value = minLocal;
    if (overwriteInputs || !inputs.endInput.value) inputs.endInput.value = maxLocal;
}

export function setUploadPreviewStatus(text: string, kind = ''): void {
    const el = document.getElementById('upload-preview-status');
    if (!el) return;
    el.textContent = text;
    el.className = `upload-preview-status ${kind}`.trim();
}

export function formatUploadRowCount(rowCount: number): string {
    return rowCount >= 1_000_000
        ? (rowCount / 1_000_000).toFixed(1) + 'M'
        : rowCount >= 1_000 ? (rowCount / 1_000).toFixed(0) + 'K' : String(rowCount);
}

/** Update the profile-mode badge to reflect whether the grid shows the
 *  current loaded dataset or a pending upload preview. */
export function setProfileMode(mode: 'dataset' | 'preview'): void {
    const badge = document.getElementById('profile-mode-badge');
    if (!badge) return;
    badge.setAttribute('data-mode', mode);
    badge.textContent = mode === 'preview' ? 'Upload preview' : 'Current dataset';
}

export function applyPartialTimeRangeFromMetadata(
    metadata: DatasetMetadata | null,
    overwriteInputs = true,
): void {
    const inputs = getPartialTimeRangeInputs();
    if (!inputs) return;

    const minMs = Number(metadata?.time_range?.min);
    const maxMs = Number(metadata?.time_range?.max);
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
        clearPartialTimeRangeInputs(inputs);
        return;
    }

    const minLocal = formatToDatetimeLocal(minMs);
    const maxLocal = formatToDatetimeLocal(maxMs);

    setPartialTimeRangeInputs(inputs, minLocal, maxLocal, overwriteInputs);

    if (inputs.hint) {
        inputs.hint.textContent = `Detected: ${formatAnalysisTime(minMs)} → ${formatAnalysisTime(maxMs)}`;
    }
}

export function initUploadPanel(
    hydrateColumnProfiles: (metadata: DatasetMetadata) => void,
    renderColumnProfilesGrid: (resetScroll: boolean) => void,
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
    let previewController: AbortController | null = null;
    let dbStatusLoaded = false;

    function validateSelectedFile(file: File | null): string | null {
        if (!file) return 'Please select a file first.';
        const name = String(file.name || '').toLowerCase();
        if (!(name.endsWith('.csv') || name.endsWith('.parquet'))) {
            return 'Only CSV and Parquet files are supported.';
        }
        if (Number(file.size) > UI_MAX_UPLOAD_BYTES) {
            const maxMb = Math.round(UI_MAX_UPLOAD_BYTES / (1024 * 1024));
            return `File exceeds ${maxMb} MB upload limit.`;
        }
        return null;
    }

    function applyPreviewColumnSelection(metadata: DatasetMetadata) {
        const columns = Array.isArray(metadata?.columns) ? metadata.columns : [];
        const metadataTimeCol = String(metadata?.time_column || '').trim() || null;
        const detectedTimeCol = columns.find((col) => /date|time|ts|timestamp/i.test(String(col?.name || '')))?.name || null;

        appState.previewSelectedColumns = columns
            .map((col) => String(col?.name || '').trim())
            .filter(Boolean);

        const timeColumnExists = appState.previewTimeColumn && columns.some((col) => String(col?.name || '').trim() === appState.previewTimeColumn);
        const calledTimeColumn = metadataTimeCol || detectedTimeCol || (timeColumnExists ? appState.previewTimeColumn : null);
        appState.previewTimeColumn = calledTimeColumn;

        const timeColumnSelect = document.getElementById('time-column-select') as HTMLSelectElement | null;
        if (timeColumnSelect) {
            timeColumnSelect.innerHTML = '<option value="">Auto-detect</option>';

            for (const col of columns) {
                const name = String(col?.name || '').trim();
                if (!name) continue;
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = `${name} (${col?.dtype || 'unknown'})`;
                timeColumnSelect.appendChild(opt);
            }

            if (calledTimeColumn) {
                timeColumnSelect.value = calledTimeColumn;
            } else {
                timeColumnSelect.value = '';
            }

            timeColumnSelect.onchange = () => {
                appState.previewTimeColumn = timeColumnSelect.value || null;
                if (selectedFile) runFilePreview(selectedFile);
            };
        }
    }

    function setSelectionMode(mode: 'all' | 'none') {
        const columns = Array.isArray(appState.columnProfiles)
            ? appState.columnProfiles.map((profile) => profile.name)
            : [];
        const next = new Set<string>();
        if (appState.previewTimeColumn) next.add(appState.previewTimeColumn);
        if (mode === 'all') {
            for (const name of columns) next.add(name);
        }
        appState.previewSelectedColumns = Array.from(next);
        renderColumnProfilesGrid(false);
    }

    async function runFilePreview(file: File) {
        if (!file) {
            setUploadPreviewStatus('Select a file to preview columns');
            return;
        }
        if (previewController) previewController.abort();
        previewController = new AbortController();
        setUploadPreviewStatus('Profiling file…', 'loading');
        try {
            const formData = new FormData();
            formData.append('file', file);

            const timeColumn = String(appState.previewTimeColumn || '').trim();
            if (timeColumn) formData.append('time_column', timeColumn);

            const res = await fetch('/api/upload/preview', {
                method: 'POST',
                body: formData,
                signal: previewController.signal,
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => 'Preview failed');
                throw new Error(txt || 'Preview failed');
            }
            const result = await res.json();
            const previewMetadata = result?.metadata as DatasetMetadata;
            if (!previewMetadata || !Array.isArray(previewMetadata.columns)) {
                throw new Error('Preview response missing metadata');
            }
            appState.metadata = previewMetadata;
            hydrateColumnProfiles(previewMetadata);
            applyPreviewColumnSelection(previewMetadata);
            renderColumnProfilesGrid(true);
            applyPartialTimeRangeFromMetadata(previewMetadata, true);
            const previewRows = Number(previewMetadata.total_rows || (result as any)?.preview_rows || 0);
            if (!appState.previewTimeColumn && !previewMetadata.time_range) {
                setUploadPreviewStatus('No time column detected in preview. Please select one from the dropdown before upload.', 'warning');
            } else {
                setUploadPreviewStatus(`Preview ready (${formatCount(previewRows)} rows)`, 'success');
            }
            setProfileMode('preview');
        } catch (e: any) {
            if (e?.name === 'AbortError') return;
            if (String(e?.message || '').includes('Specified time column not found')) {
                appState.previewTimeColumn = null;
            }
            setUploadPreviewStatus(`Preview failed: ${e.message}`, 'error');
            applyPartialTimeRangeFromMetadata(null, false);
        }
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
        const invalidFileMsg = validateSelectedFile(selectedFile);
        if (invalidFileMsg) {
            selectedFile = null;
            fileInput!.value = '';
            fileDisplay!.textContent = '';
            setStatus(invalidFileMsg, 'error');
            setUploadPreviewStatus(invalidFileMsg, 'error');
            return;
        }
        fileDisplay!.textContent = selectedFile ? selectedFile.name : '';
        appState.previewTimeColumn = null;
        if (selectedFile) runFilePreview(selectedFile);
    });

    // Drag and drop
    dropZone.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); dropZone!.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone!.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        dropZone!.classList.remove('dragover');
        selectedFile = e.dataTransfer?.files[0] || null;
        const invalidFileMsg = validateSelectedFile(selectedFile);
        if (invalidFileMsg) {
            selectedFile = null;
            fileDisplay!.textContent = '';
            setStatus(invalidFileMsg, 'error');
            setUploadPreviewStatus(invalidFileMsg, 'error');
            return;
        }
        fileDisplay!.textContent = selectedFile ? selectedFile.name : '';
        appState.previewTimeColumn = null;
        if (selectedFile) runFilePreview(selectedFile);
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
        nRowsDisp!.textContent = formatUploadRowCount(v);
    });
    nRowsInput.addEventListener('input', () => {
        const v = parseInt(nRowsInput!.value, 10);
        if (!isNaN(v)) {
            nRowsRange!.value = String(Math.min(v, parseInt(nRowsRange!.max, 10)));
            nRowsDisp!.textContent = formatUploadRowCount(v);
        }
    });

    const defaultRows = parseInt(nRowsRange.value, 10);
    if (!isNaN(defaultRows) && defaultRows > 0) {
        nRowsInput.value = String(defaultRows);
        nRowsDisp.textContent = formatUploadRowCount(defaultRows);
    }

    applyPartialTimeRangeFromMetadata(appState.metadata, false);

    selectAllBtn?.addEventListener('click', () => setSelectionMode('all'));
    selectNoneBtn?.addEventListener('click', () => setSelectionMode('none'));
    selectAllCheckbox?.addEventListener('change', () => {
        setSelectionMode(selectAllCheckbox!.checked ? 'all' : 'none');
    });

    // Upload submit
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            setStatus('Please select a file first.', 'error');
            return;
        }

        const invalidFileMsg = validateSelectedFile(selectedFile);
        if (invalidFileMsg) {
            setStatus(invalidFileMsg, 'error');
            return;
        }

        if (!appState.previewTimeColumn && !(appState.metadata && appState.metadata.time_range)) {
            setStatus('No time column selected. Please choose a time column in the upload panel before ingest.', 'error');
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
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
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
            } else {
                const result = await res.json();
                setStatus(`Loaded ${result.rows.toLocaleString()} rows. Refreshing…`, 'success');
                setTimeout(() => window.location.reload(), 1200);
            }
        } catch (e: any) {
            setStatus('Error: ' + e.message, 'error');
        } finally {
            stopProgress();
            uploadBtn!.disabled = false;
            setTimeout(() => { progressWrap!.style.display = 'none'; progressBar!.style.width = '0'; }, 1500);
        }
    });

    function setStatus(msg: string, cls = '') {
        statusEl!.textContent = msg;
        statusEl!.className = 'upload-status ' + (cls || '');
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

    /* ── Database connection ─────────────────────────────── */
    const dbChk = document.getElementById('db-enabled') as HTMLInputElement | null;
    const dbFlds = document.getElementById('db-fields');
    const dbConnectBtn = document.getElementById('db-connect-btn') as HTMLButtonElement | null;
    const dbLoadBtn = document.getElementById('db-load-btn') as HTMLButtonElement | null;
    const dbDisconnectBtn = document.getElementById('db-disconnect-btn') as HTMLButtonElement | null;
    const dbStatus = document.getElementById('db-status');
    const dbTableSelect = document.getElementById('db-table-select') as HTMLSelectElement | null;

    if (dbChk && dbFlds) {
        dbChk.addEventListener('change', () => {
            dbFlds.classList.toggle('visible', dbChk.checked);
            if (dbChk.checked) {
                void syncDatabaseStatus();
            }
        });
    }

    /** Populate the table <select> from the /api/database/tables endpoint. */
    async function refreshDbTables(): Promise<void> {
        if (!dbTableSelect) return;
        try {
            const r = await fetch('/api/database/tables');
            if (!r.ok) return;
            const data = await r.json();
            const tables: Array<{ schema: string; name: string; kind: string }> = data.tables ?? [];
            dbTableSelect.innerHTML = '<option value="">— select table —</option>';
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
                return;
            }

            dbConnectBtn.disabled = true;
            if (dbStatus) { dbStatus.textContent = 'Connecting…'; dbStatus.className = 'upload-status loading'; }

            try {
                const res = await fetch('/api/database/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        connection_string: connectionString.trim(),
                        schema,
                        load_snapshot: false,
                    }),
                });
                const result = await res.json();
                if (res.ok) {
                    if (dbStatus) { dbStatus.textContent = 'Connected. Choose a table and click Load data.'; dbStatus.className = 'upload-status success'; }
                    if (dbLoadBtn) dbLoadBtn.disabled = false;
                    if (dbDisconnectBtn) dbDisconnectBtn.hidden = false;
                    await refreshDbTables();
                } else {
                    if (dbStatus) { dbStatus.textContent = result.message ?? result.error ?? 'Connection failed.'; dbStatus.className = 'upload-status error'; }
                }
            } catch (e: any) {
                if (dbStatus) { dbStatus.textContent = 'Error: ' + e.message; dbStatus.className = 'upload-status error'; }
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
                return;
            }

            dbLoadBtn.disabled = true;
            if (dbStatus) { dbStatus.textContent = 'Loading data…'; dbStatus.className = 'upload-status loading'; }

            try {
                const res = await fetch('/api/database/load', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        schema,
                        table,
                        time_column: timeColumn || null,
                        limit: 1_000_000,
                    }),
                });
                const result = await res.json();
                if (res.ok) {
                    if (dbStatus) {
                        dbStatus.textContent = `Loaded ${(result.rows_loaded as number).toLocaleString()} rows from ${table}.`;
                        dbStatus.className = 'upload-status success';
                    }
                    // Trigger a full metadata reload so the chart page refreshes.
                    window.dispatchEvent(new CustomEvent('edatime:dataset-changed', { detail: { source: 'database', table } }));
                } else {
                    if (dbStatus) { dbStatus.textContent = result.message ?? result.error ?? 'Load failed.'; dbStatus.className = 'upload-status error'; }
                }
            } catch (e: any) {
                if (dbStatus) { dbStatus.textContent = 'Error: ' + e.message; dbStatus.className = 'upload-status error'; }
            } finally {
                dbLoadBtn.disabled = false;
            }
        });
    }

    /** Disconnect button. */
    if (dbDisconnectBtn) {
        dbDisconnectBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/database/connect', { method: 'DELETE' });
            } catch { /* ignore */ }
            if (dbStatus) { dbStatus.textContent = 'Disconnected.'; dbStatus.className = 'upload-status'; }
            if (dbLoadBtn) dbLoadBtn.disabled = true;
            if (dbDisconnectBtn) dbDisconnectBtn.hidden = true;
            if (dbTableSelect) {
                dbTableSelect.innerHTML = '<option value="">— connect first —</option>';
            }
        });
    }

    async function syncDatabaseStatus(): Promise<void> {
        if (dbStatusLoaded) return;
        dbStatusLoaded = true;
        try {
            const s = await fetch('/api/database/status').then((r) => r.json());
            if (s.connected) {
                if (dbChk) { dbChk.checked = true; dbFlds?.classList.add('visible'); }
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
