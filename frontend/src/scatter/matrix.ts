/**
 * Scatter matrix view: pairwise grid with mini scatter canvases and diagonal distributions.
 */

import { fetchScatterPoints, fetchFft } from '../dataClient.js';
import {
    getEl,
    fmt,
    escapeHtml,
    setPanelStatus,
    createMiniCanvas,
    drawMiniScatterCanvas,
    drawMiniDensityCanvas,
    drawDistributionCanvas,
    buildCategoricalColorGroups,
    MATRIX_POINT_LIMIT,
    MATRIX_MAX_COLUMNS,
} from './helpers.js';
import {
    state,
    currentControls,
    buildScatterQueryContext,
    buildOverviewContextKey,
    ensureOptions,
    type MatrixCellData,
    type ScatterControls,
} from './state.js';
import { buildGroupedDistributionSeries } from './distributions.js';

let draggingMatrixColumn: string | null = null;

/* ── Column selection ─────────────────────────────────── */

function collectOverviewColumns(): string[] {
    const controls = currentControls();
    const columns: string[] = [];
    const push = (c: string) => { if (!c || columns.includes(c)) return; columns.push(c); };
    push(controls.x);
    push(controls.y);
    for (const item of state.lastSuggestions || []) {
        push(item?.column);
        if (columns.length >= MATRIX_MAX_COLUMNS) break;
    }
    for (const column of (state.metadata as any)?.numeric_columns || []) {
        push(column);
        if (columns.length >= MATRIX_MAX_COLUMNS) break;
    }
    return columns.slice(0, MATRIX_MAX_COLUMNS);
}

function buildOverviewColumns(): string[] {
    const derived = collectOverviewColumns();
    const next = state.matrixColumnOrder.filter((column) => derived.includes(column));
    for (const column of derived) {
        if (!next.includes(column)) next.push(column);
    }
    state.matrixColumnOrder = next.slice(0, MATRIX_MAX_COLUMNS);
    return state.matrixColumnOrder;
}

function moveColumn(columns: string[], source: string, target: string): string[] {
    if (!source || !target || source === target) return columns.slice();
    const sourceIndex = columns.indexOf(source);
    const targetIndex = columns.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return columns.slice();
    const next = columns.slice();
    const [item] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, item);
    return next;
}

function bindReorderHandle(
    handle: HTMLElement,
    column: string,
    columns: string[],
    onColumnReorder: ((nextColumns: string[]) => void) | null,
): void {
    if (!onColumnReorder) return;
    handle.draggable = true;
    handle.dataset.column = column;

    handle.addEventListener('dragstart', (event: DragEvent) => {
        draggingMatrixColumn = column;
        handle.classList.add('dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', column);
        }
    });

    handle.addEventListener('dragend', () => {
        draggingMatrixColumn = null;
        handle.classList.remove('dragging');
        document.querySelectorAll('.scatter-matrix-drop-target').forEach((element) => {
            element.classList.remove('scatter-matrix-drop-target');
        });
    });

    handle.addEventListener('dragover', (event: DragEvent) => {
        const source = draggingMatrixColumn || event.dataTransfer?.getData('text/plain') || '';
        if (!source || source === column) return;
        event.preventDefault();
        handle.classList.add('scatter-matrix-drop-target');
    });

    handle.addEventListener('dragleave', () => {
        handle.classList.remove('scatter-matrix-drop-target');
    });

    handle.addEventListener('drop', (event: DragEvent) => {
        const source = draggingMatrixColumn || event.dataTransfer?.getData('text/plain') || '';
        handle.classList.remove('scatter-matrix-drop-target');
        if (!source || source === column) return;
        event.preventDefault();
        onColumnReorder(moveColumn(columns, source, column));
    });
}

/* ── Data fetch ───────────────────────────────────────── */

async function fetchMatrixCellData(
    x: string,
    y: string,
    context: ReturnType<typeof buildScatterQueryContext>,
    colorColumn: string,
): Promise<MatrixCellData> {
    const cacheKey = `${x}|${y}|${colorColumn || ''}|${buildOverviewContextKey(context)}`;
    const cached = state.matrixCache.get(cacheKey);
    if (cached) return cached;

    const request = fetchScatterPoints(x, y, MATRIX_POINT_LIMIT, colorColumn || null, context)
        .then((response: any) => ({
            totalPoints: Number(response?.total_points ?? 0),
            points: Array.isArray(response?.points) ? response.points : [],
            colorValues: Array.isArray(response?.color_values) ? response.color_values : null,
            colorLabels: Array.isArray(response?.color_labels) ? response.color_labels : null,
        }))
        .catch((error: any) => { state.matrixCache.delete(cacheKey); throw error; });

    state.matrixCache.set(cacheKey, request);

    // Evict oldest entries when the cache exceeds a reasonable size to
    // prevent unbounded memory growth on long-lived sessions.
    const MAX_MATRIX_CACHE = 256;
    if (state.matrixCache.size > MAX_MATRIX_CACHE) {
        const keys = state.matrixCache.keys();
        let toRemove = state.matrixCache.size - MAX_MATRIX_CACHE;
        for (const k of keys) {
            if (toRemove-- <= 0) break;
            state.matrixCache.delete(k);
        }
    }

    return request;
}

/* ── Pair selection ───────────────────────────────────── */

export async function selectMatrixPair(
    x: string,
    y: string,
    refreshCorrelations: () => Promise<void>,
    renderScatter: () => Promise<void>,
    setScatterView: (view: string, opts?: { render?: boolean }) => Promise<void>,
): Promise<void> {
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    if (!xSelect || !ySelect) return;
    xSelect.value = x;
    await refreshCorrelations();
    ySelect.value = y;
    await setScatterView('plot', { render: false });
    await renderScatter();
}

/* ── Grid rendering ───────────────────────────────────── */

function describeDistributionMode(mode: string): string {
    if (mode === 'kde') return 'KDE';
    if (mode === 'boxplot') return 'Box Plot';
    return 'Histogram';
}

export function renderMatrixGrid(
    columns: string[],
    datasets: Map<string, MatrixCellData>,
    onCellClick: (x: string, y: string) => void,
    onColumnReorder: ((nextColumns: string[]) => void) | null = null,
): void {
    const container = getEl('scatter-matrix');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(columns) || columns.length < 2) {
        container.innerHTML = '<div class="scatter-placeholder">Choose scatter axes first. The matrix will then add related numeric columns, and you can drag the row or column headers to reorder the grid.</div>';
        return;
    }

    const controls = currentControls();
    const diagonalMode = controls.diagonalMode;
    const matrixMode = controls.matrixMode;
    const cellSize = controls.matrixCellSize;
    const grid = document.createElement('div');
    grid.className = 'scatter-matrix-grid';
    grid.style.gridTemplateColumns = `60px repeat(${columns.length}, ${cellSize}px)`;

    const corner = document.createElement('div');
    corner.className = 'scatter-matrix-corner';
    corner.innerHTML = '<span class="scatter-matrix-corner-axis">Y</span><span class="scatter-matrix-corner-sep">/</span><span class="scatter-matrix-corner-axis">X</span>';
    grid.appendChild(corner);

    for (const column of columns) {
        const header = document.createElement('div');
        header.className = 'scatter-matrix-header';
        header.textContent = column;
        bindReorderHandle(header, column, columns, onColumnReorder);
        grid.appendChild(header);
    }

    const drawJobs: (() => void)[] = [];
    for (const rowColumn of columns) {
        const rowHeader = document.createElement('div');
        rowHeader.className = 'scatter-matrix-row-header';
        rowHeader.textContent = rowColumn;
        bindReorderHandle(rowHeader, rowColumn, columns, onColumnReorder);
        grid.appendChild(rowHeader);

        for (const column of columns) {
            const data = datasets.get(`${column}|${rowColumn}`) || { totalPoints: 0, points: [], colorValues: null, colorLabels: null };

            if (rowColumn === column) {
                const diagonal = document.createElement('div');
                diagonal.className = 'scatter-matrix-diagonal';
                diagonal.style.width = `${cellSize}px`;
                diagonal.style.height = `${cellSize}px`;
                const canvas = createMiniCanvas('scatter-matrix-diagonal-canvas', cellSize - 32);
                canvas.style.width = '100%';
                const values = data.points.map((p: any) => Number(p?.[0])).filter((v: number) => Number.isFinite(v));
                const groupedSeries = controls.selectedColorColumn
                    ? buildGroupedDistributionSeries(values, data.colorLabels)
                    : null;
                drawJobs.push(() => {
                    drawDistributionCanvas(
                        canvas, diagonalMode,
                        groupedSeries || [{ label: column, color: '#00c896', values }],
                    );
                });
                const meta = document.createElement('div');
                meta.className = 'scatter-diagonal-meta';
                meta.textContent = groupedSeries
                    ? `${describeDistributionMode(diagonalMode)} grouped by ${controls.selectedColorColumn}`
                    : describeDistributionMode(diagonalMode);
                diagonal.append(canvas, meta);
                grid.appendChild(diagonal);
                continue;
            }

            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'scatter-matrix-cell';
            cell.style.width = `${cellSize}px`;
            cell.style.height = `${cellSize}px`;
            if (controls.x === column && controls.y === rowColumn) cell.classList.add('active');
            const canvas = createMiniCanvas('scatter-matrix-cell-canvas', cellSize - 32);
            canvas.style.width = '100%';
            const categoryGroups = buildCategoricalColorGroups(data.colorLabels);
            drawJobs.push(() => {
                if (matrixMode === 'density') {
                    drawMiniDensityCanvas(canvas, data.points, { colorScale: controls.colorScale });
                } else {
                    drawMiniScatterCanvas(canvas, data.points, {
                        color: '#4a9eff',
                        colorValues: data.colorValues,
                        colorLabels: categoryGroups ? data.colorLabels : null,
                        colorScale: controls.colorScale,
                        categoryColors: categoryGroups?.colorByLabel,
                    });
                }
            });
            const meta = document.createElement('div');
            meta.className = 'scatter-matrix-meta';
            meta.innerHTML = `<span>${escapeHtml(column)} → ${escapeHtml(rowColumn)}</span><span>${escapeHtml(fmt.format(Number(data.totalPoints || data.points.length || 0)))} pts</span>`;
            cell.append(canvas, meta);
            cell.addEventListener('click', () => onCellClick(column, rowColumn));
            grid.appendChild(cell);
        }
    }

    container.appendChild(grid);
    for (const draw of drawJobs) draw();
}

/* ── Overview fetch + render ──────────────────────────── */

export async function renderScatterOverview(
    onCellClick: (x: string, y: string) => void,
): Promise<void> {
    const columns = buildOverviewColumns();
    if (columns.length < 2) { renderMatrixGrid(columns, new Map(), onCellClick, null); return; }

    const controls = currentControls();
    setPanelStatus('scatter-matrix-status', 'Refreshing matrix for the current filters and linked time window...');
    const context = buildScatterQueryContext();
    const requestId = ++state.overviewRequestId;

    const pairs: [string, string][] = [];
    for (const row of columns) for (const col of columns) pairs.push([col, row]);

    try {
        const resolved = await Promise.all(pairs.map(async ([col, row]) => {
            const data = await fetchMatrixCellData(col, row, context, controls.selectedColorColumn);
            return { key: `${col}|${row}`, data };
        }));
        if (requestId !== state.overviewRequestId) return;
        const datasets = new Map(resolved.map((e) => [e.key, e.data]));
        const rerenderOrderedGrid = (nextColumns: string[]) => {
            state.matrixColumnOrder = nextColumns.slice(0, MATRIX_MAX_COLUMNS);
            renderMatrixGrid(state.matrixColumnOrder, datasets, onCellClick, rerenderOrderedGrid);
            void renderMatrixFftPanel();
        };
        renderMatrixGrid(columns, datasets, onCellClick, rerenderOrderedGrid);
        const groups = buildCategoricalColorGroups(state.colorLabels);
        const groupText = groups && controls.selectedColorColumn
            ? ` Grouped distributions use ${controls.selectedColorColumn}.`
            : '';
        setPanelStatus('scatter-matrix-status', `Matrix shows ${columns.length} linked columns with ${describeDistributionMode(controls.diagonalMode)} diagonals. Drag headers to reorder.${groupText}`);
    } catch (error) {
        if (requestId !== state.overviewRequestId) return;
        console.error(error);
        renderMatrixGrid(columns, new Map(), onCellClick, null);
        setPanelStatus('scatter-matrix-status', 'Matrix preview is temporarily unavailable for this query.');
    }
}

export async function renderScatterMatrixView(
    onCellClick: (x: string, y: string) => void,
): Promise<void> {
    await Promise.all([
        renderScatterOverview(onCellClick),
        renderMatrixFftPanel(),
    ]);
}

/* ── Matrix FFT panel ─────────────────────────────────── */

function drawMiniFftCanvas(canvas: HTMLCanvasElement, frequencies: number[], values: number[], label: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width || 200, 60);
    const h = Math.max(rect.height || 120, 60);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = { left: 8, right: 8, top: 22, bottom: 8 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Log-transform for readability
    const yVals = values.map((v) => (v > 0 ? Math.log10(v) : -10));
    let yMin = Infinity, yMax = -Infinity, xMaxRaw = 0;
    for (let i = 0; i < frequencies.length; i++) {
        if (frequencies[i] > xMaxRaw) xMaxRaw = frequencies[i];
        if (Number.isFinite(yVals[i])) {
            if (yVals[i] < yMin) yMin = yVals[i];
            if (yVals[i] > yMax) yMax = yVals[i];
        }
    }
    if (!Number.isFinite(yMin)) yMin = 0;
    if (!Number.isFinite(yMax)) yMax = 1;
    if (yMax <= yMin) yMax = yMin + 1;

    // Auto-scale x axis
    let xScale = 1;
    if (xMaxRaw > 0 && xMaxRaw < 0.001) xScale = 1e6;
    else if (xMaxRaw > 0 && xMaxRaw < 1) xScale = 1000;
    else if (xMaxRaw >= 1000) xScale = 0.001;
    const xMax = Math.max(xMaxRaw * xScale, 1e-12);

    ctx.fillStyle = 'rgba(14, 18, 32, 0.95)';
    ctx.fillRect(0, 0, w, h);

    // Column label
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `bold 11px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, pad.left, 6);

    // Data line
    ctx.strokeStyle = '#7ad151';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < frequencies.length; i++) {
        if (!Number.isFinite(yVals[i])) continue;
        const px = pad.left + ((frequencies[i] * xScale) / xMax) * plotW;
        const py = pad.top + plotH - ((yVals[i] - yMin) / (yMax - yMin)) * plotH;
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Border
    ctx.strokeStyle = 'rgba(54, 63, 98, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

export async function renderMatrixFftPanel(): Promise<void> {
    const panel = getEl('scatter-matrix-fft-panel');
    const chartsContainer = getEl('scatter-matrix-fft-charts');
    if (!panel || !chartsContainer) return;

    const context = buildScatterQueryContext();
    if (!context.start || !context.end) {
        (panel as HTMLElement).hidden = true;
        return;
    }

    const columns = buildOverviewColumns();
    if (columns.length < 1) { (panel as HTMLElement).hidden = true; return; }

    (panel as HTMLElement).hidden = false;
    setPanelStatus('scatter-matrix-fft-status', 'Computing FFT…');

    try {
        const startIso = new Date(context.start).toISOString();
        const endIso = new Date(context.end).toISOString();
        const resp = await fetchFft(startIso, endIso, columns.join(','), 4096);

        chartsContainer.innerHTML = '';
        for (const result of resp.results || []) {
            const card = document.createElement('div');
            card.className = 'scatter-matrix-fft-card';
            const canvas = document.createElement('canvas');
            canvas.className = 'scatter-matrix-fft-canvas';
            canvas.style.width = '100%';
            canvas.style.height = '120px';
            card.appendChild(canvas);
            chartsContainer.appendChild(card);

            // Navigate to FFT page and compute for this column on click
            const colName = result.column;
            card.title = `Open FFT page for ${colName}`;
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                const navBtn = document.querySelector('.sidebar .nav-item[data-page="fft"]') as HTMLElement | null;
                navBtn?.click();
                // Activate the column chip on the FFT page after navigation
                requestAnimationFrame(() => {
                    const chip = document.querySelector<HTMLElement>(`.fft-trace-chip[data-col="${colName}"]`);
                    if (chip && !chip.classList.contains('active')) chip.click();
                });
            });

            // Defer draw until canvas is in DOM and has layout
            requestAnimationFrame(() => {
                drawMiniFftCanvas(canvas, result.frequencies, result.magnitudes, result.column);
            });
        }

        setPanelStatus('scatter-matrix-fft-status', `${resp.sample_count ?? 0} samples`);
    } catch {
        setPanelStatus('scatter-matrix-fft-status', 'FFT unavailable for current range.');
        (panel as HTMLElement).hidden = true;
    }
}
