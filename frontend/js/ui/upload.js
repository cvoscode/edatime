/**
 * Upload panel logic (file drop, partial load, preview).
 */

import {
    appState, formatAnalysisTime, formatAnalysisNumber, formatCount,
    formatToDatetimeLocal, toFiniteNumberOrNull,
} from '../state.js';

export function setUploadPreviewStatus(text, kind = '') {
    const el = document.getElementById('upload-preview-status');
    if (!el) return;
    el.textContent = text;
    el.className = `upload-preview-status ${kind}`.trim();
}

export function applyPartialTimeRangeFromMetadata(metadata, overwriteInputs = true) {
    const startInput = document.getElementById('time-start-input');
    const endInput = document.getElementById('time-end-input');
    const hint = document.getElementById('time-range-hint');
    if (!startInput || !endInput) return;

    const minMs = Number(metadata?.time_range?.min);
    const maxMs = Number(metadata?.time_range?.max);
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
        if (hint) hint.textContent = 'Time range not detected in this file.';
        startInput.min = '';
        startInput.max = '';
        endInput.min = '';
        endInput.max = '';
        return;
    }

    const minLocal = formatToDatetimeLocal(minMs);
    const maxLocal = formatToDatetimeLocal(maxMs);

    startInput.min = minLocal;
    startInput.max = maxLocal;
    endInput.min = minLocal;
    endInput.max = maxLocal;

    if (overwriteInputs || !startInput.value) startInput.value = minLocal;
    if (overwriteInputs || !endInput.value) endInput.value = maxLocal;

    if (hint) {
        hint.textContent = `Detected: ${formatAnalysisTime(minMs)} → ${formatAnalysisTime(maxMs)}`;
    }
}

export function initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid) {
    const toggleBtn   = document.getElementById('upload-toggle-btn');
    const panel       = document.getElementById('upload-panel');
    const browseBtn   = document.getElementById('browse-btn');
    const fileInput   = document.getElementById('file-upload');
    const dropZone    = document.getElementById('drop-zone');
    const fileDisplay = document.getElementById('file-name-display');
    const partialChk  = document.getElementById('partial-enabled');
    const partialFlds = document.getElementById('partial-fields');
    const nRowsInput  = document.getElementById('n-rows-input');
    const nRowsRange  = document.getElementById('n-rows-range');
    const nRowsDisp   = document.getElementById('n-rows-display');
    const skipInput   = document.getElementById('skip-rows-input');
    const timeStartInput = document.getElementById('time-start-input');
    const timeEndInput = document.getElementById('time-end-input');
    const uploadBtn   = document.getElementById('upload-btn');
    const statusEl    = document.getElementById('upload-status');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar  = document.getElementById('progress-bar');

    if (!panel || !browseBtn || !fileInput || !dropZone || !fileDisplay ||
        !partialChk || !partialFlds || !nRowsInput || !nRowsRange || !nRowsDisp ||
        !skipInput || !uploadBtn || !statusEl || !progressWrap || !progressBar) {
        console.error('Upload panel is missing required elements.');
        return;
    }

    let selectedFile = null;
    let previewController = null;

    async function runFilePreview(file) {
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
            const previewMetadata = result?.metadata;
            if (!previewMetadata || !Array.isArray(previewMetadata.columns)) {
                throw new Error('Preview response missing metadata');
            }
            hydrateColumnProfiles(previewMetadata);
            renderColumnProfilesGrid(true);
            applyPartialTimeRangeFromMetadata(previewMetadata, true);
            const previewRows = Number(previewMetadata.total_rows || result?.preview_rows || 0);
            setUploadPreviewStatus(`Preview ready (${formatCount(previewRows)} sampled rows, fast mode)`);
        } catch (e) {
            if (e?.name === 'AbortError') return;
            setUploadPreviewStatus(`Preview failed: ${e.message}`, 'error');
            applyPartialTimeRangeFromMetadata(null, false);
        }
    }

    // Panel open/close
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('open');
            toggleBtn.classList.toggle('btn-primary');
            toggleBtn.classList.toggle('btn-ghost');
        });
    } else {
        panel.classList.add('open');
    }

    // Browse / choose
    dropZone.addEventListener('click', (e) => {
        if (e.target.closest('#browse-btn')) return;
        fileInput.click();
    });
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        selectedFile = fileInput.files[0] || null;
        fileDisplay.textContent = selectedFile ? selectedFile.name : '';
        runFilePreview(selectedFile);
    });

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        selectedFile = e.dataTransfer.files[0] || null;
        fileDisplay.textContent = selectedFile ? selectedFile.name : '';
        runFilePreview(selectedFile);
    });

    // Partial load toggle
    partialChk.addEventListener('change', () => {
        partialFlds.classList.toggle('visible', partialChk.checked);
    });
    partialFlds.classList.toggle('visible', partialChk.checked);

    // Sync range ↔ number input
    function fmtRows(n) {
        return n >= 1_000_000
            ? (n / 1_000_000).toFixed(1) + 'M'
            : n >= 1_000 ? (n / 1_000).toFixed(0) + 'K' : String(n);
    }

    nRowsRange.addEventListener('input', () => {
        const v = parseInt(nRowsRange.value, 10);
        nRowsInput.value = v;
        nRowsDisp.textContent = fmtRows(v);
    });
    nRowsInput.addEventListener('input', () => {
        const v = parseInt(nRowsInput.value, 10);
        if (!isNaN(v)) {
            nRowsRange.value = Math.min(v, parseInt(nRowsRange.max, 10));
            nRowsDisp.textContent = fmtRows(v);
        }
    });

    const defaultRows = parseInt(nRowsRange.value, 10);
    if (!isNaN(defaultRows) && defaultRows > 0) {
        nRowsInput.value = String(defaultRows);
        nRowsDisp.textContent = fmtRows(defaultRows);
    }

    applyPartialTimeRangeFromMetadata(appState.metadata, false);

    // Upload submit
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            setStatus('Please select a file first.', 'error');
            return;
        }
        const formData = new FormData();
        formData.append('file', selectedFile);

        if (partialChk.checked) {
            const nRows = parseInt(nRowsInput.value, 10);
            const skipRows = parseInt(skipInput.value, 10) || 0;
            if (!isNaN(nRows) && nRows > 0) {
                formData.append('n_rows', String(nRows));
            } else {
                setStatus('Enter a valid Max rows value for partial load.', 'error');
                uploadBtn.disabled = false;
                progressWrap.style.display = 'none';
                progressBar.style.width = '0';
                return;
            }
            if (skipRows > 0) formData.append('skip_rows', String(skipRows));

            const toIsoOrNull = (v) => {
                const s = (v || '').trim();
                if (!s) return null;
                const ms = Date.parse(s);
                if (!Number.isFinite(ms)) return null;
                return new Date(ms).toISOString();
            };
            const tStartIso = toIsoOrNull(timeStartInput?.value);
            const tEndIso = toIsoOrNull(timeEndInput?.value);
            if (tStartIso) formData.append('time_start', tStartIso);
            if (tEndIso) formData.append('time_end', tEndIso);
        }

        uploadBtn.disabled = true;
        setStatus('Uploading…', 'loading');
        progressWrap.style.display = 'block';
        const stopProgress = animateProgress(progressBar);

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            progressBar.style.width = '100%';
            if (!res.ok) {
                const txt = await res.text();
                let message = txt;
                try {
                    const parsed = JSON.parse(txt);
                    if (parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
                        message = parsed.error;
                    }
                } catch (_) {}
                setStatus('Error: ' + message, 'error');
            } else {
                const result = await res.json();
                setStatus(`Loaded ${result.rows.toLocaleString()} rows. Refreshing…`, 'success');
                setTimeout(() => window.location.reload(), 1200);
            }
        } catch (e) {
            setStatus('Error: ' + e.message, 'error');
        } finally {
            stopProgress();
            uploadBtn.disabled = false;
            setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0'; }, 1500);
        }
    });

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'upload-status ' + (cls || '');
    }

    function animateProgress(bar) {
        let w = 0;
        const t = setInterval(() => {
            w = Math.min(w + Math.random() * 8, 85);
            bar.style.width = w + '%';
            if (w >= 85) clearInterval(t);
        }, 120);
        return () => clearInterval(t);
    }
}
