import { describe, expect, it, vi, beforeEach } from 'vitest';
import { makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';

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

import { createTimeseriesControls } from './controls.js';

function selectionWorkspace() {
    return {
        getSnapshot: vi.fn(() => makeWorkspaceSnapshot()),
        setSelection: vi.fn(),
        setFilters: vi.fn(),
        setViewport: vi.fn(),
    };
}

describe('createTimeseriesControls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns init, rebuildColumns, and buildRangeControls', () => {
        const feature = createTimeseriesControls({
            workspace: selectionWorkspace(),
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
        });

        expect(feature.init).toBeTypeOf('function');
        expect(feature.rebuildColumns).toBeTypeOf('function');
        expect(feature.buildRangeControls).toBeTypeOf('function');
    });

    it('rebuilds column toggles through one feature surface', () => {
        const fetchAndRender = vi.fn();
        const renderCurrentData = vi.fn();
        const feature = createTimeseriesControls({
            workspace: selectionWorkspace(),
            fetchAndRender,
            renderCurrentData,
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
        });

        feature.rebuildColumns();

        expect(buildColumnTogglesMock).toHaveBeenCalledTimes(1);
        expect(buildColumnTogglesMock).toHaveBeenCalledWith(
            fetchAndRender,
            expect.any(Function),
            renderCurrentData,
            expect.any(Object),
        );
    });

    it('initializes filter modal, search inputs, and timeseries actions through the feature surface', () => {
        const deps = {
            workspace: selectionWorkspace(),
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            renderColumnProfilesGrid: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
        };
        const feature = createTimeseriesControls(deps);

        feature.init();

        expect(initColumnFilterModalMock).toHaveBeenCalledWith(
            deps.renderCurrentData,
            deps.updateAnalysisYRange,
            deps.workspace,
        );
        expect(initDatasetSearchInputsMock).toHaveBeenCalledTimes(1);
        expect(initTimeseriesActionsMock).toHaveBeenCalledTimes(1);
        expect(initTimeseriesActionsMock).toHaveBeenCalledWith(expect.objectContaining({
            fetchAndRender: deps.fetchAndRender,
            renderCurrentData: deps.renderCurrentData,
            buildRangeControls: expect.any(Function),
            updateAnalysisZoom: deps.updateAnalysisZoom,
            emitChartRangeChange: deps.emitChartRangeChange,
            registerCleanup: expect.any(Function),
            rebuildColumnToggles: expect.any(Function),
            renderColumnProfilesGrid: deps.renderColumnProfilesGrid,
            workspace: deps.workspace,
        }));
    });

    it('initializes controls once and disposes registered actions', () => {
        const actionCleanup = vi.fn();
        initTimeseriesActionsMock.mockImplementation((deps) => deps.registerCleanup(actionCleanup));
        const feature = createTimeseriesControls({
            workspace: selectionWorkspace(),
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
        });

        const dispose = feature.init();
        feature.init();

        expect(initTimeseriesActionsMock).toHaveBeenCalledTimes(1);
        dispose?.();
        expect(actionCleanup).toHaveBeenCalledTimes(1);
    });

    it('owns the empty-state upload action for its lifecycle', () => {
        document.body.innerHTML = '<button id="timeseries-empty-upload-btn"></button>';
        initTimeseriesActionsMock.mockImplementation(() => {});
        const feature = createTimeseriesControls({
            workspace: selectionWorkspace(),
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
        });
        const onPageChange = vi.fn();
        window.addEventListener('edatime:page-change', onPageChange);

        const dispose = feature.init();
        document.getElementById('timeseries-empty-upload-btn')!.click();
        dispose?.();
        document.getElementById('timeseries-empty-upload-btn')!.click();

        expect(onPageChange).toHaveBeenCalledTimes(1);
        expect(onPageChange.mock.calls[0]?.[0]).toMatchObject({ detail: { page: 'upload' } });
        window.removeEventListener('edatime:page-change', onPageChange);
    });

    it('wires the export buttons when all five handlers are provided', () => {
        const feature = createTimeseriesControls({
            workspace: selectionWorkspace(),
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
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
        const feature = createTimeseriesControls({
            workspace: selectionWorkspace(),
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            emitChartRangeChange: vi.fn(),
            chartExportPng: vi.fn(),
            // missing the rest
        });

        feature.init();

        expect(initTimeseriesExportButtonsMock).not.toHaveBeenCalled();
    });
});
