import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
    buildColumnTogglesMock,
    buildRangeControlsMock,
    initColumnFilterModalMock,
    initSeriesCollapseMock,
    initDatasetSearchInputsMock,
    initTimeseriesActionsMock,
} = vi.hoisted(() => ({
    buildColumnTogglesMock: vi.fn(),
    buildRangeControlsMock: vi.fn(),
    initColumnFilterModalMock: vi.fn(),
    initSeriesCollapseMock: vi.fn(),
    initDatasetSearchInputsMock: vi.fn(),
    initTimeseriesActionsMock: vi.fn(),
}));

vi.mock('./columnsController.js', () => ({
    buildColumnToggles: buildColumnTogglesMock,
    buildRangeControls: buildRangeControlsMock,
    initColumnFilterModal: initColumnFilterModalMock,
    initSeriesCollapse: initSeriesCollapseMock,
}));

vi.mock('./actions.js', () => ({
    initDatasetSearchInputs: initDatasetSearchInputsMock,
    initTimeseriesActions: initTimeseriesActionsMock,
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

    it('initializes filter modal, collapse, search inputs, and timeseries actions through the feature surface', () => {
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
        expect(initSeriesCollapseMock).toHaveBeenCalledTimes(1);
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
});
