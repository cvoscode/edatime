/**
 * Scatter matrix view: pairwise grid with mini scatter canvases and diagonal distributions.
 */

import { fetchScatterMatrix, fetchFft } from '../../services/api/index.js';
import {
    getEl,
    fmt,
    escapeHtml,
    setPanelStatus,
    buildCategoricalColorGroups,
    MATRIX_POINT_LIMIT,
    MATRIX_MAX_COLUMNS,
} from './helpers.js';
import {
    currentControls,
    buildScatterQueryContext,
    buildOverviewContextKey,
    ensureOptions,
    type MatrixCellData,
    type ScatterControls,
} from './state.js';
import { scatterState } from '../../store/scatterState.js';
import { setDropdownValue } from '../../ui/primitives/Dropdown.js';
import { describeDistributionMode, renderMatrixGrid } from './matrixGrid.js';
import type { WorkspaceSnapshot } from '../../contracts/workspace.js';

type ScatterIntent = Pick<WorkspaceSnapshot, 'filters' | 'viewport'>;

/* ── Column selection ─────────────────────────────────── */

function collectOverviewColumns(): string[] {
    const controls = currentControls();
    const columns: string[] = [];
    const push = (c: string) => { if (!c || columns.includes(c)) return; columns.push(c); };
    push(controls.x);
    push(controls.y);
    for (const item of scatterState.lastSuggestions || []) {
        push(item?.x);
        push(item?.y);
        if (columns.length >= MATRIX_MAX_COLUMNS) break;
    }
    for (const column of (scatterState.metadata as any)?.numeric_columns || []) {
        push(column);
        if (columns.length >= MATRIX_MAX_COLUMNS) break;
    }
    return columns.slice(0, MATRIX_MAX_COLUMNS);
}

function buildOverviewColumns(): string[] {
    const derived = collectOverviewColumns();
    const next = scatterState.matrixColumnOrder.filter((column) => derived.includes(column));
    for (const column of derived) {
        if (!next.includes(column)) next.push(column);
    }
    scatterState.matrixColumnOrder = next.slice(0, MATRIX_MAX_COLUMNS);
    return scatterState.matrixColumnOrder;
}

/* ── Data fetch ───────────────────────────────────────── */

export interface MatrixRenderSession {
    begin(): AbortSignal;
    currentSignal(): AbortSignal;
    dispose(): void;
}

/** Owns abort-before-new cancellation for one Scatter page instance. */
export function createMatrixRenderSession(): MatrixRenderSession {
    let controller: AbortController | null = null;
    const idleSignal = new AbortController().signal;
    return {
        begin() {
            controller?.abort();
            controller = new AbortController();
            return controller.signal;
        },
        currentSignal() {
            return controller?.signal ?? idleSignal;
        },
        dispose() {
            controller?.abort();
            controller = null;
        },
    };
}

function buildMatrixBatchCacheKey(
    pairs: [string, string][],
    context: ReturnType<typeof buildScatterQueryContext>,
    colorColumn: string,
): string {
    return JSON.stringify({
        pairs,
        colorColumn: colorColumn || '',
        context: buildOverviewContextKey(context),
        limit: MATRIX_POINT_LIMIT,
    });
}

async function fetchMatrixBatchData(
    pairs: [string, string][],
    context: ReturnType<typeof buildScatterQueryContext>,
    colorColumn: string,
    signal: AbortSignal,
): Promise<Map<string, MatrixCellData>> {
    const cacheKey = buildMatrixBatchCacheKey(pairs, context, colorColumn);
    const cached = scatterState.matrixBatchCache.get(cacheKey);
    if (cached) return cached;

    const request = fetchScatterMatrix(
        pairs.map(([x, y]) => ({ x, y })),
        colorColumn || null,
        context,
        MATRIX_POINT_LIMIT,
        { signal },
    )
        .then((response) => response.cells)
        .catch((error: any) => {
            scatterState.matrixBatchCache.delete(cacheKey);
            throw error;
        });

    scatterState.matrixBatchCache.set(cacheKey, request);

    const MAX_MATRIX_BATCH_CACHE = 64;
    if (scatterState.matrixBatchCache.size > MAX_MATRIX_BATCH_CACHE) {
        const keys = scatterState.matrixBatchCache.keys();
        let toRemove = scatterState.matrixBatchCache.size - MAX_MATRIX_BATCH_CACHE;
        for (const k of keys) {
            if (toRemove-- <= 0) break;
            scatterState.matrixBatchCache.delete(k);
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
    if (!getEl('scatter-x-col') || !getEl('scatter-y-col')) return;
    setDropdownValue('scatter-x-col', x);
    await refreshCorrelations();
    setDropdownValue('scatter-y-col', y);
    await setScatterView('plot', { render: false });
    await renderScatter();
}

/* ── Grid rendering ───────────────────────────────────── */

function matrixPairPriority(
    pair: [string, string],
    controls: Pick<ScatterControls, 'x' | 'y'>,
    suggestionRank: Map<string, number>,
): number {
    const [column, row] = pair;
    if (column === controls.x && row === controls.y) return 0;
    if (column === controls.y && row === controls.x) return 1;

    const isDiagonal = column === row;
    const currentAxisRank = [column, row].includes(controls.x) || [column, row].includes(controls.y) ? 0 : 1;
    const suggestionColumnRank = suggestionRank.get(column) ?? Number.POSITIVE_INFINITY;
    const suggestionRowRank = suggestionRank.get(row) ?? Number.POSITIVE_INFINITY;
    const bestSuggestionRank = Math.min(suggestionColumnRank, suggestionRowRank);

    if (currentAxisRank === 0 && Number.isFinite(bestSuggestionRank)) return 10 + bestSuggestionRank;
    if (isDiagonal && currentAxisRank === 0) return 20;
    if (isDiagonal && Number.isFinite(bestSuggestionRank)) return 30 + bestSuggestionRank;
    if (Number.isFinite(bestSuggestionRank)) return 40 + bestSuggestionRank;
    if (isDiagonal) return 60;
    return 100;
}

export function buildMatrixFetchPairs(
    columns: string[],
    controls: Pick<ScatterControls, 'x' | 'y'>,
    suggestions: Array<{ x?: string | null; y?: string | null }> = [],
): [string, string][] {
    const suggestionRank = new Map<string, number>();
    suggestions.forEach((item, index) => {
        for (const raw of [item?.x, item?.y]) {
            const column = String(raw || '').trim();
            if (!column || suggestionRank.has(column)) continue;
            suggestionRank.set(column, index);
        }
    });

    return columns
        .flatMap((row) => columns.map((column) => [column, row] as [string, string]))
        .sort((left, right) => {
            const leftPriority = matrixPairPriority(left, controls, suggestionRank);
            const rightPriority = matrixPairPriority(right, controls, suggestionRank);
            if (leftPriority !== rightPriority) return leftPriority - rightPriority;

            if (left[1] !== right[1]) return columns.indexOf(left[1]) - columns.indexOf(right[1]);
            return columns.indexOf(left[0]) - columns.indexOf(right[0]);
        });
}

/* ── Overview fetch + render ──────────────────────────── */

export async function renderScatterOverview(
    onCellClick: (x: string, y: string) => void,
    intent?: ScatterIntent,
    session: MatrixRenderSession = createMatrixRenderSession(),
): Promise<void> {
    const columns = buildOverviewColumns();
    if (columns.length < 2) { renderMatrixGrid(columns, new Map(), onCellClick, null); return; }

    const controls = currentControls();
    setPanelStatus('scatter-matrix-status', 'Refreshing matrix for the current filters and linked time window...');
    const requestId = ++scatterState.overviewRequestId;
    // Abort any in-flight matrix batch from a previous render so the new
    // render wins cleanly without piling up overlapping requests.
    const signal = session.begin();
    const pairs = buildMatrixFetchPairs(columns, controls, scatterState.lastSuggestions);
    const matrixContext = buildScatterQueryContext({
        colorColumn: controls.selectedColorColumn,
        scopeToColumns: false,
    }, intent);

    const datasets = new Map<string, MatrixCellData>();
    const rerenderOrderedGrid = (nextColumns: string[]) => {
        scatterState.matrixColumnOrder = nextColumns.slice(0, MATRIX_MAX_COLUMNS);
        renderMatrixGrid(scatterState.matrixColumnOrder, datasets, onCellClick, rerenderOrderedGrid);
    };
    renderMatrixGrid(columns, datasets, onCellClick, rerenderOrderedGrid);

    let hadErrors = false;
    let lastReportedCompleted = 0;

    const updateStatus = () => {
        const groups = buildCategoricalColorGroups(scatterState.colorLabels);
        const groupText = groups && controls.selectedColorColumn
            ? ` Grouped distributions use ${controls.selectedColorColumn}.`
            : '';
        const base = `Matrix loaded ${lastReportedCompleted}/${pairs.length} cells with ${describeDistributionMode(controls.diagonalMode)} diagonals.`;
        const hint = lastReportedCompleted < pairs.length
            ? ' Prioritizing the current pair and suggested columns first.'
            : ' Drag headers to reorder.';
        const warning = hadErrors ? ' Some cells are temporarily unavailable.' : '';
        setPanelStatus('scatter-matrix-status', `${base}${hint}${warning}${groupText}`);
    };

    try {
        const batchData = await fetchMatrixBatchData(pairs, matrixContext, controls.selectedColorColumn, signal);
        if (requestId !== scatterState.overviewRequestId) return;
        batchData.forEach((data, key) => {
            datasets.set(key, data);
        });
        lastReportedCompleted = pairs.length;
        renderMatrixGrid(scatterState.matrixColumnOrder.length > 0 ? scatterState.matrixColumnOrder : columns, datasets, onCellClick, rerenderOrderedGrid);
        updateStatus();
    } catch (error) {
        if (requestId !== scatterState.overviewRequestId) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error(error);
        renderMatrixGrid(columns, new Map(), onCellClick, null);
        setPanelStatus('scatter-matrix-status', 'Matrix preview is temporarily unavailable for this query.');
    }
}

export async function renderScatterMatrixView(
    onCellClick: (x: string, y: string) => void,
    intent?: ScatterIntent,
    session: MatrixRenderSession = createMatrixRenderSession(),
): Promise<void> {
    await renderScatterOverview(onCellClick, intent, session);
    requestAnimationFrame(() => {
        void renderMatrixFftPanel(intent, session.currentSignal());
    });
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

export async function renderMatrixFftPanel(intent?: ScatterIntent, signal: AbortSignal = new AbortController().signal): Promise<void> {
    const panel = getEl('scatter-matrix-fft-panel');
    const chartsContainer = getEl('scatter-matrix-fft-charts');
    if (!panel || !chartsContainer) return;

    const controls = currentControls();
    const context = buildScatterQueryContext({
        x: controls.x,
        y: controls.y,
        colorColumn: controls.selectedColorColumn,
    }, intent);
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
        const resp = await fetchFft(startIso, endIso, columns.join(','), 4096, { signal });

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
                if (signal.aborted) return;
                drawMiniFftCanvas(canvas, result.frequencies, result.magnitudes, result.column);
            });
        }

        setPanelStatus('scatter-matrix-fft-status', `${resp.sample_count ?? 0} samples`);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            // Superseded matrix render — let the next render repopulate the panel.
            return;
        }
        setPanelStatus('scatter-matrix-fft-status', 'FFT unavailable for current range.');
        (panel as HTMLElement).hidden = true;
    }
}

export { renderMatrixGrid } from './matrixGrid.js';
