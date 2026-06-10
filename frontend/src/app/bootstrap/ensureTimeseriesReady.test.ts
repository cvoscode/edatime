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
    restoreSessionAfterChartReadyMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../store/appStateCompat.js', () => ({
    appState: appStateMock,
}));

vi.mock('../webgpuGuard.js', () => ({
    checkWebGPU: checkWebGPUMock,
}));

vi.mock('../../store/index.js', () => ({
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
            DataChartCtor: class { } as any,
            onZoom,
            onYRange,
            onZoomOut,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            fetchAndRender: vi.fn().mockResolvedValue(undefined),
            refreshZoomControlsState: vi.fn(),
        });

        await bootstrap.ensureReady();

        expect(fallbackCreate).toHaveBeenCalledWith('main-chart', {
            onZoom,
            onYRange,
            onZoomOut,
        });
        expect(appStateMock.chart).toBe(fallbackChart);
    });
});
