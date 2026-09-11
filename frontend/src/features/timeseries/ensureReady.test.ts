import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    appStateMock,
    checkWebGPUMock,
    setChartInstanceMock,
    setInitialViewMock,
    bindAnalysisChartEventsMock,
    getCurrentViewMock,
    initAdaptiveFilterGestureMock,
    restoreSessionAfterChartReadyMock,
} = vi.hoisted(() => ({
    appStateMock: {
        chart: null as any,
        currentStart: 0,
        currentEnd: 100,
        chartText: null,
        metadata: null,
        datasetRevision: 0,
    },
    checkWebGPUMock: vi.fn(),
    setChartInstanceMock: vi.fn((chart: any) => {
        appStateMock.chart = chart;
    }),
    setInitialViewMock: vi.fn(),
    bindAnalysisChartEventsMock: vi.fn(),
    getCurrentViewMock: vi.fn(() => ({ xMin: 0, xMax: 100, yMin: null, yMax: null })),
    initAdaptiveFilterGestureMock: vi.fn(),
    restoreSessionAfterChartReadyMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../chart/webgpuGuard.js', () => ({
    checkWebGPU: checkWebGPUMock,
}));

vi.mock('../../charts/primaryChart.js', () => ({
    primaryChart: { get current() { return appStateMock.chart; } },
    setPrimaryChartInstance: setChartInstanceMock,
    setInitialView: setInitialViewMock,
}));

vi.mock('../../ui/toolbar.js', () => ({
    bindAnalysisChartEvents: bindAnalysisChartEventsMock,
    getCurrentView: getCurrentViewMock,
}));



vi.mock('./adaptiveGesture.js', () => ({
    initAdaptiveFilterGesture: initAdaptiveFilterGestureMock,
}));

vi.mock('../../platform/sessionLifecycle.js', () => ({
    restoreSessionAfterChartReady: restoreSessionAfterChartReadyMock,
}));

vi.mock('../../debug.js', () => ({
    dbg: vi.fn(),
    dbgGroup: vi.fn((_label: string, fn: () => void) => fn()),
}));

function createChartStub(overrides: Record<string, unknown> = {}) {
    return {
        init: vi.fn().mockResolvedValue(undefined),
        updateDataMulti: vi.fn(),
        setXRange: vi.fn(),
        setYRange: vi.fn(),
        setChartText: vi.fn(),
        onCrosshairMove: vi.fn(),
        onClick: vi.fn(),
        supportsZoomControls: vi.fn(() => true),
        getXDomain: vi.fn(() => ({ min: 0, max: 100 })),
        getYRange: vi.fn(() => ({ min: 0, max: 100 })),
        fitYToData: vi.fn(),
        setDrawMode: vi.fn(),
        clearDrawings: vi.fn(),
        exportPNG: vi.fn(),
        exportSVG: vi.fn(),
        exportHTML: vi.fn(),
        ...overrides,
    };
}

describe('createTimeseriesBootstrap', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        appStateMock.chart = null;
        appStateMock.currentStart = 0;
        appStateMock.currentEnd = 100;
        appStateMock.chartText = null;
        appStateMock.metadata = null;
        appStateMock.datasetRevision = 0;

        const { registerChartType } = await import('../../charts/registry.js');
        registerChartType('line', {
            label: 'Line',
            create: vi.fn(() => createChartStub()),
        });
    });

    it('passes zoom callbacks into the fallback chart when WebGPU is unavailable', async () => {
        checkWebGPUMock.mockResolvedValue('No WebGPU adapter found');

        const fallbackChart = createChartStub();
        const fallbackCreate = vi.fn(() => fallbackChart);

        const { registerChartType } = await import('../../charts/registry.js');
        registerChartType('fallback', {
            label: 'Fallback',
            create: fallbackCreate,
        });

        const onZoom = vi.fn();
        const onYRange = vi.fn();
        const onZoomOut = vi.fn();
        const { createTimeseriesBootstrap } = await import('./ensureReady.js');

        const bootstrap = createTimeseriesBootstrap({
            runtimeCache: { initialView: null },
            ensurePrimaryChartCtor: vi.fn().mockResolvedValue(class { }),
            onZoom,
            onYRange,
            onZoomOut,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            getCurrentData: vi.fn(() => null),
            fetchAndRender: vi.fn().mockResolvedValue(undefined),
            refreshZoomControlsState: vi.fn(),
            workspace: { getSnapshot: vi.fn(() => ({ dataset: { metadata: null, revision: 0 }, viewport: { xMin: 10, xMax: 90, yMin: null, yMax: null } })), setSelection: vi.fn(), setFilters: vi.fn(), setViewport: vi.fn(), subscribe: vi.fn(() => vi.fn()) } as any,
        });

        await bootstrap.ensureReady();

        expect(fallbackCreate).toHaveBeenCalledWith('main-chart', {
            onZoom,
            onYRange,
            onZoomOut,
        });
        expect(appStateMock.chart).toBe(fallbackChart);
        expect(fallbackChart.setXRange).toHaveBeenCalledWith(10, 90);
    });

    it('forwards a real ViewSnapshot from the line chart zoom callback to deps.onZoom', async () => {
        // Regression: the bootstrap used to wrap the chart's onZoom callback
        // as `(start, end, sourceKind) => ...`, but DataChart invokes it as
        // `onZoomCallback(view, sourceKind)`. That mismatch corrupted the
        // view and the page controller's Number.isFinite guard bailed out
        // before any zoom state was applied. This test pins the contract
        // that the line-type path forwards the view untouched.
        checkWebGPUMock.mockResolvedValue(null);

        let capturedOnZoom: ((view: any, sourceKind: string) => void) | undefined;
        const lineCreate = vi.fn((_containerId: string, callbacks: any) => {
            capturedOnZoom = callbacks.onZoom;
            return createChartStub();
        });

        const { registerChartType } = await import('../../charts/registry.js');
        registerChartType('line', {
            label: 'Line',
            create: lineCreate,
        });

        const onZoom = vi.fn();
        const onYRange = vi.fn();
        const onZoomOut = vi.fn();
        const { createTimeseriesBootstrap } = await import('./ensureReady.js');

        const bootstrap = createTimeseriesBootstrap({
            runtimeCache: { initialView: null },
            ensurePrimaryChartCtor: vi.fn().mockResolvedValue(class { }),
            onZoom,
            onYRange,
            onZoomOut,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            getCurrentData: vi.fn(() => null),
            fetchAndRender: vi.fn().mockResolvedValue(undefined),
            refreshZoomControlsState: vi.fn(),
            workspace: { getSnapshot: vi.fn(() => ({ dataset: { metadata: null, revision: 0 }, viewport: { xMin: 100, xMax: 800, yMin: null, yMax: null } })), setSelection: vi.fn(), setFilters: vi.fn(), setViewport: vi.fn(), subscribe: vi.fn(() => vi.fn()) } as any,
        });

        await bootstrap.ensureReady();

        expect(lineCreate).toHaveBeenCalledTimes(1);
        expect(typeof capturedOnZoom).toBe('function');

        // Simulate the chart invoking its onZoom callback with a real
        // ViewSnapshot. The deps.onZoom must receive the same view with
        // finite xMin/xMax values.
        const view = { xMin: 100, xMax: 800, yMin: 10, yMax: 90 };
        capturedOnZoom!(view, 'user');

        expect(onZoom).toHaveBeenCalledTimes(1);
        const forwarded = onZoom.mock.calls[0];
        expect(forwarded[0]).toEqual(view);
        expect(Number.isFinite(forwarded[0].xMin)).toBe(true);
        expect(Number.isFinite(forwarded[0].xMax)).toBe(true);
        expect(forwarded[1]).toBe('user');
    });

    it('passes explicit adaptive gesture dependencies into chart bootstrap setup', async () => {
        checkWebGPUMock.mockResolvedValue(null);

        const buildColumnToggles = vi.fn();
        const buildRangeControls = vi.fn();
        const renderCurrentData = vi.fn();
        const getCurrentData = vi.fn(() => null);
        const onYRange = vi.fn();
        const workspace = { getSnapshot: vi.fn(() => ({ dataset: { metadata: null, revision: 0 }, viewport: { xMin: 0, xMax: 100, yMin: null, yMax: null } })), setSelection: vi.fn(), setFilters: vi.fn(), setViewport: vi.fn(), subscribe: vi.fn(() => vi.fn()) } as any;

        const { createTimeseriesBootstrap } = await import('./ensureReady.js');

        const bootstrap = createTimeseriesBootstrap({
            runtimeCache: { initialView: null },
            ensurePrimaryChartCtor: vi.fn().mockResolvedValue(class { }),
            onZoom: vi.fn(),
            onYRange,
            onZoomOut: vi.fn(),
            buildColumnToggles,
            buildRangeControls,
            renderCurrentData,
            getCurrentData,
            fetchAndRender: vi.fn().mockResolvedValue(undefined),
            refreshZoomControlsState: vi.fn(),
            workspace,
        });

        await bootstrap.ensureReady();

        expect(initAdaptiveFilterGestureMock).toHaveBeenCalledWith({
            workspace,
            buildColumnToggles,
            buildRangeControls,
            renderCurrentData,
            getCurrentData,
            updateAnalysisYRange: onYRange,
        });
    });
});

describe('getDefaultTimeseriesChartText', () => {
    it('surfaces timezone without inventing source-unit metadata', async () => {
        const { getDefaultTimeseriesChartText } = await import('./ensureReady.js');
        const text = getDefaultTimeseriesChartText(undefined);
        expect(text.xLabel).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
        expect(text.yLabel).toBe('Value');
    });

    it('uses a compact generic label for multiple unitless series', async () => {
        const { getDefaultTimeseriesChartText } = await import('./ensureReady.js');
        expect(getDefaultTimeseriesChartText(undefined, ['HUFL', 'HULL']).yLabel)
            .toBe('Series values');
        expect(getDefaultTimeseriesChartText(undefined, ['HULL']).yLabel)
            .toBe('HULL value');
    });

    it('preserves explicit chart labels', async () => {
        const { getDefaultTimeseriesChartText } = await import('./ensureReady.js');
        expect(getDefaultTimeseriesChartText({
            chartText: { title: 'Load', xLabel: 'Timestamp UTC', yLabel: 'Power (kW)' },
            seriesColors: {},
        })).toEqual({ title: 'Load', xLabel: 'Timestamp UTC', yLabel: 'Power (kW)' });
    });
});
