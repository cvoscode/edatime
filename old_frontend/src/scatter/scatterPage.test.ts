import { beforeEach, describe, expect, it, vi } from 'vitest';

const createChartMock = vi.fn();
const fetchScatterCorrelationsMock = vi.fn();
const fetchScatterPointsMock = vi.fn();
const renderScatterMatrixViewMock = vi.fn();
const emptyStateUpdateMock = vi.fn();

const freshScatterState = vi.hoisted(() => ({
    chart: null,
    initialized: false,
    pageInitialized: false,
    activeView: 'plot' as const,
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
    correlationsByColumn: new Map(),
    suggestionThreshold: 0.7,
    lastBinnedText: '',
    lastUpdateMs: 0,
    densityTooltipCache: null as any,
    lastOptionSeries: null as any,
    columnTypes: new Map<string, string>(),
    lastSuggestions: [] as any[],
    lastRenderSignature: '' as any,
    matrixCache: new Map(),
    matrixColumnOrder: [] as string[],
    overviewRequestId: 0,
    scatterRequestId: 0,
}));

vi.mock('../../libs/chartgpu/dist/index.js', () => ({
    createChart: (...args: unknown[]) => createChartMock(...args),
}));

vi.mock('../utils/platform.js', () => ({
    defaultGpuPowerPreference: () => null,
    requestGpuAdapter: vi.fn(async () => ({ name: 'mock-adapter' })),
}));

vi.mock('../dataClient.js', () => ({
    fetchScatterCorrelations: (...args: unknown[]) => fetchScatterCorrelationsMock(...args),
    fetchScatterPoints: (...args: unknown[]) => fetchScatterPointsMock(...args),
}));

vi.mock('../state.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../state.js')>();
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

vi.mock('../ui/emptyState.js', () => ({
    createEmptyStateController: () => ({ update: emptyStateUpdateMock }),
    isRangeOutsideDataset: () => false,
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
            <select id="scatter-colormap"><option value="viridis" selected>Viridis</option></select>
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
            <div id="scatter-active-pair-label"></div>
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
            <div class="scatter-suggestions-bar"></div>
            <div data-scatter-view-panel="plot"></div>
            <div data-scatter-view-panel="matrix" hidden></div>
        </section>
    `;
}

describe('initScatterPage view toggles', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        buildDom();

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
        freshScatterState.lastRenderSignature = '';
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
});
