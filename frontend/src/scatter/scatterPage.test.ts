import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createChartMock = vi.fn();
const echartsInitMock = vi.fn();
const fetchScatterCorrelationsMock = vi.fn();
const fetchScatterPointsMock = vi.fn();
const renderScatterMatrixViewMock = vi.fn();
const emptyStateUpdateMock = vi.fn();
const toastMock = vi.fn();
const requestGpuAdapterMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]): Promise<{ name: string } | null> => ({ name: 'mock-adapter' })));

const freshScatterState = vi.hoisted(() => ({
    chart: null,
    initialized: false,
    pageInitialized: false,
    activeView: 'plot' as 'plot' | 'matrix',
    loading: false,
    metadata: null as any,
    totalPoints: 0,
    allPoints: [] as [number, number][],
    points: [] as [number, number][],
    allColorValues: null as number[] | null,
    allColorLabels: null as string[] | null,
    full: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    view: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    zoomHistory: [] as any[],
    drag: null,
    selectionBox: null,
    colorColumn: '',
    colorValues: null as number[] | null,
    colorLabels: null as string[] | null,
    colorMin: null as number | null,
    colorMax: null as number | null,
    colorCardinality: null as { requested: number; used: number; bucketed: number } | null,
    correlationsByColumn: new Map(),
    suggestionThreshold: 0.7,
    lastBinnedText: '',
    lastUpdateMs: 0,
    densityTooltipCache: null as any,
    lastOptionSeries: null as any,
    columnTypes: new Map<string, string>(),
    lastSuggestions: [] as any[],
    lastTopPairs: [] as any[],
    lastRenderSignature: '' as any,
    lastQueryContextKey: '',
    matrixCache: new Map(),
    matrixBatchCache: new Map(),
    matrixColumnOrder: [] as string[],
    overviewRequestId: 0,
    scatterRequestId: 0,
}));

vi.mock('../../libs/chartgpu/dist/index.js', () => ({
    createChart: (...args: unknown[]) => createChartMock(...args),
}));

vi.mock('echarts', () => ({
    init: (...args: unknown[]) => echartsInitMock(...args),
}));

vi.mock('../utils/platform.js', () => ({
    defaultGpuPowerPreference: () => null,
    requestGpuAdapter: (...args: unknown[]) => requestGpuAdapterMock(...args),
}));

vi.mock('../services/api/index.js', () => ({
    fetchScatterCorrelations: (...args: unknown[]) => fetchScatterCorrelationsMock(...args),
    fetchScatterPoints: (...args: unknown[]) => fetchScatterPointsMock(...args),
}));

vi.mock('../store/appStateCompat.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../store/appStateCompat.js')>();
    return {
        ...actual,
        appState: {
            ...actual.appState,
            metadata: null,
            currentStart: 0,
            currentEnd: 1_000,
            columnRanges: {},
            adaptiveLineFilters: [],
            scatter: freshScatterState,
        },
        buildAdaptiveLineFiltersForQuery: () => [],
    };
});

// scatterPage imports the canonical store; mirror the legacy `../state.js`
// mock so property assignments on `appState.scatter` are visible to the
// test. Without this, the real ScatterState singleton is used and the
// assertions in the "records scatter.metadata" test would fail.
vi.mock('../store/index.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../store/index.js')>();
    return {
        ...actual,
        appState: {
            ...actual.appState,
            metadata: null,
            currentStart: 0,
            currentEnd: 1_000,
            columnRanges: {},
            adaptiveLineFilters: [],
            scatter: freshScatterState,
        },
    };
});

vi.mock('../ui/emptyState.js', () => ({
    createEmptyStateController: () => ({ update: emptyStateUpdateMock }),
    isRangeOutsideDataset: () => false,
}));

const dismissAllToastsMock = vi.fn();
vi.mock('../utils/toast.js', () => ({
    toast: (...args: unknown[]) => toastMock(...args),
    dismissAllToasts: (...args: unknown[]) => dismissAllToastsMock(...args),
}));

vi.mock('./rendering.js', () => ({
    buildOption: () => ({}),
    renderCurrentOption: vi.fn(),
    updateColorbarUI: vi.fn(),
    updateBinnedReadout: vi.fn(),
    updateCorrelationStats: vi.fn(),
    updateMarginalPlots: vi.fn(),
    initSelectionZoom: vi.fn(),
    syncModeUI: vi.fn(),
    applyView: vi.fn(),
    resetView: vi.fn(),
    exportScatterPNG: vi.fn(),
    exportScatterSVG: vi.fn(),
    exportScatterHTML: vi.fn(),
    exportScatterData: vi.fn(),
    exportScatterParquet: vi.fn(),
    setCorrelationOverlayText: vi.fn(),
}));

vi.mock('./matrix.js', () => ({
    renderScatterMatrixView: (...args: unknown[]) => renderScatterMatrixViewMock(...args),
    selectMatrixPair: vi.fn(),
}));

function buildDom(): void {
    document.body.innerHTML = `
        <section id="page-scatter" data-page-name="scatter">
            <div class="btn-toggle-group" role="group" aria-label="Scatter page view">
                <button type="button" id="scatter-view-plot-btn" data-scatter-view="plot" aria-pressed="true">Plot</button>
                <button type="button" id="scatter-view-matrix-btn" data-scatter-view="matrix" aria-pressed="false">Matrix</button>
            </div>
            <select id="scatter-x-col"></select>
            <select id="scatter-y-col"></select>
            <input id="scatter-bin-size" type="range" value="10">
            <span id="scatter-bin-size-value"></span>
            <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
            <select id="scatter-render-mode">
                <option value="density" selected>Density</option>
                <option value="scatter">Scatter</option>
            </select>
            <select id="scatter-diagonal-mode"><option value="histogram" selected>Histogram</option></select>
            <select id="scatter-color-column"><option value="">None</option></select>
            <select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select>
            <input id="scatter-link-brush" type="checkbox" checked>
            <input id="scatter-matrix-link-range" type="checkbox">
            <input id="scatter-suggestion-threshold" type="range" value="0.7">
            <span id="scatter-suggestion-threshold-value"></span>
            <span id="scatter-suggestions-label"></span>
            <button id="scatter-open-causal-btn" type="button">Open in Causal</button>
            <div id="scatter-active-filter-badge"></div>
            <div id="scatter-suggestions"></div>
            <div id="scatter-chart"></div>
            <div id="scatter-chart-loading" hidden></div>
            <div id="scatter-matrix-status"></div>
            <div id="scatter-matrix"></div>
            <div id="scatter-matrix-loading" hidden></div>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" type="range" value="160">
            <span id="scatter-matrix-cell-size-value"></span>
            <div id="scatter-analytics-group"></div>
            <span id="scatter-mode-label"></span>
            <div id="scatter-density-controls"></div>
            <div id="scatter-color-controls"></div>
            <div class="scatter-export-group"></div>
            <div class="scatter-stats-bar"></div>
            <div data-scatter-view-panel="plot"></div>
            <div data-scatter-view-panel="matrix" hidden></div>
        </section>
    `;
}

describe('initScatterPage view toggles', () => {
    const windowListeners: Array<{
        type: string;
        listener: EventListenerOrEventListenerObject;
        options?: boolean | AddEventListenerOptions;
    }> = [];
    let originalAddEventListener: typeof window.addEventListener;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        windowListeners.length = 0;
        originalAddEventListener = window.addEventListener.bind(window);
        vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
            windowListeners.push({ type, listener, options });
            return originalAddEventListener(type, listener, options);
        });
        buildDom();
        requestGpuAdapterMock.mockReset();
        requestGpuAdapterMock.mockResolvedValue({ name: 'mock-adapter' });

        // Reset the fresh state before each test
        freshScatterState.chart = null;
        freshScatterState.initialized = false;
        freshScatterState.pageInitialized = false;
        freshScatterState.activeView = 'plot';
        freshScatterState.loading = false;
        freshScatterState.metadata = null;
        freshScatterState.totalPoints = 0;
        freshScatterState.allPoints = [];
        freshScatterState.points = [];
        freshScatterState.allColorValues = null;
        freshScatterState.allColorLabels = null;
        freshScatterState.colorColumn = '';
        freshScatterState.colorValues = null;
        freshScatterState.colorLabels = null;
        freshScatterState.colorMin = null;
        freshScatterState.colorMax = null;
        freshScatterState.correlationsByColumn = new Map();
        freshScatterState.lastBinnedText = '';
        freshScatterState.lastUpdateMs = 0;
        freshScatterState.densityTooltipCache = null;
        freshScatterState.lastOptionSeries = null;
        freshScatterState.columnTypes = new Map();
        freshScatterState.lastSuggestions = [];
        freshScatterState.lastTopPairs = [];
        freshScatterState.lastRenderSignature = '';
        freshScatterState.lastQueryContextKey = '';
        freshScatterState.matrixCache = new Map();
        freshScatterState.matrixColumnOrder = [];
        freshScatterState.overviewRequestId = 0;
        freshScatterState.scatterRequestId = 0;

        createChartMock.mockResolvedValue({
            setOption: vi.fn(),
            resize: vi.fn(),
            onPerformanceUpdate: vi.fn(),
            dispose: vi.fn(),
        });
        fetchScatterCorrelationsMock.mockResolvedValue({
            numeric_columns: ['HUFL', 'HULL', 'OT'],
            base_column: 'HUFL',
            correlations: [],
            suggestions: [],
        });
        fetchScatterPointsMock.mockResolvedValue({
            points: [[1, 2], [2, 3]],
            total_points: 2,
            color_values: null,
            color_labels: null,
            color: '',
        });
        renderScatterMatrixViewMock.mockResolvedValue(undefined);
        echartsInitMock.mockReturnValue({
            setOption: vi.fn(),
            resize: vi.fn(),
            dispose: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
        });
    });

    afterEach(() => {
        for (const { type, listener, options } of windowListeners) {
            window.removeEventListener(type, listener, options);
        }
        windowListeners.length = 0;
        vi.restoreAllMocks();
    });

    it('switches into matrix mode when the matrix toggle is clicked', async () => {
        const { initScatterPage } = await import('./scatterPage.js');

        await initScatterPage({
            total_rows: 2,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'OT', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL', 'OT'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        (document.getElementById('scatter-view-matrix-btn') as HTMLButtonElement).click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(renderScatterMatrixViewMock).toHaveBeenCalledTimes(1);
        expect(document.getElementById('scatter-view-plot-btn')?.getAttribute('aria-pressed')).toBe('false');
        expect(document.getElementById('scatter-view-matrix-btn')?.getAttribute('aria-pressed')).toBe('true');
        expect((document.querySelector('[data-scatter-view-panel="plot"]') as HTMLElement).hidden).toBe(true);
        expect((document.querySelector('[data-scatter-view-panel="matrix"]') as HTMLElement).hidden).toBe(false);
    });

    it('resets the plot view when switching back from matrix so the chart is not blank', async () => {
        // Regression: users reported the plot looked empty after they
        // returned from the matrix view. Cause: a stale `view` from a
        // zoom/pan session was kept across the view switch and clamped
        // to zero because the underlying data had been replaced.
        const { initScatterPage, setScatterView, renderScatter } = await import('./scatterPage.js');

        await initScatterPage({
            total_rows: 2,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Simulate a stale zoom state captured while in the matrix view.
        freshScatterState.view = { xMin: 100, xMax: 105, yMin: 200, yMax: 205 };
        freshScatterState.zoomHistory = [{ xMin: 0, xMax: 1, yMin: 0, yMax: 1 }];

        // Switch to matrix (renders mock).
        await setScatterView('matrix');
        // Switch back to plot — view must reset to full extent.
        await setScatterView('plot');

        expect(freshScatterState.view).toEqual(freshScatterState.full);
        expect(freshScatterState.zoomHistory).toHaveLength(0);

        // And a fresh fetch must have been triggered so the chart redraws
        // with the reset view instead of staying blank.
        expect(fetchScatterPointsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('warns when the active (plot) filters leave the plot empty after switching back', async () => {
        fetchScatterPointsMock
            .mockResolvedValueOnce({
                points: [[1, 2], [2, 3]],
                total_points: 2,
                color_values: null,
                color_labels: null,
                color: '',
            })
            .mockResolvedValueOnce({
                points: [],
                total_points: 0,
                color_values: null,
                color_labels: null,
                color: '',
            });

        const { initScatterPage, setScatterView } = await import('./scatterPage.js');
        const { setColumnRanges, setScatterViewSnapshot } = await import('../store/index.js');

        // Stage a filter globally and seed the plot-view snapshot so
        // the matrix swap re-installs it on the way back. The snapshot
        // is the only thing the round-trip matrix → plot needs to
        // carry the filter through the view switch.
        setColumnRanges({ HUFL: { from: 0, to: 1 } } as any);
        setScatterViewSnapshot('plot', {
            columnRanges: { HUFL: { from: 0, to: 1 } },
            lineFilters: [],
        });

        await initScatterPage({
            total_rows: 2,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        await setScatterView('matrix');
        await setScatterView('plot');

        expect(toastMock).toHaveBeenCalledWith(
            expect.stringContaining('hide all scatter points'),
            'warning',
            expect.objectContaining({
                action: expect.objectContaining({ label: 'Clear' }),
            }),
        );
    });

    it('suppresses the empty state while scatter points are still loading', async () => {
        let resolveScatter!: (value: unknown) => void;
        fetchScatterPointsMock.mockImplementationOnce(() => new Promise<unknown>((resolve) => {
            resolveScatter = resolve;
        }));

        const { initScatterPage } = await import('./scatterPage.js');

        const initPromise = initScatterPage({
            total_rows: 2,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'OT', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL', 'OT'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        await vi.waitFor(() => {
            expect(fetchScatterPointsMock).toHaveBeenCalledTimes(1);
        });

        expect(emptyStateUpdateMock).toHaveBeenCalledWith(
            expect.objectContaining({ visible: false, reason: 'loading' }),
        );

        resolveScatter({
            points: [[1, 2], [2, 3]],
            total_points: 2,
            color_values: null,
            color_labels: null,
            color: '',
        });
        await initPromise;
    });

    it('falls back to ECharts when WebGPU is unavailable', async () => {
        requestGpuAdapterMock.mockResolvedValueOnce(null);

        const { initScatterPage } = await import('./scatterPage.js');

        await initScatterPage({
            total_rows: 2,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(echartsInitMock).toHaveBeenCalledTimes(1);
        expect(createChartMock).not.toHaveBeenCalled();
    });

    it('stores the render signature after cache application resets the view', async () => {
        fetchScatterPointsMock.mockResolvedValueOnce({
            points: [[1, 2], [2, 3]],
            total_points: 2,
            color_values: null,
            color_labels: null,
            color: '',
        });
        freshScatterState.view = { xMin: 20, xMax: 60, yMin: 20, yMax: 50 };
        (document.getElementById('scatter-x-col') as HTMLSelectElement).innerHTML = '<option value="HUFL" selected>HUFL</option>';
        (document.getElementById('scatter-y-col') as HTMLSelectElement).innerHTML = '<option value="HULL" selected>HULL</option>';

        const { renderScatter } = await import('./scatterPage.js');

        await renderScatter();

        expect(freshScatterState.view).toEqual({ xMin: 0.98, xMax: 2.02, yMin: 1.98, yMax: 3.02 });
        expect(freshScatterState.lastRenderSignature).toBe('HUFL|HULL|density||viridis|viridis|linear|histogram|0.98|2.02|1.98|3.02');
    });

    it('does not refresh the active matrix view from the renderScatter tail', async () => {
        fetchScatterPointsMock.mockResolvedValueOnce({
            points: [[1, 2], [2, 3]],
            total_points: 2,
            color_values: null,
            color_labels: null,
            color: '',
        });
        freshScatterState.activeView = 'matrix';
        (document.getElementById('scatter-x-col') as HTMLSelectElement).innerHTML = '<option value="HUFL" selected>HUFL</option>';
        (document.getElementById('scatter-y-col') as HTMLSelectElement).innerHTML = '<option value="HULL" selected>HULL</option>';

        const { renderScatter } = await import('./scatterPage.js');

        await renderScatter();

        expect(renderScatterMatrixViewMock).not.toHaveBeenCalled();
    });

    it('does not render twice on first scatter navigation when linked brush is checked but unchanged', async () => {
        const { initScatterPage } = await import('./scatterPage.js');

        await initScatterPage({
            total_rows: 2,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        expect(fetchScatterPointsMock).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new CustomEvent('edatime:page-change', {
            detail: { page: 'scatter', analyticsView: 'plot' },
        }));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fetchScatterPointsMock).toHaveBeenCalledTimes(1);
    });

    it('renders on scatter page-change when the linked brush range changed since the last scatter render', async () => {
        const { initScatterPage } = await import('./scatterPage.js');
        const { appState } = await import('../store/index.js');
        const { computeInteractiveScatterLimit } = await import('./renderLimit.js');

        const metadata = {
            total_rows: 2,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any;
        appState.metadata = metadata;
        const scatterChart = document.getElementById('scatter-chart') as HTMLElement;
        Object.defineProperty(scatterChart, 'getBoundingClientRect', {
            value: () => ({ width: 600, height: 300 }),
        });

        await initScatterPage(metadata);

        expect(fetchScatterPointsMock).toHaveBeenCalledTimes(1);

        appState.currentStart = 100;
        appState.currentEnd = 500;

        window.dispatchEvent(new CustomEvent('edatime:page-change', {
            detail: { page: 'scatter', analyticsView: 'plot' },
        }));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fetchScatterPointsMock).toHaveBeenCalledTimes(2);
        expect(fetchScatterPointsMock).toHaveBeenLastCalledWith(
            'HUFL',
            'HULL',
            computeInteractiveScatterLimit(scatterChart, { devicePixelRatio: 1 }),
            null,
            expect.objectContaining({ start: 100, end: 500 }),
            expect.any(AbortSignal),
        );
    });

    it('populates X/Y dropdowns deterministically when numeric columns are present', async () => {
        const { initScatterPage } = await import('./scatterPage.js');

        await initScatterPage({
            total_rows: 3,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'OT', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL', 'OT'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        const xSelect = document.getElementById('scatter-x-col') as HTMLSelectElement;
        const ySelect = document.getElementById('scatter-y-col') as HTMLSelectElement;

        // First numeric column is the default X; the second numeric is the
        // default Y so that the page never boots into a state where the
        // selects are empty.
        expect(xSelect.value).toBe('HUFL');
        expect(ySelect.value).toBe('HULL');
        // Y must never equal X — the init path must exclude the chosen X
        // from Y's option list.
        expect(ySelect.querySelector(`option[value="${xSelect.value}"]`)).toBeNull();
    });

    it('prefers the strongest top-pair on first scatter init when no pair was restored', async () => {
        fetchScatterCorrelationsMock.mockResolvedValueOnce({
            mode: 'pearson_raw',
            numeric_columns: ['HUFL', 'HULL', 'MULL', 'OT'],
            base_column: 'HUFL',
            correlations: [],
            suggestions: [],
            top_pairs: [{ x: 'HULL', y: 'MULL', correlation: 0.91, count: 256 }],
        });

        const { initScatterPage } = await import('./scatterPage.js');

        await initScatterPage({
            total_rows: 3,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'MULL', dtype: 'Float64' },
                { name: 'OT', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL', 'MULL', 'OT'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        const xSelect = document.getElementById('scatter-x-col') as HTMLSelectElement;
        const ySelect = document.getElementById('scatter-y-col') as HTMLSelectElement;

        expect(xSelect.value).toBe('HULL');
        expect(ySelect.value).toBe('MULL');
        expect(fetchScatterPointsMock).toHaveBeenLastCalledWith(
            'HULL',
            'MULL',
            expect.any(Number),
            null,
            expect.any(Object),
            expect.any(AbortSignal),
        );
    });

    it('keeps the dropdowns empty but does not fetch when no numeric columns exist', async () => {
        const { initScatterPage } = await import('./scatterPage.js');

        await initScatterPage({
            total_rows: 0,
            columns: [
                { name: 'date', dtype: 'Date' },
                { name: 'label', dtype: 'String' },
            ],
            numeric_columns: [],
            time_column: 'date',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any);

        const xSelect = document.getElementById('scatter-x-col') as HTMLSelectElement;
        const ySelect = document.getElementById('scatter-y-col') as HTMLSelectElement;

        expect(xSelect.children).toHaveLength(0);
        expect(ySelect.children).toHaveLength(0);
        // Critical contract: with no numeric columns we must NOT issue the
        // scatter points fetch — that would have wasted a round trip and
        // produced an empty plot.
        expect(fetchScatterPointsMock).not.toHaveBeenCalled();
        expect(fetchScatterCorrelationsMock).not.toHaveBeenCalled();
    });

    it('records scatter.metadata on every init call so a later page-change can read it', async () => {
        const { initScatterPage } = await import('./scatterPage.js');

        const metadata = {
            total_rows: 2,
            columns: [
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL'],
            time_column: 'ts',
            time_range: { min: 0, max: 1_000 },
            column_profiles: [],
        } as any;

        await initScatterPage(metadata);
        expect(freshScatterState.metadata).toBe(metadata);

        // Second call with a different metadata must overwrite, not merge.
        const next = { ...metadata, time_range: { min: 5, max: 50 } };
        await initScatterPage(next);
        expect(freshScatterState.metadata).toBe(next);
    });
});

/**
 * Cross-cutting tests for the schedule-render / debounce machinery in
 * scatterPage.ts. These tests must NOT call initScatterPage, since that
 * path also schedules renders. They exercise the global scheduleRender
 * helper and the production setScatterView / renderScatterDebounced
 * directly so the assertions can observe the exact timer state.
 */
describe('scatter render scheduling', () => {
    let scheduleHelper: { __scatterScheduleRender?: (opts?: { preserveView?: boolean; immediate?: boolean }) => void } | undefined;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        buildDom();
        scheduleHelper = globalThis as any;
        scheduleHelper!.__scatterScheduleRender = undefined;

        fetchScatterPointsMock.mockResolvedValue({
            points: [[1, 2], [2, 3]],
            total_points: 2,
            color_values: null,
            color_labels: null,
            color: '',
        });
        createChartMock.mockResolvedValue({
            setOption: vi.fn(),
            resize: vi.fn(),
            onPerformanceUpdate: vi.fn(),
            dispose: vi.fn(),
        });
        echartsInitMock.mockReturnValue({
            setOption: vi.fn(),
            resize: vi.fn(),
            dispose: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
        });
        (document.getElementById('scatter-x-col') as HTMLSelectElement).innerHTML = '<option value="HUFL" selected>HUFL</option>';
        (document.getElementById('scatter-y-col') as HTMLSelectElement).innerHTML = '<option value="HULL" selected>HULL</option>';
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('consumes the preserveView flag exactly once across consecutive scheduleRender calls', async () => {
        // The density-mode zoom path in rendering.ts sets
        // `_preserveViewOnNextRender = true` before scheduling a re-render
        // so the new view bounds are not clobbered by
        // `applyScatterStateFromCache(true)`. The contract is "one-shot":
        // a second scheduleRender without the flag must NOT inherit the
        // previous preserveView. If it did, every subsequent render
        // would freeze the zoom history and stop resetting the view to
        // the full extent for column changes.
        const stateModule = await import('./state.js');
        const applySpy = vi.spyOn(stateModule, 'applyScatterStateFromCache');

        // Make sure the helpers we use exist on the module under test.
        const scatterPage = await import('./scatterPage.js');
        expect(typeof scatterPage.renderScatterDebounced).toBe('function');
        expect(typeof (scheduleHelper as any).__scatterScheduleRender).toBe('function');

        // 1) Schedule a preserving render. resolve immediately via `immediate: true`
        //    so we don't depend on fake timers for the first call.
        (scheduleHelper as any).__scatterScheduleRender!({ preserveView: true, immediate: true });
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await Promise.resolve();

        const callsAfterFirst = applySpy.mock.calls.length;
        expect(callsAfterFirst).toBeGreaterThan(0);
        const firstArg = applySpy.mock.calls[callsAfterFirst - 1]?.[0];
        // `applyScatterStateFromCache(!preserveView)` → preserveView=true ⇒ arg=false
        expect(firstArg).toBe(false);

        // 2) Schedule a second render WITHOUT the flag. The flag must have been
        //    consumed by the first call, so this one must use the default
        //    `applyScatterStateFromCache(true)` behaviour.
        (scheduleHelper as any).__scatterScheduleRender!({ immediate: true });
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await Promise.resolve();

        const callsAfterSecond = applySpy.mock.calls.length;
        expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
        const secondArg = applySpy.mock.calls[callsAfterSecond - 1]?.[0];
        // preserveView=false (default) ⇒ applyScatterStateFromCache(true) ⇒ arg=true
        expect(secondArg).toBe(true);
    });

    it('does not leave a stale debounce timer after setScatterView(matrix, { render: false })', async () => {
        // Regression: the page-change fast path skips `setScatterView` when
        // the view is unchanged, but the real production path also still
        // calls `setScatterView` from view-toggle buttons. In both cases a
        // pending debounced render from a previous filter change could
        // leak through and clobber the new view with stale points.
        //
        // We assert the bug is fixed: calling setScatterView MUST clear
        // the pending debounced render. We detect the timer via the
        // setTimeout/clearTimeout pair that scatterPage uses for its
        // 32 ms debounce.
        const scatterPage = await import('./scatterPage.js');
        const { setScatterView, renderScatterDebounced } = scatterPage;

        // Spy on setTimeout/clearTimeout so we can capture the timer handle
        // the debounce installs and assert setScatterView cleared it.
        const pendingHandles = new Set<unknown>();
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
            handler: TimerHandler,
            timeout?: number,
            ...args: unknown[]
        ) => {
            const handle = { __scatterDebounce: true, handler, timeout, args } as any;
            pendingHandles.add(handle);
            // Return a numeric handle that maps back to our wrapper.
            (handle as any).id = pendingHandles.size;
            return handle as any;
        }) as any);
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((handle: any) => {
            pendingHandles.delete(handle);
        }) as any);

        // Kick off a debounced render.
        renderScatterDebounced();
        expect(pendingHandles.size).toBe(1);

        // The user immediately toggles to matrix mode without waiting for
        // the debounce to fire. setScatterView must clear the pending handle.
        await setScatterView('matrix', { render: false });

        expect(clearTimeoutSpy).toHaveBeenCalled();
        // The debounce timer specifically should have been cleared.
        expect(pendingHandles.size).toBe(0);

        // Sanity: setTimeout was actually used to install the debounce,
        // and the clear call targeted one of the handles we tracked.
        expect(setTimeoutSpy).toHaveBeenCalled();
    });
});
