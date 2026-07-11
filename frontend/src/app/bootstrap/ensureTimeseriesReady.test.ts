import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    appStateMock,
    checkWebGPUMock,
    setChartInstanceMock,
    setAnalysisBoundMock,
    setInitialViewMock,
    bindAnalysisChartEventsMock,
    getCurrentViewMock,
    setAnnotationOverlayCallbackMock,
    setAnomalyOverlayCallbackMock,
    initAdaptiveFilterGestureMock,
    initYRangeControlsMock,
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
    setAnalysisBoundMock: vi.fn(),
    setInitialViewMock: vi.fn(),
    bindAnalysisChartEventsMock: vi.fn(),
    getCurrentViewMock: vi.fn(() => ({ xMin: 0, xMax: 100, yMin: null, yMax: null })),
    setAnnotationOverlayCallbackMock: vi.fn(),
    setAnomalyOverlayCallbackMock: vi.fn(),
    initAdaptiveFilterGestureMock: vi.fn(),
    initYRangeControlsMock: vi.fn(),
    restoreSessionAfterChartReadyMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../webgpuGuard.js', () => ({
    checkWebGPU: checkWebGPUMock,
}));

vi.mock('../../store/index.js', () => ({
    chartState: appStateMock,
    datasetState: appStateMock,
    setAnalysisBound: setAnalysisBoundMock,
    setChartInstance: setChartInstanceMock,
    setInitialView: setInitialViewMock,
}));

vi.mock('../../ui/toolbar.js', () => ({
    bindAnalysisChartEvents: bindAnalysisChartEventsMock,
    getCurrentView: getCurrentViewMock,
}));

vi.mock('../../ui/annotationPanel.js', () => ({
    setAnnotationOverlayCallback: setAnnotationOverlayCallbackMock,
}));

vi.mock('../../bootstrap/analyticsOverlay.js', () => ({
    setAnomalyOverlayCallback: setAnomalyOverlayCallbackMock,
}));

vi.mock('../adaptiveGesture.js', () => ({
    initAdaptiveFilterGesture: initAdaptiveFilterGestureMock,
}));

vi.mock('../../ui/yRangeControls.js', () => ({
    initYRangeControls: initYRangeControlsMock,
}));

vi.mock('../../bootstrap/sessionBootstrap.js', () => ({
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
        const { createTimeseriesBootstrap } = await import('./ensureTimeseriesReady.js');

        const bootstrap = createTimeseriesBootstrap({
            ensurePrimaryChartCtor: vi.fn().mockResolvedValue(class { }),
            onZoom,
            onYRange,
            onZoomOut,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            fetchAndRender: vi.fn().mockResolvedValue(undefined),
            refreshZoomControlsState: vi.fn(),
            workspace: { getSnapshot: vi.fn(), setSelection: vi.fn(), setFilters: vi.fn(), setViewport: vi.fn() },
        });

        await bootstrap.ensureReady();

        expect(fallbackCreate).toHaveBeenCalledWith('main-chart', {
            onZoom,
            onYRange,
            onZoomOut,
        });
        expect(appStateMock.chart).toBe(fallbackChart);
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
        const { createTimeseriesBootstrap } = await import('./ensureTimeseriesReady.js');

        const bootstrap = createTimeseriesBootstrap({
            ensurePrimaryChartCtor: vi.fn().mockResolvedValue(class { }),
            onZoom,
            onYRange,
            onZoomOut,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            fetchAndRender: vi.fn().mockResolvedValue(undefined),
            refreshZoomControlsState: vi.fn(),
            workspace: { getSnapshot: vi.fn(), setSelection: vi.fn(), setFilters: vi.fn(), setViewport: vi.fn() },
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

    it('initializes Y-range controls after the main chart is ready', async () => {
        checkWebGPUMock.mockResolvedValue(null);

        const { createTimeseriesBootstrap } = await import('./ensureTimeseriesReady.js');

        const bootstrap = createTimeseriesBootstrap({
            ensurePrimaryChartCtor: vi.fn().mockResolvedValue(class { }),
            onZoom: vi.fn(),
            onYRange: vi.fn(),
            onZoomOut: vi.fn(),
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            fetchAndRender: vi.fn().mockResolvedValue(undefined),
            refreshZoomControlsState: vi.fn(),
            workspace: { getSnapshot: vi.fn(), setSelection: vi.fn(), setFilters: vi.fn(), setViewport: vi.fn() },
        });

        await bootstrap.ensureReady();

        expect(initYRangeControlsMock).toHaveBeenCalledTimes(1);
    });

    it('passes explicit adaptive gesture dependencies into chart bootstrap setup', async () => {
        checkWebGPUMock.mockResolvedValue(null);

        const buildColumnToggles = vi.fn();
        const buildRangeControls = vi.fn();
        const renderCurrentData = vi.fn();
        const onYRange = vi.fn();
        const workspace = { getSnapshot: vi.fn(), setSelection: vi.fn(), setFilters: vi.fn(), setViewport: vi.fn() };

        const { createTimeseriesBootstrap } = await import('./ensureTimeseriesReady.js');

        const bootstrap = createTimeseriesBootstrap({
            ensurePrimaryChartCtor: vi.fn().mockResolvedValue(class { }),
            onZoom: vi.fn(),
            onYRange,
            onZoomOut: vi.fn(),
            buildColumnToggles,
            buildRangeControls,
            renderCurrentData,
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
            updateAnalysisYRange: onYRange,
        });
    });
});
