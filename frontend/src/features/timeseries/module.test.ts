// Test that freezes the Timeseries local composition seam.
// Verifies createTimeseriesModule composes page + feature + runtime + bootstrap
// into a single stable surface. These tests will pass once timeseriesModule.ts
// is implemented in Task 4.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// vi.hoisted ensures mocks are created before vi.mock() calls
const {
    mockCreateTimeseriesPageController,
    mockCreateTimeseriesControls,
    mockCreateTimeseriesRuntime,
    mockCreateDatasetBootstrap,
    mockCreateTimeseriesBootstrap,
    mockCreateTimeseriesShortcuts,
} = vi.hoisted(() => {
    const mockCreateTimeseriesPageController = vi.fn();
    const mockCreateTimeseriesControls = vi.fn();
    const mockCreateTimeseriesRuntime = vi.fn();
    const mockCreateDatasetBootstrap = vi.fn();
    const mockCreateTimeseriesBootstrap = vi.fn();
    const mockCreateTimeseriesShortcuts = vi.fn();
    return {
        mockCreateTimeseriesPageController,
        mockCreateTimeseriesControls,
        mockCreateTimeseriesRuntime,
        mockCreateDatasetBootstrap,
        mockCreateTimeseriesBootstrap,
        mockCreateTimeseriesShortcuts,
    };
});

// Mock the feature-owned timeseries controller.
vi.mock('./controller.js', () => ({
    createTimeseriesPageController: mockCreateTimeseriesPageController,
}));

// Mock the feature-owned Timeseries controls.
vi.mock('./controls.js', () => ({
    createTimeseriesControls: mockCreateTimeseriesControls,
}));

// Mock the feature-owned lifecycle module.
vi.mock('./lifecycle.js', () => ({
    createTimeseriesLifecycle: mockCreateTimeseriesRuntime,
}));

// Mock the Timeseries-owned dataset bootstrap.
vi.mock('./datasetBootstrap.js', () => ({
    createDatasetBootstrap: mockCreateDatasetBootstrap,
}));

vi.mock('./ensureReady.js', () => ({
    createTimeseriesBootstrap: mockCreateTimeseriesBootstrap,
}));

vi.mock('./shortcuts.js', () => ({
    createTimeseriesShortcuts: mockCreateTimeseriesShortcuts,
}));

// ── Shared mock helpers ───────────────────────────────────────────────────────
const mockPageController = () => ({
    dispose: vi.fn(),
    fetchAndRender: vi.fn().mockResolvedValue(undefined),
    getCurrentData: vi.fn<() => unknown>(() => null),
    onZoomRangeChange: vi.fn(),
    resetZoom: vi.fn(),
    renderCurrentData: vi.fn(),
});

const mockFeatureEntrypoint = () => ({
    init: vi.fn(),
    rebuildColumns: vi.fn(),
    buildRangeControls: vi.fn(),
});

const mockRuntime = () => ({
    mount: vi.fn(() => vi.fn()),
    ensureReady: vi.fn().mockResolvedValue(undefined),
});

const mockBootstrap = () => ({
    ensureReady: vi.fn().mockResolvedValue(undefined),
    ensureDatasetReady: vi.fn().mockResolvedValue(undefined),
    refreshAfterMutation: vi.fn().mockResolvedValue(undefined),
});

const mockChartBootstrap = () => ({
    ensureReady: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn(() => false),
});

const defaultDeps = () => ({
    fetchData: vi.fn(),
    fetchMetadata: vi.fn(),
    workspace: {
        getSnapshot: vi.fn(() => ({
            dataset: { metadata: null, revision: 0 },
            selection: { columns: [], colorColumn: null },
            filters: { columnRanges: {}, adaptiveLines: [] },
            viewport: null,
        })),
        beginDatasetSession: vi.fn(() => ({ id: 1, signal: new AbortController().signal })),
        commitDataset: vi.fn(() => true),
        setSelection: vi.fn(),
        setFilters: vi.fn(),
        setViewport: vi.fn(),
        subscribe: vi.fn(() => vi.fn()),
    },
    DataChartCtor: class {} as any,
    ensurePrimaryChartCtor: vi.fn().mockResolvedValue(class {}),
    markMetadataReady: vi.fn(),
    isMetadataReady: vi.fn(() => false),
    sanitizeSelectedColumns: vi.fn(),
    clearLoadedPageModules: vi.fn(),
    ensureSessionPersistenceStarted: vi.fn(),
    setNumericCols: vi.fn(),
    setAdaptiveFilterColumn: vi.fn(),
    setViewport: vi.fn(),
    updateAnalysisYRange: vi.fn(),
    updateAnalysisZoom: vi.fn(),
    getCurrentView: vi.fn(),
    fetchAndRenderAnalytics: vi.fn(),
    refreshZoomControlsState: vi.fn(),
    zoomOut: vi.fn(),
});

describe('createTimeseriesModule', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset all mock return values
        mockCreateTimeseriesPageController.mockReturnValue(mockPageController());
        mockCreateTimeseriesControls.mockReturnValue(mockFeatureEntrypoint());
        mockCreateTimeseriesRuntime.mockReturnValue(mockRuntime());
        mockCreateDatasetBootstrap.mockReturnValue(mockBootstrap());
        mockCreateTimeseriesBootstrap.mockReturnValue(mockChartBootstrap());
        mockCreateTimeseriesShortcuts.mockReturnValue({ mount: vi.fn(() => vi.fn()) });
    });

    // -------------------------------------------------------------------------
    // Test 1: Page controller and feature controls are composed together once
    // -------------------------------------------------------------------------
    it('composes page controller and feature controls together once', async () => {
        const { createTimeseriesModule } = await import('./module.js');

        const deps = defaultDeps();
        const mod = createTimeseriesModule(deps as any);

        // The module should have exposed methods from both page controller and feature
        expect(mod.fetchAndRender).toBeDefined();
        expect(mod.getCurrentData).toBeDefined();
        expect(mod.renderCurrentData).toBeDefined();
        expect(mod.buildColumnToggles).toBeDefined();
        expect(mod.buildRangeControls).toBeDefined();
        expect(mod.onZoomRangeChange).toBeDefined();
        expect(mod.zoomOut).toBeDefined();
        expect(mod.resetZoom).toBeDefined();

        // createTimeseriesPageController should be called once with correct deps
        expect(mockCreateTimeseriesPageController).toHaveBeenCalledTimes(1);
        expect(mockCreateTimeseriesPageController).toHaveBeenCalledWith(expect.objectContaining({
            workspace: deps.workspace,
        }));

        // createTimeseriesControls should be called once
        expect(mockCreateTimeseriesControls).toHaveBeenCalledTimes(1);

        // createDatasetBootstrap must receive the real bootstrap collaborators,
        // not placeholder no-op functions created inside the module.
        expect(mockCreateDatasetBootstrap).toHaveBeenCalledWith(expect.objectContaining({
            fetchMetadata: deps.fetchMetadata,
            workspace: deps.workspace,
            markMetadataReady: deps.markMetadataReady,
            sanitizeSelectedColumns: deps.sanitizeSelectedColumns,
            clearLoadedPageModules: deps.clearLoadedPageModules,
            ensureSessionPersistenceStarted: deps.ensureSessionPersistenceStarted,
            setNumericCols: deps.setNumericCols,
            setAdaptiveFilterColumn: deps.setAdaptiveFilterColumn,
        }));
    });

    it('exposes fetched data through the Timeseries public module surface', async () => {
        const pageController = mockPageController();
        const data = { ts: new Float64Array([1]), values: {} };
        pageController.getCurrentData.mockReturnValue(data);
        mockCreateTimeseriesPageController.mockReturnValue(pageController);

        const { createTimeseriesModule } = await import('./module.js');
        const module = createTimeseriesModule(defaultDeps());

        expect(module.getCurrentData()).toBe(data);
        expect(pageController.getCurrentData).toHaveBeenCalledTimes(1);
    });

    it('clears workspace filters when the dataset bootstrap clears persisted filters', async () => {
        const { createTimeseriesModule } = await import('./module.js');
        const deps = defaultDeps();
        createTimeseriesModule(deps as any);

        const bootstrapDeps = mockCreateDatasetBootstrap.mock.calls[0]?.[0];
        bootstrapDeps.clearPersistedFilters();

        expect(deps.workspace.setFilters).toHaveBeenCalledWith({ columnRanges: {}, adaptiveLines: [] });
    });

    it('clears an invalid recovered color column in the workspace', async () => {
        const { createTimeseriesModule } = await import('./module.js');
        const deps = defaultDeps();
        deps.fetchMetadata.mockResolvedValue({
            revision: 1,
            numeric_columns: ['value'],
            columns: [{ name: 'value', dtype: 'float64' }],
        });
        deps.workspace.getSnapshot.mockReturnValue({
            dataset: { metadata: null, revision: 0 },
            selection: { columns: ['value'], colorColumn: 'stale-bucket' },
            filters: { columnRanges: {}, adaptiveLines: [] },
            viewport: null,
        } as any);
        createTimeseriesModule(deps as any);
        const pageDeps = mockCreateTimeseriesPageController.mock.calls[0]?.[0];
        await pageDeps.recoverFromColumnMismatch();

        expect(deps.workspace.setSelection).toHaveBeenCalledWith(['value'], null);
    });

    // -------------------------------------------------------------------------
    // Test 2: buildColumnToggles and buildRangeControls are exposed directly
    // -------------------------------------------------------------------------
    it('exposes buildColumnToggles and buildRangeControls from the module surface', async () => {
        const feature = mockFeatureEntrypoint();
        mockCreateTimeseriesControls.mockReturnValue(feature);

        const { createTimeseriesModule } = await import('./module.js');

        const mod = createTimeseriesModule(defaultDeps());

        // These should be exposed directly from the module, not via separate trampolines
        expect(typeof mod.buildColumnToggles).toBe('function');
        expect(typeof mod.buildRangeControls).toBe('function');

        // Calling buildColumnToggles delegates to feature.rebuildColumns()
        mod.buildColumnToggles();
        expect(feature.rebuildColumns).toHaveBeenCalled();

        // Calling buildRangeControls delegates to the feature-owned range controls,
        // not back through the outer deps trampoline.
        mod.buildRangeControls();
        expect(feature.buildRangeControls).toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Test 3: Module provides a single stable interface — no direct access to internals
    // -------------------------------------------------------------------------
    it('provides a single stable interface with no direct access to page/feature internals', async () => {
        const { createTimeseriesModule } = await import('./module.js');

        const mod = createTimeseriesModule(defaultDeps());

        // The module should provide a single stable surface
        const surfaceKeys = [
            'mount',
            'ensureDatasetReady',
            'ensureReady',
            'fetchAndRender',
            'getCurrentData',
            'renderCurrentData',
            'buildColumnToggles',
            'buildRangeControls',
            'onZoomRangeChange',
            'zoomOut',
            'resetZoom',
            'refreshAfterMutation',
        ];

        for (const key of surfaceKeys) {
            expect(key in mod).toBe(true);
            expect(typeof (mod as any)[key]).toBe('function');
        }

        // Ensure no internal symbols leak out (module should only expose documented surface)
        const unexpectedKeys = Object.keys(mod).filter(k => !surfaceKeys.includes(k));
        expect(unexpectedKeys).toHaveLength(0);
    });

    // -------------------------------------------------------------------------
    // Test 4: Module exposes mount(), ensureDatasetReady(), ensureReady(), refreshAfterMutation()
    // -------------------------------------------------------------------------
    it('mount() returns a cleanup function', async () => {
        const runtime = mockRuntime();
        const pageController = mockPageController();
        const unregisterMock = vi.fn();
        runtime.mount.mockReturnValue(unregisterMock);
        mockCreateTimeseriesRuntime.mockReturnValue(runtime);
        mockCreateTimeseriesPageController.mockReturnValue(pageController);

        const { createTimeseriesModule } = await import('./module.js');

        const mod = createTimeseriesModule(defaultDeps());
        const cleanup = mod.mount();

        expect(typeof cleanup).toBe('function');
        cleanup();
        expect(unregisterMock).toHaveBeenCalled();
        expect(pageController.dispose).toHaveBeenCalled();
    });

    it('mounts Timeseries shortcuts and releases them with the feature lifecycle', async () => {
        const runtime = mockRuntime();
        const pageController = mockPageController();
        const shortcutCleanup = vi.fn();
        mockCreateTimeseriesRuntime.mockReturnValue(runtime);
        mockCreateTimeseriesPageController.mockReturnValue(pageController);
        const shortcuts = { mount: vi.fn(() => shortcutCleanup) };
        mockCreateTimeseriesShortcuts.mockReturnValue(shortcuts);

        const { createTimeseriesModule } = await import('./module.js');
        const mod = createTimeseriesModule(defaultDeps());
        const cleanup = mod.mount();

        expect(mockCreateTimeseriesShortcuts).toHaveBeenCalledTimes(1);
        expect(shortcuts.mount).toHaveBeenCalledWith(expect.objectContaining({
            fetchAndRender: expect.any(Function),
            zoomOut: expect.any(Function),
            resetZoom: expect.any(Function),
        }));
        cleanup();
        expect(shortcutCleanup).toHaveBeenCalledTimes(1);
    });

    it('ensureDatasetReady() returns a Promise', async () => {
        const bootstrap = mockBootstrap();
        mockCreateDatasetBootstrap.mockReturnValue(bootstrap);

        const { createTimeseriesModule } = await import('./module.js');

        const mod = createTimeseriesModule(defaultDeps());
        const result = mod.ensureDatasetReady();

        expect(result).toBeInstanceOf(Promise);
        await result;
        expect(bootstrap.ensureDatasetReady).toHaveBeenCalled();
    });

    it('wires runtime ensureReady through dataset bootstrap and chart bootstrap', async () => {
        const datasetBootstrap = mockBootstrap();
        const chartBootstrap = mockChartBootstrap();
        mockCreateDatasetBootstrap.mockReturnValue(datasetBootstrap);
        mockCreateTimeseriesBootstrap.mockReturnValue(chartBootstrap);

        const { createTimeseriesModule } = await import('./module.js');

        createTimeseriesModule(defaultDeps());
        const runtimeDeps = mockCreateTimeseriesRuntime.mock.calls[0]?.[0];

        await runtimeDeps.ensureReady();

        expect(datasetBootstrap.ensureDatasetReady).toHaveBeenCalledTimes(1);
        expect(chartBootstrap.ensureReady).toHaveBeenCalledTimes(1);
    });

    it('exposes the same ensureReady on the public surface, calling dataset + chart bootstrap in order', async () => {
        const datasetBootstrap = mockBootstrap();
        const chartBootstrap = mockChartBootstrap();
        const order: string[] = [];
        datasetBootstrap.ensureDatasetReady.mockImplementation(async () => { order.push('dataset'); });
        chartBootstrap.ensureReady.mockImplementation(async () => { order.push('chart'); });
        mockCreateDatasetBootstrap.mockReturnValue(datasetBootstrap);
        mockCreateTimeseriesBootstrap.mockReturnValue(chartBootstrap);

        const { createTimeseriesModule } = await import('./module.js');

        const mod = createTimeseriesModule(defaultDeps());

        // The public surface must expose ensureReady, and it must invoke both
        // bootstraps — the regression being guarded is the case where the
        // public method degraded to a dataset-only call.
        expect(typeof mod.ensureReady).toBe('function');
        await mod.ensureReady();
        expect(datasetBootstrap.ensureDatasetReady).toHaveBeenCalledTimes(1);
        expect(chartBootstrap.ensureReady).toHaveBeenCalledTimes(1);
        // Order matters: dataset must be hydrated before the chart is mounted.
        expect(order).toEqual(['dataset', 'chart']);
    });

    it('public ensureReady is idempotent and stable across repeated calls', async () => {
        const datasetBootstrap = mockBootstrap();
        const chartBootstrap = mockChartBootstrap();
        mockCreateDatasetBootstrap.mockReturnValue(datasetBootstrap);
        mockCreateTimeseriesBootstrap.mockReturnValue(chartBootstrap);

        const { createTimeseriesModule } = await import('./module.js');

        const mod = createTimeseriesModule(defaultDeps());

        await mod.ensureReady();
        await mod.ensureReady();
        await mod.ensureReady();

        // Each call exercises the full pipeline; idempotency is the
        // responsibility of the underlying bootstrap, not the module.
        expect(datasetBootstrap.ensureDatasetReady).toHaveBeenCalledTimes(3);
        expect(chartBootstrap.ensureReady).toHaveBeenCalledTimes(3);
    });

    it('refreshAfterMutation() returns a Promise and accepts optional { selectedColumn }', async () => {
        const bootstrap = mockBootstrap();
        mockCreateDatasetBootstrap.mockReturnValue(bootstrap);

        const { createTimeseriesModule } = await import('./module.js');

        const mod = createTimeseriesModule(defaultDeps());

        // Call without options
        const result1 = mod.refreshAfterMutation();
        expect(result1).toBeInstanceOf(Promise);
        await result1;

        // Call with options
        const result2 = mod.refreshAfterMutation({ selectedColumn: 'test_col' });
        expect(result2).toBeInstanceOf(Promise);
        await result2;
    });
});
