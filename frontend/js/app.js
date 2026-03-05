let fetchMetadata = null;
let fetchData = null;
let DataChart = null;

// ─── Debugging (opt-in) ────────────────────────────────────────────────────
const DEBUG = (() => {
    try {
        const qs = new URLSearchParams(window.location.search);
        if (qs.get('debug') === '1') return true;
        if (qs.get('debug') === 'true') return true;
        return window.localStorage?.getItem('edatimeDebug') === '1';
    } catch (_) {
        return false;
    }
})();

function dbg(...args) {
    if (!DEBUG) return;
    console.log('[edatime]', ...args);
}

function dbgGroup(label, fn) {
    if (!DEBUG) return fn?.();
    console.groupCollapsed(`[edatime] ${label}`);
    try { return fn?.(); } finally { console.groupEnd(); }
}

if (DEBUG) {
    window.addEventListener('error', (e) => {
        console.error('[edatime] window.error', e?.message, e?.error);
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.error('[edatime] unhandledrejection', e?.reason);
    });
}

class FallbackChart {
    constructor(containerId) {
        this.containerId = containerId;
        this.canvas = null;
        this.ctx = null;
        this.resizeObserver = null;
    }

    async init() {
        const container = document.getElementById(this.containerId);
        if (!container) throw new Error('Fallback chart container not found');

        container.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        container.appendChild(canvas);

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        const resize = () => {
            const w = Math.max(1, container.clientWidth);
            const h = Math.max(1, container.clientHeight);
            this.canvas.width = w;
            this.canvas.height = h;
        };
        resize();

        this.resizeObserver = new ResizeObserver(() => resize());
        this.resizeObserver.observe(container);
    }

    setTimeRange() {}

    setXRange() {}

    supportsZoomControls() {
        return false;
    }

    onCrosshairMove() {}

    onClick() {}

    updateDataMulti(dataObj, columns) {
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const pad = 28;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#080a10';
        ctx.fillRect(0, 0, width, height);

        let xMin = Number.POSITIVE_INFINITY;
        let xMax = Number.NEGATIVE_INFINITY;
        let yMin = Number.POSITIVE_INFINITY;
        let yMax = Number.NEGATIVE_INFINITY;

        const seriesToDraw = [];
        for (const col of columns) {
            const seriesData = dataObj.series?.[col];
            const xs = seriesData?.x || dataObj.ts;
            const ys = seriesData?.y || dataObj.values?.[col];
            if (!xs || !ys || ys.length === 0) continue;

            seriesToDraw.push({ col, xs, ys });

            for (let i = 0; i < xs.length; i++) {
                const x = Number(xs[i]);
                const y = Number(ys[i]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                if (x < xMin) xMin = x;
                if (x > xMax) xMax = x;
                if (y < yMin) yMin = y;
                if (y > yMax) yMax = y;
            }
        }

        if (seriesToDraw.length === 0 || !Number.isFinite(xMin) || !Number.isFinite(xMax) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
            ctx.fillStyle = '#7a86a4';
            ctx.font = '12px sans-serif';
            ctx.fillText('No data to display', pad, pad + 2);
            return;
        }

        if (xMax === xMin) xMax = xMin + 1;
        if (yMax === yMin) yMax = yMin + 1;

        ctx.strokeStyle = '#272d45';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, height - pad);
        ctx.lineTo(width - pad, height - pad);
        ctx.moveTo(pad, pad);
        ctx.lineTo(pad, height - pad);
        ctx.stroke();

        for (let s = 0; s < seriesToDraw.length; s++) {
            const { xs, ys } = seriesToDraw[s];
            ctx.beginPath();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = SERIES_COLORS[s % SERIES_COLORS.length];

            let started = false;
            for (let i = 0; i < xs.length; i++) {
                const x = Number(xs[i]);
                const y = Number(ys[i]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

                const px = pad + ((x - xMin) / (xMax - xMin)) * (width - 2 * pad);
                const py = height - pad - ((y - yMin) / (yMax - yMin)) * (height - 2 * pad);

                if (!started) {
                    ctx.moveTo(px, py);
                    started = true;
                } else {
                    ctx.lineTo(px, py);
                }
            }
            ctx.stroke();
        }
    }
}

async function ensureChartModules() {
    if (fetchMetadata && fetchData && DataChart) return;
    const [dataClient, chartModule] = await Promise.all([
        import('./dataClient.js?v=10'),
        import('./chart.js?v=26'),
    ]);
    fetchMetadata = dataClient.fetchMetadata;
    fetchData = dataClient.fetchData;
    DataChart = chartModule.DataChart;
}

// ─── Colour palette (matches CSS) ──────────────────────────────────────────
const SERIES_COLORS = ['#00d4ff','#6c63ff','#00c896','#f5a623','#ff4a6e','#c77dff'];

// ─── WebGPU guard ───────────────────────────────────────────────────────────
async function checkWebGPU() {
    if (!navigator.gpu)
        return 'WebGPU is not supported in this browser. Use Chrome 113+, Edge 113+, or Safari 18+.';
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('requestAdapter timed out')), 5000)
        );
        const adapter = await Promise.race([navigator.gpu.requestAdapter(), timeoutPromise]);
        if (!adapter)
            return 'No WebGPU adapter found. Your GPU may not be supported or hardware acceleration may be disabled.';
    } catch (e) {
        return `WebGPU adapter request failed: ${e.message}`;
    }
    return null;
}

function showFatalError(message) {
    const container = document.getElementById('main-chart');
    if (container)
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff4a6e;font-size:1rem;padding:2rem;text-align:center;">${message}</div>`;
    setMetaText('Error — rendering unavailable');
}

// ─── App state ──────────────────────────────────────────────────────────────
let appState = {
    metadata: null,
    numericCols: [],
    filterText: '',
    selectedCols: [],
    columnRanges: {},
    lastFetchedData: null,
    currentStart: null,
    currentEnd: null,
    chart: null,
    fetchDebounceId: null,
    analysisBound: false,
    refetchOnZoom: true,
    initialView: null,       // { xMin, xMax, yMin, yMax } captured after first data load
    zoomHistory: [],         // up to 5 snapshots of { xMin, xMax, yMin, yMax }
    pendingYMode: null,      // 'fit' | 'restore' | null
    pendingRestoreY: null,   // { min, max } when pendingYMode === 'restore'
};

// Handy for interactive debugging from DevTools.
window.__edatime = { get state() { return appState; }, DEBUG };

// ─── Metadata helpers ───────────────────────────────────────────────────────
function setMetaText(text) {
    const el = document.getElementById('stat-rows');
    if (el) el.innerHTML = text;
}

function buildMetaBar(metadata) {
    const rows = metadata.total_rows?.toLocaleString() ?? '?';
    const cols = metadata.numeric_columns?.length ?? 0;
    const series = appState.selectedCols.join(', ') || '—';
    document.getElementById('header-meta').innerHTML = `
        <div class="meta-stat live"><strong>${rows}</strong> rows</div>
        <div class="meta-stat"><strong>${cols}</strong> numeric series</div>
        <div class="meta-stat">Plotting <strong>${series}</strong></div>
    `;
}

function formatAnalysisTime(tsMs) {
    if (!Number.isFinite(tsMs)) return '—';
    return new Date(tsMs).toLocaleString();
}

function formatAnalysisNumber(value) {
    if (!Number.isFinite(value)) return '—';
    return Math.abs(value) >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : value.toFixed(4).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function setAnalysisStatus(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function updateAnalysisZoom(startMs, endMs, sourceKind = 'user') {
    setAnalysisStatus('analysis-zoom', `Range: ${formatAnalysisTime(startMs)} → ${formatAnalysisTime(endMs)} (${sourceKind})`);
}

function updateAnalysisYRange(min, max, sourceKind = 'user') {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        setAnalysisStatus('analysis-y', 'Y: —');
        return;
    }
    setAnalysisStatus('analysis-y', `Y: ${formatAnalysisNumber(min)} → ${formatAnalysisNumber(max)} (${sourceKind})`);
}

function updateAnalysisCursor(tsMs) {
    if (!Number.isFinite(tsMs)) {
        setAnalysisStatus('analysis-cursor', 'Cursor: —');
        return;
    }
    setAnalysisStatus('analysis-cursor', `Cursor: ${formatAnalysisTime(tsMs)}`);
}

function updateAnalysisClick(payload) {
    if (!payload?.value || payload.value.length < 2) {
        setAnalysisStatus('analysis-click', 'Click: —');
        return;
    }
    const x = Number(payload.value[0]);
    const y = Number(payload.value[1]);
    const seriesName = payload.seriesName || 'series';
    setAnalysisStatus('analysis-click', `Click: ${seriesName}=${formatAnalysisNumber(y)} @ ${formatAnalysisTime(x)}`);
}

function refreshZoomControlsState() {
    const supportsZoom = !!appState.chart?.supportsZoomControls?.();
    const resetBtn = document.getElementById('zoom-reset-btn');
    if (resetBtn) resetBtn.disabled = !supportsZoom;
}

function clampZoomRange(start, end) {
    let s = Math.max(0, Math.min(100, start));
    let e = Math.max(0, Math.min(100, end));
    if (e <= s) {
        const center = (s + e) / 2;
        s = Math.max(0, center - 1);
        e = Math.min(100, center + 1);
    }
    return { start: s, end: e };
}

// Snapshot the current visible X+Y viewport.
function getCurrentView() {
    const yr = appState.chart?.getYRange?.();
    return {
        xMin: appState.currentStart,
        xMax: appState.currentEnd,
        yMin:   yr?.min ?? null,
        yMax:   yr?.max ?? null,
    };
}

// Apply a viewport snapshot: sets X range and schedules a Y range restore after
// the next fetchAndRender, then triggers a fetch.
function applyViewport(view, sourceKind = 'api') {
    dbgGroup(`applyViewport (${sourceKind})`, () => {
        dbg('incoming view', view);
    });
    appState.currentStart = view.xMin;
    appState.currentEnd   = view.xMax;

    // Update chart axes immediately using real min/max values.
    appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);

    // Keep analysis panel in sync immediately.
    updateAnalysisZoom(appState.currentStart, appState.currentEnd, sourceKind);

    if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax > view.yMin) {
        updateAnalysisYRange(view.yMin, view.yMax, sourceKind);
        appState.pendingYMode = 'restore';
        appState.pendingRestoreY = { min: view.yMin, max: view.yMax };
    } else {
        appState.pendingYMode = 'fit';
        appState.pendingRestoreY = null;
    }

    if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);
    appState.fetchDebounceId = setTimeout(fetchAndRender, 0);
}

function zoomOut() {
    dbgGroup('zoomOut (dblclick)', () => {
        dbg('history depth', appState.zoomHistory.length);
        dbg('initialView', appState.initialView);
    });
    if (appState.zoomHistory.length > 0) {
        applyViewport(appState.zoomHistory.pop(), 'zoom-out');
    } else if (appState.initialView) {
        applyViewport(appState.initialView, 'zoom-out');
    }
}

function resetZoom() {
    dbgGroup('resetZoom', () => {
        dbg('initialView', appState.initialView);
    });
    if (!appState.initialView) return;
    appState.zoomHistory = [];
    applyViewport(appState.initialView, 'reset');
}

function initAnalysisControls() {
    const zoomResetBtn = document.getElementById('zoom-reset-btn');
    if (zoomResetBtn && !zoomResetBtn.dataset.bound) {
        zoomResetBtn.addEventListener('click', () => resetZoom());
        zoomResetBtn.dataset.bound = '1';
    }
    refreshZoomControlsState();
}

function bindAnalysisChartEvents() {
    if (!appState.chart || appState.analysisBound) return;

    appState.chart.onCrosshairMove?.((payload) => {
        let x = Number(payload?.x);
        // ChartGPU may emit x as an offset from the current x-axis min.
        // Convert to absolute epoch-ms when it looks like a small offset.
        if (Number.isFinite(x) && x < 100_000_000_000) {
            const dom = appState.chart?.getXDomain?.();
            if (dom?.min && Number.isFinite(dom.min)) x = dom.min + x;
        }
        updateAnalysisCursor(x);
    });

    appState.chart.onClick?.((payload) => {
        if (payload?.value && payload.value.length >= 2) {
            const x0 = Number(payload.value[0]);
            if (Number.isFinite(x0) && x0 < 100_000_000_000) {
                const dom = appState.chart?.getXDomain?.();
                if (dom?.min && Number.isFinite(dom.min)) {
                    payload = { ...payload, value: [dom.min + x0, payload.value[1]] };
                }
            }
        }
        updateAnalysisClick(payload);
    });

    appState.analysisBound = true;
}

// ─── Column toggles (chips) ─────────────────────────────────────────────────
function buildColumnToggles() {
    const container = document.getElementById('column-toggles');
    if (!container) return;
    container.innerHTML = '';

    const visibleCols = appState.numericCols.filter((col) => {
        if (!appState.filterText) return true;
        return col.toLowerCase().includes(appState.filterText);
    });

    if (visibleCols.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'series-empty';
        empty.textContent = 'No matching columns';
        container.appendChild(empty);
        return;
    }

    visibleCols.forEach((col, idx) => {
        const color = SERIES_COLORS[idx % SERIES_COLORS.length];
        const isActive = appState.selectedCols.includes(col);

        const chip = document.createElement('label');
        chip.className = 'series-chip' + (isActive ? ' active' : '');
        chip.innerHTML = `
            <input type="checkbox" ${isActive ? 'checked' : ''} value="${col}">
            <span class="chip-dot" style="background:${color}"></span>
            <span class="chip-label">${col}</span>
        `;

        chip.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!appState.selectedCols.includes(col)) appState.selectedCols.push(col);
                chip.classList.add('active');
            } else {
                appState.selectedCols = appState.selectedCols.filter(c => c !== col);
                chip.classList.remove('active');
            }
            // Always keep at least one selected
            if (appState.selectedCols.length === 0) {
                e.target.checked = true;
                appState.selectedCols.push(col);
                chip.classList.add('active');
            }
            buildMetaBar(appState.metadata);
            buildRangeControls();
            fetchAndRender();
        });

        container.appendChild(chip);
    });
}

function computeBounds(values) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (!Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
}

function ensureRangeStateFromData(dataObj) {
    for (const col of appState.selectedCols) {
        const values = dataObj.values?.[col];
        if (!values || values.length === 0) continue;
        if (!appState.columnRanges[col]) {
            const bounds = computeBounds(values);
            if (!bounds) continue;
            appState.columnRanges[col] = {
                from: bounds.min,
                to: bounds.max,
            };
        }
    }
}

function buildRangeControls() {
    const container = document.getElementById('column-range-controls');
    if (!container) return;
    container.innerHTML = '';

    for (const col of appState.selectedCols) {
        const range = appState.columnRanges[col];
        if (!range) continue;

        const chip = document.createElement('div');
        chip.className = 'range-chip';
        chip.innerHTML = `
            <span class="name">${col}</span>
            <input type="number" step="any" value="${range.from}" data-col="${col}" data-kind="from" aria-label="${col} minimum">
            <input type="number" step="any" value="${range.to}" data-col="${col}" data-kind="to" aria-label="${col} maximum">
        `;
        container.appendChild(chip);
    }

    container.querySelectorAll('input[data-col]').forEach((input) => {
        input.addEventListener('change', (e) => {
            const col = e.target.dataset.col;
            const kind = e.target.dataset.kind;
            const value = Number.parseFloat(e.target.value);
            if (!col || !kind || !Number.isFinite(value) || !appState.columnRanges[col]) return;

            appState.columnRanges[col][kind] = value;

            if (appState.columnRanges[col].from > appState.columnRanges[col].to) {
                const tmp = appState.columnRanges[col].from;
                appState.columnRanges[col].from = appState.columnRanges[col].to;
                appState.columnRanges[col].to = tmp;
                buildRangeControls();
            }

            renderCurrentData();
        });
    });
}

function applyColumnRanges(dataObj) {
    const filtered = {
        ...dataObj,
        series: {},
    };

    for (const col of appState.selectedCols) {
        const yValues = dataObj.values?.[col];
        if (!yValues) continue;

        const range = appState.columnRanges[col];
        if (!range) {
            filtered.series[col] = { x: dataObj.ts, y: yValues };
            continue;
        }

        const xs = [];
        const ys = [];
        for (let i = 0; i < yValues.length; i++) {
            const y = yValues[i];
            if (!Number.isFinite(y)) continue;
            if (y < range.from || y > range.to) continue;
            xs.push(dataObj.ts[i]);
            ys.push(y);
        }

        filtered.series[col] = {
            x: Float64Array.from(xs),
            y: Float64Array.from(ys),
        };
    }

    return filtered;
}

function renderCurrentData() {
    if (!appState.chart || !appState.lastFetchedData) return;
    const filtered = applyColumnRanges(appState.lastFetchedData);
    appState.chart.updateDataMulti(filtered, appState.selectedCols);
}

// ─── Upload panel ────────────────────────────────────────────────────────────
function initUploadPanel() {
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
    const uploadBtn   = document.getElementById('upload-btn');
    const statusEl    = document.getElementById('upload-status');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar  = document.getElementById('progress-bar');

    if (!toggleBtn || !panel || !browseBtn || !fileInput || !dropZone || !fileDisplay ||
        !partialChk || !partialFlds || !nRowsInput || !nRowsRange || !nRowsDisp ||
        !skipInput || !uploadBtn || !statusEl || !progressWrap || !progressBar) {
        console.error('Upload panel is missing required elements.');
        return;
    }

    let selectedFile = null;

    // Panel open/close
    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('open');
        toggleBtn.classList.toggle('btn-primary');
        toggleBtn.classList.toggle('btn-ghost');
    });

    // Browse / choose
    dropZone.addEventListener('click', (e) => {
        if (e.target.closest('#browse-btn')) return;
        fileInput.click();
    });
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        selectedFile = fileInput.files[0] || null;
        fileDisplay.textContent = selectedFile ? selectedFile.name : '';
    });

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        selectedFile = e.dataTransfer.files[0] || null;
        fileDisplay.textContent = selectedFile ? selectedFile.name : '';
    });

    // Partial load toggle
    partialChk.addEventListener('change', () => {
        partialFlds.classList.toggle('visible', partialChk.checked);
    });

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

// ─── Zoom handler (called from drag-select in chart.js) ─────────────────────
function onZoomRangeChange(newStart, newEnd, sourceKind = 'user') {
    if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);

    dbgGroup(`onZoomRangeChange (${sourceKind})`, () => {
        dbg('prev', { start: appState.currentStart, end: appState.currentEnd });
        dbg('next', { start: newStart, end: newEnd });
    });

    if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) return;

    // Save current X+Y view to history (cap at 5) before zooming in.
    if (Number.isFinite(appState.currentStart) && Number.isFinite(appState.currentEnd)) {
        const snap = getCurrentView();
        appState.zoomHistory = [...appState.zoomHistory, snap].slice(-5);
        dbg('pushed history snapshot', snap);
        dbg('history depth (after push)', appState.zoomHistory.length);
    }

    appState.currentStart = newStart;
    appState.currentEnd   = newEnd;
    appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);

    // On zoom-in, always fit Y to the newly fetched data.
    appState.pendingYMode = 'fit';
    appState.pendingRestoreY = null;

    updateAnalysisZoom(newStart, newEnd, sourceKind);
    if (!appState.refetchOnZoom) return;
    appState.fetchDebounceId = setTimeout(fetchAndRender, 150);
}

// ─── Fetch + render ──────────────────────────────────────────────────────────
async function fetchAndRender() {
    try {
        const startIso = new Date(appState.currentStart).toISOString();
        const endIso   = new Date(appState.currentEnd).toISOString();
        const width    = document.getElementById('main-chart').clientWidth || 1200;
        const cols     = appState.selectedCols.join(',');

        dbgGroup('fetchAndRender', () => {
            dbg('request', { startIso, endIso, width, cols });
        });

        const data = await fetchData(startIso, endIso, width, cols);
        appState.lastFetchedData = data;

        if (DEBUG) {
            const n = data?.ts?.length ?? 0;
            let tsMin = null;
            let tsMax = null;
            if (n > 0) {
                tsMin = data.ts[0];
                tsMax = data.ts[n - 1];
            }
            dbg('response points', n, 'tsMin/tsMax', tsMin, tsMax);
            if (!data?.ts || data.ts.length === 0) {
                console.warn('[edatime] fetchAndRender: empty result for range', { startIso, endIso, width, cols });
            }
        }

        ensureRangeStateFromData(data);
        buildRangeControls();

        // Drive the viewport using real axis values (not percent zoom).
        appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);

        renderCurrentData();

        // Apply pending Y mode after the new data is in.
        if (appState.pendingYMode === 'restore' && appState.pendingRestoreY) {
            appState.chart?.setYRange?.(appState.pendingRestoreY.min, appState.pendingRestoreY.max);
        } else if (appState.pendingYMode === 'fit') {
            appState.chart?.fitYToData?.();
        }

        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'data');

        if (DEBUG) {
            dbg('post-render yRange', yr);
        }

        appState.pendingYMode = null;
        appState.pendingRestoreY = null;
    } catch (err) {
        console.error('Failed to fetch data:', err);
        setMetaText('Error: ' + err.message);
    }
}

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
    // Initialize upload panel immediately so it always works regardless of WebGPU
    initUploadPanel();
    initAnalysisControls();
    try {
        await ensureChartModules();
    } catch (e) {
        console.error('Chart/data modules failed to load:', e);
        setMetaText('Chart modules failed to load, but upload is available.');
        return;
    }

    const gpuError = await checkWebGPU();
    if (gpuError) { showFatalError(gpuError); return; }

    try {
        appState.metadata = await fetchMetadata();
        dbgGroup('metadata', () => {
            dbg(appState.metadata);
        });
        setMetaText('Loading chart…');

        if (!appState.metadata.time_range) {
            setMetaText('No valid time range found.');
            return;
        }

        appState.numericCols  = appState.metadata.numeric_columns || [];
        appState.selectedCols = appState.numericCols.length > 0 ? [appState.numericCols[0]] : ['value'];

        const columnFilterInput = document.getElementById('column-filter-input');
        if (columnFilterInput) {
            columnFilterInput.addEventListener('input', (e) => {
                appState.filterText = (e.target.value || '').trim().toLowerCase();
                buildColumnToggles();
            });
        }

        buildColumnToggles();
        buildMetaBar(appState.metadata);
        buildRangeControls();

        appState.currentStart = Number(appState.metadata.time_range.min);
        appState.currentEnd   = Number(appState.metadata.time_range.max);
        updateAnalysisZoom(appState.currentStart, appState.currentEnd, 'initial');

        dbg('initial X range (ms)', { start: appState.currentStart, end: appState.currentEnd });

        appState.chart = new DataChart('main-chart', onZoomRangeChange, updateAnalysisYRange, zoomOut);
        await Promise.race([
            appState.chart.init(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('ChartGPU init timed out')), 6000)),
        ]);
        appState.analysisBound = false;
        bindAnalysisChartEvents();
        refreshZoomControlsState();
        appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);

        await fetchAndRender();
        // Save the initial full view (X + auto-fit Y) so Reset always returns here.
        appState.initialView = getCurrentView();
        dbgGroup('initialView snapshot', () => {
            dbg(appState.initialView);
        });

    } catch (e) {
        console.error('Primary chart failed, switching to fallback:', e);
        try {
            appState.chart = new FallbackChart('main-chart');
            await appState.chart.init();
            appState.analysisBound = false;
            bindAnalysisChartEvents();
            refreshZoomControlsState();
            await fetchAndRender();
            setMetaText('Fallback renderer active');
        } catch (fallbackErr) {
            console.error('Fallback chart also failed:', fallbackErr);
            setMetaText('Error: ' + fallbackErr.message);
        }
    }
}

init();
