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

// ─── Pages (Sidebar navigation) ───────────────────────────────────────────
function initPages() {
    const navButtons = Array.from(document.querySelectorAll('.sidebar .nav-item[data-page]'));
    const pages = Array.from(document.querySelectorAll('.page[data-page-name]'));
    if (navButtons.length === 0 || pages.length === 0) return;

    const layout = document.querySelector('.app-layout');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (layout && collapseBtn && !collapseBtn.dataset.bound) {
        collapseBtn.addEventListener('click', () => {
            layout.classList.toggle('sidebar-collapsed');
            // Ensure chart resizes when layout changes.
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        });
        collapseBtn.dataset.bound = '1';
    }

    function showPage(pageName) {
        for (const p of pages) {
            const hide = (p.dataset.pageName !== pageName);
            p.hidden = hide;
            // Avoid any CSS overriding [hidden].
            p.style.display = hide ? 'none' : 'flex';
        }
        for (const btn of navButtons) {
            btn.classList.toggle('active', btn.dataset.page === pageName);
        }

        if (pageName === 'chart') {
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        }
    }

    for (const btn of navButtons) {
        btn.addEventListener('click', () => showPage(btn.dataset.page));
    }

    // Default page.
    showPage('chart');
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
        import('./dataClient.js?v=11'),
        import('./chart.js?v=32'),
    ]);
    fetchMetadata = dataClient.fetchMetadata;
    fetchData = dataClient.fetchData;
    DataChart = chartModule.DataChart;
}

// ─── Column filter modal ───────────────────────────────────────────────────
function initColumnFilterModal() {
    const openBtn = document.getElementById('column-filter-open-btn');
    const modal = document.getElementById('column-filter-modal');
    const closeBtn = document.getElementById('column-filter-close-btn');
    const cancelBtn = document.getElementById('column-filter-cancel-btn');
    const applyBtn = document.getElementById('column-filter-apply-btn');
    const clearBtn = document.getElementById('column-filter-clear-btn');
    const colSelect = document.getElementById('column-filter-col');
    const minInput = document.getElementById('column-filter-min');
    const maxInput = document.getElementById('column-filter-max');
    const hint = document.getElementById('column-filter-hint');

    const openBtns = [openBtn].filter(Boolean);
    if (!modal || !closeBtn || !cancelBtn || !applyBtn || !clearBtn || !colSelect || !minInput || !maxInput || !hint) return;
    if (modal.dataset.bound) return;

    function setHint(text) {
        hint.textContent = text || '';
    }

    function getFullBoundsForCol(col) {
        const values = appState.lastFetchedData?.values?.[col];
        if (!values) return null;
        return computeBounds(values);
    }

    function populateColumns(selectedCol = null) {
        const cols = appState.selectedCols || [];
        colSelect.innerHTML = '';

        if (cols.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No series selected';
            colSelect.appendChild(opt);
            colSelect.value = '';
            return;
        }

        for (const col of cols) {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            colSelect.appendChild(opt);
        }

        if (selectedCol && cols.includes(selectedCol)) colSelect.value = selectedCol;
        else colSelect.value = cols[0];
    }

    function refreshInputsForCol(col) {
        if (!col) {
            minInput.value = '';
            maxInput.value = '';
            applyBtn.disabled = true;
            clearBtn.disabled = true;
            setHint('Select a column to filter.');
            return;
        }

        if (!appState.lastFetchedData) {
            applyBtn.disabled = true;
            clearBtn.disabled = true;
            setHint('Data not loaded yet.');
            return;
        }

        const full = getFullBoundsForCol(col);
        if (!full) {
            applyBtn.disabled = true;
            clearBtn.disabled = true;
            setHint('No data for this column in the current range.');
            return;
        }

        const cur = appState.columnRanges[col] ?? { from: full.min, to: full.max };
        minInput.value = String(cur.from);
        maxInput.value = String(cur.to);
        applyBtn.disabled = false;
        clearBtn.disabled = false;
        setHint(`Full range: ${formatAnalysisNumber(full.min)} → ${formatAnalysisNumber(full.max)}`);
    }

    function openModalForCol(col) {
        populateColumns(col || colSelect.value || appState.selectedCols?.[0] || null);
        refreshInputsForCol(colSelect.value);
        modal.hidden = false;
        try { minInput.focus(); } catch (_) {}
    }

    function closeModal() {
        modal.hidden = true;
        setHint('');
    }

    // Expose helper so range chips can open the modal directly.
    window.__edatime = window.__edatime || {};
    window.__edatime.openFilterForCol = openModalForCol;

    for (const btn of openBtns) {
        btn.addEventListener('click', () => openModalForCol(null));
    }
    closeBtn.addEventListener('click', () => closeModal());
    cancelBtn.addEventListener('click', () => closeModal());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    window.addEventListener('keydown', (e) => {
        if (modal.hidden) return;
        if (e.key === 'Escape') closeModal();
    });

    colSelect.addEventListener('change', () => {
        refreshInputsForCol(colSelect.value);
    });

    clearBtn.addEventListener('click', () => {
        const col = colSelect.value;
        const full = getFullBoundsForCol(col);
        if (!col || !full) return;

        appState.columnRanges[col] = { from: full.min, to: full.max };
        buildRangeControls();
        renderCurrentData();
        appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'filter');
        refreshInputsForCol(col);
    });

    applyBtn.addEventListener('click', () => {
        const col = colSelect.value;
        if (!col) return;

        let from = Number.parseFloat(minInput.value);
        let to = Number.parseFloat(maxInput.value);

        const full = getFullBoundsForCol(col);
        if (full) {
            if (!Number.isFinite(from)) from = full.min;
            if (!Number.isFinite(to)) to = full.max;
        }

        if (!Number.isFinite(from) || !Number.isFinite(to)) {
            setHint('Enter a valid min and max.');
            return;
        }

        if (from > to) {
            const tmp = from;
            from = to;
            to = tmp;
        }

        appState.columnRanges[col] = { from, to };
        buildRangeControls();
        renderCurrentData();
        appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'filter');
        closeModal();
    });

    modal.dataset.bound = '1';
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
    pendingYMode: 'fit',     // 'fit' | 'restore' | null
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
    const cols = appState.numericCols?.length ?? 0;
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
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function sanitizeSelectedColumns() {
    const blockedNames = new Set(['ts', 'timestamp', 'time']);
    const datetimeCols = new Set(
        (appState.metadata?.columns || [])
            .filter((col) => /date|time/i.test(String(col?.dtype || '')))
            .map((col) => String(col?.name || '').toLowerCase())
    );

    appState.selectedCols = (appState.selectedCols || []).filter((col) => {
        const name = String(col || '').trim();
        if (!name) return false;
        const lower = name.toLowerCase();
        if (blockedNames.has(lower)) return false;
        if (datetimeCols.has(lower)) return false;
        return true;
    });

    if (appState.selectedCols.length === 0) {
        const fallback = (appState.numericCols || []).find((col) => {
            const lower = String(col || '').toLowerCase();
            return !blockedNames.has(lower) && !datetimeCols.has(lower);
        });
        if (fallback) appState.selectedCols = [fallback];
    }
}

function computeRenderedYDebugSnapshot() {
    if (!appState.lastFetchedData) return null;

    const filtered = applyColumnRanges(appState.lastFetchedData);
    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;
    const perSeries = [];

    for (const col of appState.selectedCols || []) {
        const seriesData = filtered.series?.[col];
        const yValues = seriesData ? seriesData.y : filtered.values?.[col];
        if (!yValues) continue;

        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        let count = 0;
        for (let i = 0; i < yValues.length; i++) {
            const y = Number(yValues[i]);
            if (!Number.isFinite(y)) continue;
            count += 1;
            if (y < min) min = y;
            if (y > max) max = y;
        }

        if (count > 0) {
            if (min < globalMin) globalMin = min;
            if (max > globalMax) globalMax = max;
        }

        perSeries.push({
            name: col,
            points: count,
            yMin: count > 0 ? min : null,
            yMax: count > 0 ? max : null,
        });
    }

    return {
        selectedCols: [...(appState.selectedCols || [])],
        globalYMin: Number.isFinite(globalMin) ? globalMin : null,
        globalYMax: Number.isFinite(globalMax) ? globalMax : null,
        perSeries,
    };
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

    if (DEBUG) {
        const snapshot = computeRenderedYDebugSnapshot();
        dbgGroup('click-debug', () => {
            dbg('payload', payload);
            dbg('tooltipValueY', y);
            dbg('renderedSnapshot', snapshot);
            dbg('chartYRange', appState.chart?.getYRange?.());
        });
    }
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

        if (DEBUG) {
            const now = Date.now();
            const last = appState._debugLastCrosshairLogTs ?? 0;
            if (now - last >= 500) {
                appState._debugLastCrosshairLogTs = now;
                dbg('crosshair-debug', {
                    payload,
                    xAbs: x,
                    chartYRange: appState.chart?.getYRange?.(),
                });
            }
        }
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
    sanitizeSelectedColumns();
    const container = document.getElementById('column-toggles');
    if (!container) return;
    container.innerHTML = '';

    // Double-click a chip to open the filter modal for that column.
    if (!container.dataset.dblBound) {
        container.addEventListener('dblclick', (e) => {
            const chip = e.target?.closest?.('.series-chip');
            if (!chip) return;
            const input = chip.querySelector('input[type="checkbox"]');
            const col = input?.value;
            if (!col) return;
            const open = window.__edatime?.openFilterForCol;
            if (typeof open !== 'function') return;
            e.preventDefault();
            e.stopPropagation();
            open(col);
        });
        container.dataset.dblBound = '1';
    }

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
        chip.className = 'range-chip range-chip--clickable';
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-label', `Filter ${col}`);
        chip.innerHTML = `
            <span class="name">${col}</span>
            <span class="range">${formatAnalysisNumber(range.from)} → ${formatAnalysisNumber(range.to)}</span>
        `;

        const open = () => {
            const fn = window.__edatime?.openFilterForCol;
            if (typeof fn === 'function') fn(col);
        };

        chip.addEventListener('click', open);
        chip.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });
        container.appendChild(chip);
    }
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

    // Panel open/close
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('open');
            toggleBtn.classList.toggle('btn-primary');
            toggleBtn.classList.toggle('btn-ghost');
        });
    } else {
        // In the sidebar Upload page layout the panel should be visible.
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

    // Set initial state
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

            const toIsoOrNull = (datetimeLocalValue) => {
                const v = (datetimeLocalValue || '').trim();
                if (!v) return null;
                const ms = Date.parse(v);
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

// ─── Chart page gestures ───────────────────────────────────────────────────
function initChartPageFilterGesture() {
    const pageChart = document.getElementById('page-chart');
    if (!pageChart) return;
    if (pageChart.dataset.filterDblBound) return;

    pageChart.addEventListener('dblclick', (e) => {
        // Keep double-click on the plot itself for zoom-out history.
        const inPlot = e.target?.closest?.('#main-chart');
        if (inPlot) return;

        const open = window.__edatime?.openFilterForCol;
        if (typeof open !== 'function') return;
        open(null);
    });

    pageChart.dataset.filterDblBound = '1';
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
        sanitizeSelectedColumns();
        const startIso = new Date(appState.currentStart).toISOString();
        const endIso   = new Date(appState.currentEnd).toISOString();
        const width    = document.getElementById('main-chart').clientWidth || 1200;
        const cols     = appState.selectedCols.join(',');

        dbgGroup('fetchAndRender', () => {
            dbg('request', { startIso, endIso, width, cols });
            dbg('selectedCols', appState.selectedCols);
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

        if (DEBUG) {
            const snapshot = computeRenderedYDebugSnapshot();
            window.__edatime.debugYSnapshot = snapshot;
            dbg('post-render renderedSnapshot', snapshot);
        }

        // Y axis is fully managed by ChartGPU (no app-level min/max forcing).

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
    initPages();
    // Initialize upload panel immediately so it always works regardless of WebGPU
    initUploadPanel();
    initAnalysisControls();
    initColumnFilterModal();
    initChartPageFilterGesture();
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

        appState.numericCols = (appState.metadata.numeric_columns || [])
            .filter((col) => col && col.toLowerCase() !== 'ts');
        appState.selectedCols = appState.numericCols.length > 0 ? [appState.numericCols[0]] : ['value'];
        sanitizeSelectedColumns();

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
