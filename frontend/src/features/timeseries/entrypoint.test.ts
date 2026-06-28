import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
    buildColumnTogglesMock,
    buildRangeControlsMock,
    initColumnFilterModalMock,
    initDatasetSearchInputsMock,
    initTimeseriesActionsMock,
    initTimeseriesExportButtonsMock,
} = vi.hoisted(() => ({
    buildColumnTogglesMock: vi.fn(),
    buildRangeControlsMock: vi.fn(),
    initColumnFilterModalMock: vi.fn(),
    initDatasetSearchInputsMock: vi.fn(),
    initTimeseriesActionsMock: vi.fn(),
    initTimeseriesExportButtonsMock: vi.fn(),
}));

vi.mock('./columnsController.js', () => ({
    buildColumnToggles: buildColumnTogglesMock,
    buildRangeControls: buildRangeControlsMock,
    initColumnFilterModal: initColumnFilterModalMock,
}));

vi.mock('./actions.js', () => ({
    initDatasetSearchInputs: initDatasetSearchInputsMock,
    initTimeseriesActions: initTimeseriesActionsMock,
    initTimeseriesExportButtons: initTimeseriesExportButtonsMock,
}));

import { createTimeseriesEntrypoint } from './entrypoint.js';

describe('createTimeseriesEntrypoint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns init, rebuildColumns, and buildRangeControls', () => {
        const feature = createTimeseriesEntrypoint({
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
            registerCleanup: vi.fn(),
        });

        expect(feature.init).toBeTypeOf('function');
        expect(feature.rebuildColumns).toBeTypeOf('function');
        expect(feature.buildRangeControls).toBeTypeOf('function');
    });

    it('rebuilds column toggles through one feature surface', () => {
        const fetchAndRender = vi.fn();
        const renderCurrentData = vi.fn();
        const feature = createTimeseriesEntrypoint({
            fetchAndRender,
            renderCurrentData,
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
            registerCleanup: vi.fn(),
        });

        feature.rebuildColumns();

        expect(buildColumnTogglesMock).toHaveBeenCalledTimes(1);
        expect(buildColumnTogglesMock).toHaveBeenCalledWith(fetchAndRender, buildRangeControlsMock, renderCurrentData);
    });

    it('initializes filter modal, search inputs, and timeseries actions through the feature surface', () => {
        const deps = {
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            renderColumnProfilesGrid: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
            registerCleanup: vi.fn(),
        };
        const feature = createTimeseriesEntrypoint(deps);

        feature.init();

        expect(initColumnFilterModalMock).toHaveBeenCalledWith(deps.renderCurrentData, deps.updateAnalysisYRange);
        expect(initDatasetSearchInputsMock).toHaveBeenCalledTimes(1);
        expect(initTimeseriesActionsMock).toHaveBeenCalledTimes(1);
        expect(initTimeseriesActionsMock).toHaveBeenCalledWith(expect.objectContaining({
            fetchAndRender: deps.fetchAndRender,
            renderCurrentData: deps.renderCurrentData,
            buildRangeControls: buildRangeControlsMock,
            updateAnalysisZoom: deps.updateAnalysisZoom,
            emitChartRangeChange: deps.emitChartRangeChange,
            registerCleanup: deps.registerCleanup,
            rebuildColumnToggles: expect.any(Function),
            renderColumnProfilesGrid: deps.renderColumnProfilesGrid,
        }));
    });

    it('wires the export buttons when all five handlers are provided', () => {
        const feature = createTimeseriesEntrypoint({
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
            registerCleanup: vi.fn(),
            chartExportPng: vi.fn(),
            chartExportSvg: vi.fn(),
            exportFilteredCsv: vi.fn(),
            exportFilteredJson: vi.fn(),
            exportFilteredParquet: vi.fn(),
        });

        feature.init();

        expect(initTimeseriesExportButtonsMock).toHaveBeenCalledTimes(1);
        expect(initTimeseriesExportButtonsMock).toHaveBeenCalledWith(expect.objectContaining({
            chartExportPng: expect.any(Function),
            chartExportSvg: expect.any(Function),
            exportFilteredCsv: expect.any(Function),
            exportFilteredJson: expect.any(Function),
            exportFilteredParquet: expect.any(Function),
        }));
    });

    it('skips wiring the export buttons when any handler is missing', () => {
        const feature = createTimeseriesEntrypoint({
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
            registerCleanup: vi.fn(),
            chartExportPng: vi.fn(),
            // missing the rest
        });

        feature.init();

        expect(initTimeseriesExportButtonsMock).not.toHaveBeenCalled();
    });
});
