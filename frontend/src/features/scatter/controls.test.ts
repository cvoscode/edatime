import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';

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
    columnRanges: {} as Record<string, { from: number; to: number }>,
    adaptiveLineFilters: [] as any[],
    metadata: null as any,
};

const setColumnRangesMock = vi.fn();
const setAdaptiveLineFiltersMock = vi.fn();

vi.mock('../../store/scatterState.js', () => ({
    scatterState: appStateMock.scatter,
}));

vi.mock('../../store/uiState.js', () => ({
    uiState: {
        get columnRanges() { return appStateMock.columnRanges; },
        set columnRanges(value) { appStateMock.columnRanges = value as Record<string, { from: number; to: number }>; },
        get adaptiveLineFilters() { return appStateMock.adaptiveLineFilters; },
        set adaptiveLineFilters(value) { appStateMock.adaptiveLineFilters = value as any[]; },
    },
    setColumnRanges: (...args: unknown[]) => setColumnRangesMock(...args),
    setAdaptiveLineFilters: (...args: unknown[]) => setAdaptiveLineFiltersMock(...args),
}));

vi.mock('../../store/datasetState.js', () => ({
    datasetState: {
        get metadata() { return appStateMock.metadata; },
        set metadata(value) { appStateMock.metadata = value; },
    },
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
        // fast-path toggle. The overview key now includes X, Y, and
        // colorColumn in addition to the filter payload, so a navigation
        // that mutates only the axes (heatmap cell click, home top-pair
        // row click) still invalidates the cache.
        const filters = Array.isArray(context?.filters) ? context.filters : [];
        const lineFilters = Array.isArray(context?.lineFilters) ? context.lineFilters : [];
        const x = typeof context?.x === 'string' ? context.x : '';
        const y = typeof context?.y === 'string' ? context.y : '';
        const color = typeof context?.colorColumn === 'string' ? context.colorColumn : '';
        return `key:${x}|${y}|${color}|f${filters.length}.l${lineFilters.length}`;
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

    afterEach(async () => {
        const { disposeScatterControls } = await import('./controls.js');
        disposeScatterControls();
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

    it('does not publish scatter export helpers on the window bridge', async () => {
        const { bindScatterControls } = await import('./controls.js');
        (window as Window & { __edatime?: Record<string, unknown> }).__edatime = {};

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

        expect((window as any).__edatime.exportScatterData).toBeUndefined();
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
        // The mock returns 'key:HUFL|HULL||f0.l0' for the default empty-filter
        // query context (X=HUFL, Y=HULL, colorColumn=""). Pre-populate the
        // cached key to the same value so the fast path matches.
        appStateMock.scatter.lastQueryContextKey = 'key:HUFL|HULL||f0.l0';

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

    it('re-renders the scatter when only the X/Y column selection changes between page-change events', async () => {
        // Repro for the heatmap → scatter / home → scatter regression:
        // `setDropdownValue` does not emit a `change` event when called from
        // those code paths, so the dropdown's manual `change` handler cannot
        // catch the axis mutation. The page-change handler must therefore
        // include X/Y/colorColumn in its overview context key, otherwise
        // the fast path would swallow the navigation and leave the chart
        // rendering the previous X/Y's cached points against the new axes.
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
        // Previous render was for HUFL×HULL with no filters; the cached key
        // matches that. The next dispatch will arrive after the user clicks
        // a heatmap cell that switches Y to a different column, so the mock
        // for `buildOverviewContextKey` returns a new key that includes the
        // changed Y. The handler must fall through to setScatterView.
        appStateMock.scatter.lastQueryContextKey = 'key:HUFL|HULL||f0.l0';
        buildScatterQueryContextMock.mockReturnValueOnce({ start: undefined, end: undefined, filters: [], lineFilters: [] });
        buildOverviewContextKeyMock.mockReturnValueOnce('key:HUFL|MULL||f0.l0');

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

    it('processes successive scatter page-change events instead of dropping them after the first', async () => {
        // Repro for the `dormant = true` flag bug. After the first page-change
        // fired, the listener set a one-shot `dormant` flag that never reset,
        // so every subsequent scatter page-change dispatched by `showPage`
        // was silently ignored. The fix uses an `inFlight` guard that resets
        // when the work completes, so legitimate follow-up dispatches (for
        // example heatmap → scatter → heatmap → scatter, or two rapid filter
        // changes that both reach `showPage('scatter')`) still run.
        const { bindScatterControls } = await import('./controls.js');
        const stateModule = await import('./state.js');
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
        // The handler writes `lastQueryContextKey` to whatever the mocked
        // `buildOverviewContextKey` returns on each invocation. To prove the
        // listener stays alive across multiple dispatches we must make each
        // dispatch return a *different* key so the fast path keeps missing.
        appStateMock.scatter.lastQueryContextKey = 'stale-key';
        buildOverviewContextKeyMock
            .mockReturnValueOnce('key:HUFL|HULL||f0.l0')
            .mockReturnValueOnce('key:HUFL|MULL||f0.l0');

        bindScatterControls(callbacks);
        callbacks.setScatterView.mockClear();

        for (let i = 0; i < 2; i += 1) {
            window.dispatchEvent(new CustomEvent('edatime:page-change', {
                detail: { page: 'scatter', analyticsView: 'plot' },
            }));
            await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        expect(callbacks.setScatterView).toHaveBeenCalledTimes(2);
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
        // 'key:HUFL|HULL||f0.l0' for the default query context (currentControls
        // returns X=HUFL, Y=HULL, no color column) → keys differ, so the
        // handler falls through to setScatterView.
        appStateMock.scatter.pageInitialized = true;
        appStateMock.scatter.activeView = 'plot';
        appStateMock.scatter.lastQueryContextKey = 'current-query';
        buildScatterQueryContextMock.mockReturnValueOnce({ start: undefined, end: undefined, filters: [], lineFilters: [] });
        buildOverviewContextKeyMock.mockReturnValueOnce('key:HUFL|HULL||f0.l0');

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
        appStateMock.scatter.lastQueryContextKey = 'key:HUFL|HULL||f0.l0';
        buildScatterQueryContextMock.mockReturnValueOnce({ start: undefined, end: undefined, filters: [{ column: 'HUFL', from: 0, to: 50 }], lineFilters: [] });
        buildOverviewContextKeyMock.mockReturnValueOnce('key:HUFL|HULL||f1.l0');

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
        const workspace = createWorkspaceStore();
        workspace.setFilters({
            columnRanges: { HUFL: { from: 1, to: 2 } },
            adaptiveLines: [{ id: 'line-1', column: 'HUFL', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true }],
        });

        bindScatterControls({ ...callbacks, workspace });
        setColumnRangesMock.mockClear();
        setAdaptiveLineFiltersMock.mockClear();

        window.dispatchEvent(new CustomEvent('edatime:clear-all-filters'));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(setColumnRangesMock).toHaveBeenCalledWith({});
        expect(setAdaptiveLineFiltersMock).toHaveBeenCalledWith([]);
        expect(workspace.getSnapshot().filters).toEqual({ columnRanges: {}, adaptiveLines: [] });
        expect(callbacks.syncScatterFilterBadge).toHaveBeenCalled();
        expect(callbacks.refreshActiveScatterView).toHaveBeenCalled();
    });

    it('replaces prior control listeners and disposes the active binding', async () => {
        const { bindScatterControls } = await import('./controls.js');
        const firstRender = vi.fn(async () => { });
        const secondRender = vi.fn(async () => { });
        const callbacks = {
            initScatterPage: vi.fn(async () => { }),
            renderScatter: firstRender,
            refreshCorrelationsAndSuggestions: vi.fn(async () => { }),
            refreshActiveScatterView: vi.fn(async () => { }),
            setScatterView: vi.fn(async () => { }),
            handleErr: vi.fn(),
            rerenderScatterFromCache: vi.fn(async () => { }),
            renderScatterDebounced: vi.fn(),
            syncScatterFilterBadge: vi.fn(),
        };

        bindScatterControls(callbacks);
        const dispose = bindScatterControls({ ...callbacks, renderScatter: secondRender });
        const colorColumn = document.getElementById('scatter-color-column') as HTMLSelectElement;
        colorColumn.dispatchEvent(new Event('change'));
        await Promise.resolve();

        expect(firstRender).not.toHaveBeenCalled();
        expect(secondRender).toHaveBeenCalledTimes(1);
        expect(dispose).toBeTypeOf('function');

        dispose();
        colorColumn.dispatchEvent(new Event('change'));
        await Promise.resolve();

        expect(secondRender).toHaveBeenCalledTimes(1);
    });
});
