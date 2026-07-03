import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buildOptionMock = vi.fn((..._args: unknown[]) => ({}));
const updateColorbarUIMock = vi.fn();
const updateBinnedReadoutMock = vi.fn();
const updateCorrelationStatsMock = vi.fn();
const updateMarginalPlotsMock = vi.fn();
const syncModeUIMock = vi.fn();

const appStateMock = {
    scatter: {
        chart: {
            setOption: vi.fn(),
            resize: vi.fn(),
        },
        suggestionThreshold: 0.7,
        activeView: 'plot',
        metadata: { columns: [{ name: 'HUFL' }, { name: 'HULL' }] },
        pageInitialized: false,
        initialized: false,
        full: { xMin: 0, xMax: 100, yMin: 0, yMax: 100 } as any,
        view: { xMin: 0, xMax: 100, yMin: 0, yMax: 100 } as any,
        zoomHistory: [] as any[],
        densityTooltipCache: null,
        lastOptionSeries: null,
        columnTypes: new Map<string, string>(),
        colorColumn: '',
        colorValues: null,
        colorLabels: null,
        colorMin: null,
        colorMax: null,
        colorCardinality: null,
        allColorValues: null,
        allColorLabels: null,
        points: [] as [number, number][],
        lastQueryContextKey: 'current-query',
    },
    columnRanges: {},
    adaptiveLineFilters: [],
    metadata: null as any,
};

const setColumnRangesMock = vi.fn();
const setAdaptiveLineFiltersMock = vi.fn();

vi.mock('../store/index.js', () => ({
    appState: appStateMock,
    setColumnRanges: setColumnRangesMock,
    setAdaptiveLineFilters: setAdaptiveLineFiltersMock,
}));

vi.mock('./helpers.js', () => ({
    getEl: (id: string) => document.getElementById(id),
    normalizeScatterSuggestionThreshold: (value: unknown) => Number(value),
}));

vi.mock('./state.js', () => ({
    currentControls: vi.fn(() => ({
        x: 'HUFL',
        y: 'HULL',
        binSize: 10,
        colormap: 'viridis',
        normalization: 'linear',
        renderMode: 'density',
        diagonalMode: 'histogram',
        colorColumn: '',
        selectedColorColumn: '',
        colorScale: 'viridis',
        matrixMode: 'scatter',
        matrixCellSize: 160,
    })),
    buildScatterQueryContext: vi.fn(() => ({ start: undefined, end: undefined, filters: [], lineFilters: [] })),
    buildOverviewContextKey: vi.fn((context: any) => {
        // Mirror the production JSON.stringify shape so tests can drive the
        // fast-path toggle by changing the filter payload. Default to
        // 'key:0' (no filters) to match the default buildScatterQueryContext.
        const filters = Array.isArray(context?.filters) ? context.filters : [];
        const lineFilters = Array.isArray(context?.lineFilters) ? context.lineFilters : [];
        return `key:f${filters.length}.l${lineFilters.length}`;
    }),
    isLinkedBrushEnabled: () => false,
    normalizeAnalyticsView: (value: string) => value || 'plot',
}));

vi.mock('./rendering.js', () => ({
    buildOption: (...args: unknown[]) => buildOptionMock(...args),
    updateColorbarUI: () => updateColorbarUIMock(),
    updateBinnedReadout: () => updateBinnedReadoutMock(),
    updateCorrelationStats: () => updateCorrelationStatsMock(),
    updateMarginalPlots: () => updateMarginalPlotsMock(),
    syncModeUI: () => syncModeUIMock(),
    exportScatterPNG: vi.fn(),
    exportScatterSVG: vi.fn(),
    exportScatterHTML: vi.fn(),
    exportScatterData: vi.fn(),
    exportScatterParquet: vi.fn(),
}));

function buildDom(): void {
    document.body.innerHTML = `
        <section id="page-scatter">
            <select id="scatter-x-col"><option value="HUFL" selected>HUFL</option></select>
            <select id="scatter-y-col"><option value="HULL" selected>HULL</option></select>
            <input id="scatter-bin-size" value="10">
            <span id="scatter-bin-size-value"></span>
            <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
            <select id="scatter-render-mode">
                <option value="density" selected>Density</option>
                <option value="scatter">Scatter</option>
            </select>
            <select id="scatter-diagonal-mode"><option value="histogram" selected>Histogram</option></select>
            <select id="scatter-color-column"><option value="" selected>None</option></select>
            <select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select>
            <input id="scatter-link-brush" type="checkbox">
            <input id="scatter-suggestion-threshold" value="0.7">
            <span id="scatter-suggestion-threshold-value"></span>
            <span id="scatter-suggestions-label"></span>
            <button id="scatter-open-causal-btn" type="button"></button>
            <div id="scatter-chart"></div>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" value="160">
            <span id="scatter-matrix-cell-size-value"></span>
        </section>
    `;
}

describe('bindScatterControls', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        appStateMock.scatter.pageInitialized = false;
        appStateMock.scatter.initialized = false;
        appStateMock.scatter.activeView = 'plot';
        appStateMock.scatter.metadata = { columns: [{ name: 'HUFL' }, { name: 'HULL' }] };
        appStateMock.scatter.lastQueryContextKey = 'current-query';
        appStateMock.columnRanges = {};
        appStateMock.adaptiveLineFilters = [];
        appStateMock.metadata = null;
        buildDom();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('updates marginal plots when render mode changes', async () => {
        const { bindScatterControls } = await import('./controls.js');

        bindScatterControls({
            initScatterPage: vi.fn(async () => { }),
            renderScatter: vi.fn(async () => { }),
            refreshCorrelationsAndSuggestions: vi.fn(async () => { }),
            refreshActiveScatterView: vi.fn(async () => { }),
            setScatterView: vi.fn(async () => { }),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => { }),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        });

        const renderMode = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        renderMode.value = 'scatter';
        renderMode.dispatchEvent(new Event('change'));

        expect(appStateMock.scatter.chart.setOption).toHaveBeenCalledTimes(1);
        expect(updateMarginalPlotsMock).toHaveBeenCalledTimes(1);
    });

    it('updates marginal plots when diagonal mode changes on the main plot', async () => {
        const { bindScatterControls } = await import('./controls.js');

        bindScatterControls({
            initScatterPage: vi.fn(async () => { }),
            renderScatter: vi.fn(async () => { }),
            refreshCorrelationsAndSuggestions: vi.fn(async () => { }),
            refreshActiveScatterView: vi.fn(async () => { }),
            setScatterView: vi.fn(async () => { }),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => { }),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        });

        const diagonalMode = document.getElementById('scatter-diagonal-mode') as HTMLSelectElement;
        diagonalMode.value = 'kde';
        diagonalMode.dispatchEvent(new Event('change'));

        expect(appStateMock.scatter.chart.setOption).toHaveBeenCalledTimes(1);
        expect(updateMarginalPlotsMock).toHaveBeenCalledTimes(1);
    });

    it('ignores scatter page-change events when the page is already current and unfiltered', async () => {
        const { bindScatterControls } = await import('./controls.js');
        const callbacks = {
            initScatterPage: vi.fn(async () => { }),
            renderScatter: vi.fn(async () => { }),
            refreshCorrelationsAndSuggestions: vi.fn(async () => { }),
            refreshActiveScatterView: vi.fn(async () => { }),
            setScatterView: vi.fn(async () => { }),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => { }),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        };
        appStateMock.scatter.pageInitialized = true;
        appStateMock.scatter.activeView = 'plot';
        // The mock returns 'key:f0.l0' for the default empty-filter query context;
        // pre-populate the cached key to the same value so the fast path matches.
        appStateMock.scatter.lastQueryContextKey = 'key:f0.l0';

        bindScatterControls(callbacks);
        callbacks.setScatterView.mockClear();

        window.dispatchEvent(new CustomEvent('edatime:page-change', {
            detail: { page: 'scatter', analyticsView: 'plot' },
        }));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(callbacks.setScatterView).not.toHaveBeenCalled();
        expect(callbacks.renderScatter).not.toHaveBeenCalled();
        expect(callbacks.rerenderScatterFromCache).not.toHaveBeenCalled();
        expect(callbacks.refreshActiveScatterView).not.toHaveBeenCalled();
    });

    it('re-renders the scatter when only filters change between page-change events', async () => {
        // The page-change handler now compares the (view, queryContextKey) pair
        // against the cached `lastQueryContextKey`. This guards the case where
        // a user adjusts column ranges or adaptive line filters while the
        // scatter page is the active page, then the global app emits a
        // `edatime:page-change 'scatter'` re-entry. The fast path must NOT
        // swallow that re-entry; it must still trigger `setScatterView` so the
        // scatter pipeline re-fetches points with the new filters.
        const { bindScatterControls } = await import('./controls.js');
        const stateModule = await import('./state.js');
        const buildScatterQueryContextMock = stateModule.buildScatterQueryContext as unknown as ReturnType<typeof vi.fn>;
        const buildOverviewContextKeyMock = stateModule.buildOverviewContextKey as unknown as ReturnType<typeof vi.fn>;

        const callbacks = {
            initScatterPage: vi.fn(async () => { }),
            renderScatter: vi.fn(async () => { }),
            refreshCorrelationsAndSuggestions: vi.fn(async () => { }),
            refreshActiveScatterView: vi.fn(async () => { }),
            setScatterView: vi.fn(async () => { }),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => { }),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        };

        // First dispatch: cached key is 'current-query', the mock returns
        // 'key:f0.l0' for the default query context → keys differ, so the
        // handler falls through to setScatterView.
        appStateMock.scatter.pageInitialized = true;
        appStateMock.scatter.activeView = 'plot';
        appStateMock.scatter.lastQueryContextKey = 'current-query';
        buildScatterQueryContextMock.mockReturnValueOnce({ start: undefined, end: undefined, filters: [], lineFilters: [] });
        buildOverviewContextKeyMock.mockReturnValueOnce('key:f0.l0');

        bindScatterControls(callbacks);
        callbacks.setScatterView.mockClear();

        window.dispatchEvent(new CustomEvent('edatime:page-change', {
            detail: { page: 'scatter', analyticsView: 'plot' },
        }));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(callbacks.setScatterView).toHaveBeenCalledTimes(1);
        expect(callbacks.setScatterView).toHaveBeenCalledWith('plot', { render: false });
    });

    it('refreshes the matrix view on first scatter page-change when analyticsView requests matrix', async () => {
        const { bindScatterControls } = await import('./controls.js');
        const callbacks = {
            initScatterPage: vi.fn(async () => { }),
            renderScatter: vi.fn(async () => { }),
            refreshCorrelationsAndSuggestions: vi.fn(async () => { }),
            refreshActiveScatterView: vi.fn(async () => { }),
            setScatterView: vi.fn(async () => { }),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => { }),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        };

        appStateMock.scatter.pageInitialized = false;
        appStateMock.scatter.activeView = 'plot';
        appStateMock.metadata = { columns: [{ name: 'HUFL' }, { name: 'HULL' }] };

        bindScatterControls(callbacks);

        window.dispatchEvent(new CustomEvent('edatime:page-change', {
            detail: { page: 'scatter', analyticsView: 'matrix' },
        }));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(callbacks.setScatterView).toHaveBeenCalledWith('matrix', { render: false });
        expect(callbacks.refreshCorrelationsAndSuggestions).toHaveBeenCalledTimes(1);
        expect(callbacks.refreshActiveScatterView).toHaveBeenCalledTimes(1);
        expect(callbacks.renderScatter).not.toHaveBeenCalled();
    });

    it('re-renders the scatter when the filter payload changes between page-change events', async () => {
        // The previous test covers a "no filter → no filter" identity change.
        // This one drives a *real* filter change: cached key is for an empty
        // filter list, the next dispatch comes in with one filter attached.
        // The fast path must still trigger a re-render even though the view
        // and the page are unchanged.
        const { bindScatterControls } = await import('./controls.js');
        const stateModule = await import('./state.js');
        const buildScatterQueryContextMock = stateModule.buildScatterQueryContext as unknown as ReturnType<typeof vi.fn>;
        const buildOverviewContextKeyMock = stateModule.buildOverviewContextKey as unknown as ReturnType<typeof vi.fn>;

        const callbacks = {
            initScatterPage: vi.fn(async () => { }),
            renderScatter: vi.fn(async () => { }),
            refreshCorrelationsAndSuggestions: vi.fn(async () => { }),
            refreshActiveScatterView: vi.fn(async () => { }),
            setScatterView: vi.fn(async () => { }),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => { }),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        };

        appStateMock.scatter.pageInitialized = true;
        appStateMock.scatter.activeView = 'plot';
        appStateMock.scatter.lastQueryContextKey = 'key:f0.l0';
        buildScatterQueryContextMock.mockReturnValueOnce({ start: undefined, end: undefined, filters: [{ column: 'HUFL', from: 0, to: 50 }], lineFilters: [] });
        buildOverviewContextKeyMock.mockReturnValueOnce('key:f1.l0');

        bindScatterControls(callbacks);
        callbacks.setScatterView.mockClear();

        window.dispatchEvent(new CustomEvent('edatime:page-change', {
            detail: { page: 'scatter', analyticsView: 'plot' },
        }));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(callbacks.setScatterView).toHaveBeenCalledTimes(1);
        expect(callbacks.setScatterView).toHaveBeenCalledWith('plot', { render: false });
    });

    it('clears scatter filters and re-renders when the empty-state clear action fires', async () => {
        const { bindScatterControls } = await import('./controls.js');
        const callbacks = {
            initScatterPage: vi.fn(async () => { }),
            renderScatter: vi.fn(async () => { }),
            refreshCorrelationsAndSuggestions: vi.fn(async () => { }),
            refreshActiveScatterView: vi.fn(async () => { }),
            setScatterView: vi.fn(async () => { }),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => { }),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        };

        bindScatterControls(callbacks);
        setColumnRangesMock.mockClear();
        setAdaptiveLineFiltersMock.mockClear();

        window.dispatchEvent(new CustomEvent('edatime:clear-all-filters'));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(setColumnRangesMock).toHaveBeenCalledWith({});
        expect(setAdaptiveLineFiltersMock).toHaveBeenCalledWith([]);
        expect(callbacks.syncScatterFilterBadge).toHaveBeenCalled();
        expect(callbacks.refreshActiveScatterView).toHaveBeenCalled();
    });
});
