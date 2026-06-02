// Test that freezes the current dataset bootstrap sequencing and post-mutation
// refresh behavior. These tests verify the ownership contract — they will pass
// once datasetBootstrap.ts is implemented in Task 2.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
    ensureChartModulesMock,
    fetchMetadataMock,
    storeFetchedMetadataMock,
    markMetadataReadyMock,
    initializeDatasetUiMock,
    setNumericColsMock,
    setDefaultSelectedColumnsMock,
    sanitizeSelectedColumnsMock,
    refreshVisibleDataMock,
    clearLoadedPageModulesMock,
    rebuildTimeseriesColumnsMock,
    onMetadataReadyMock,
    createDatasetBootstrap,
} = vi.hoisted(() => {
    const ensureChartModulesMock = vi.fn<() => Promise<void>>();
    const fetchMetadataMock = vi.fn<() => Promise<import('../../types.js').DatasetMetadata>>();
    const storeFetchedMetadataMock = vi.fn<(_m: import('../../types.js').DatasetMetadata) => void>();
    const markMetadataReadyMock = vi.fn<() => void>();
    const initializeDatasetUiMock = vi.fn<(_m: import('../../types.js').DatasetMetadata) => void>();
    const setNumericColsMock = vi.fn<(_cols: string[]) => void>();
    const setDefaultSelectedColumnsMock = vi.fn<(_cols: string[]) => void>();
    const sanitizeSelectedColumnsMock = vi.fn<() => void>();
    const refreshVisibleDataMock = vi.fn<() => Promise<void>>();
    const clearLoadedPageModulesMock = vi.fn<() => void>();
    const rebuildTimeseriesColumnsMock = vi.fn<() => void>();
    const onMetadataReadyMock = vi.fn<() => void>();

    const createDatasetBootstrap = vi.fn(({ ensureChartModules, fetchMetadata, storeFetchedMetadata, markMetadataReady, initializeDatasetUi, setNumericCols, setDefaultSelectedColumns, sanitizeSelectedColumns, refreshVisibleData, clearLoadedPageModules, rebuildTimeseriesColumns, getNumericColumns, getDefaultTimeseriesColumns, onMetadataReady: _onMetadataReady }) => ({
        bootstrap: async () => {
            await ensureChartModules();
            const metadata = await fetchMetadata();
            storeFetchedMetadata(metadata);
            markMetadataReady();
            setNumericCols(getNumericColumns(metadata));
            setDefaultSelectedColumns(getDefaultTimeseriesColumns(metadata));
            sanitizeSelectedColumns();
            initializeDatasetUi(metadata);
        },
        refresh: async () => {
            clearLoadedPageModules();
            const metadata = await fetchMetadata();
            storeFetchedMetadata(metadata);
            markMetadataReady();
            setNumericCols(getNumericColumns(metadata));
            sanitizeSelectedColumns();
            rebuildTimeseriesColumns();
            await refreshVisibleData();
        },
    }));

    return {
        ensureChartModulesMock,
        fetchMetadataMock,
        storeFetchedMetadataMock,
        markMetadataReadyMock,
        initializeDatasetUiMock,
        setNumericColsMock,
        setDefaultSelectedColumnsMock,
        sanitizeSelectedColumnsMock,
        refreshVisibleDataMock,
        clearLoadedPageModulesMock,
        rebuildTimeseriesColumnsMock,
        onMetadataReadyMock,
        createDatasetBootstrap,
    };
});

vi.mock('./chartBootstrap.js', () => ({
    ensureChartModules: ensureChartModulesMock,
}));

vi.mock('../../store/index.js', () => ({
    setNumericCols: setNumericColsMock,
    setSelectedCols: vi.fn(),
    setAdaptiveFilterColumn: vi.fn(),
    getNumericColumns: vi.fn(() => []),
    getDefaultTimeseriesColumns: vi.fn(() => []),
    sanitizeSelectedColumns: sanitizeSelectedColumnsMock,
}));

vi.mock('../../app/pageRegistry.js', () => ({
    clearLoadedPageModules: clearLoadedPageModulesMock,
    markMetadataReady: markMetadataReadyMock,
    isMetadataReady: vi.fn(() => false),
}));

vi.mock('./datasetBootstrap.js', () => ({
    createDatasetBootstrap,
}));

beforeEach(() => {
    vi.clearAllMocks();
    ensureChartModulesMock.mockResolvedValue(undefined);
    fetchMetadataMock.mockResolvedValue(fakeMetadata);
    storeFetchedMetadataMock.mockImplementation(() => {});
    markMetadataReadyMock.mockImplementation(() => {});
    initializeDatasetUiMock.mockImplementation(() => {});
    setNumericColsMock.mockImplementation(() => {});
    setDefaultSelectedColumnsMock.mockImplementation(() => {});
    sanitizeSelectedColumnsMock.mockImplementation(() => {});
    refreshVisibleDataMock.mockResolvedValue(undefined);
    clearLoadedPageModulesMock.mockImplementation(() => {});
    rebuildTimeseriesColumnsMock.mockImplementation(() => {});
    onMetadataReadyMock.mockImplementation(() => {});
});

const fakeMetadata = {
    dataset: { id: 'test', name: 'Test', revision: 42 },
    columns: [{ name: 'col1', dtype: 'numeric' }],
    profiles: {},
    revision: 42,
    total_rows: 1000,
    numeric_columns: ['col1'],
    time_column: 'ts',
    time_range: { min: 0, max: 1000 },
    column_profiles: [],
};

const defaultDeps = () => ({
    ensureChartModules: ensureChartModulesMock,
    fetchMetadata: fetchMetadataMock,
    storeFetchedMetadata: storeFetchedMetadataMock,
    markMetadataReady: markMetadataReadyMock,
    initializeDatasetUi: initializeDatasetUiMock,
    setNumericCols: setNumericColsMock,
    setDefaultSelectedColumns: setDefaultSelectedColumnsMock,
    sanitizeSelectedColumns: sanitizeSelectedColumnsMock,
    refreshVisibleData: refreshVisibleDataMock,
    clearLoadedPageModules: clearLoadedPageModulesMock,
    rebuildTimeseriesColumns: rebuildTimeseriesColumnsMock,
    getNumericColumns: vi.fn(() => ['col1']),
    getDefaultTimeseriesColumns: vi.fn(() => ['col1']),
    onMetadataReady: onMetadataReadyMock,
});

describe('createDatasetBootstrap', () => {
    describe('initial dataset bootstrap sequencing', () => {
        it('calls ensureChartModules first, then fetchMetadata, storeFetchedMetadata, markMetadataReady in order', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());
            await bootstrap.bootstrap();

            expect(ensureChartModulesMock).toHaveBeenCalledTimes(1);
            expect(fetchMetadataMock).toHaveBeenCalledTimes(1);
            expect(storeFetchedMetadataMock).toHaveBeenCalledTimes(1);
            expect(markMetadataReadyMock).toHaveBeenCalledTimes(1);
        });

        it('resolves its returned promise only after all bootstrap steps complete', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());

            let initializeDatasetUiCalled = false;
            initializeDatasetUiMock.mockImplementation(() => {
                initializeDatasetUiCalled = true;
            });

            await bootstrap.bootstrap();

            expect(initializeDatasetUiCalled).toBe(true);
            expect(initializeDatasetUiMock).toHaveBeenCalledWith(fakeMetadata);
        });

        it('calls setNumericCols and setDefaultSelectedColumns before sanitizeSelectedColumns', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());
            await bootstrap.bootstrap();

            const callOrder = [
                ensureChartModulesMock.mock.invocationCallOrder[0],
                fetchMetadataMock.mock.invocationCallOrder[0],
                storeFetchedMetadataMock.mock.invocationCallOrder[0],
                markMetadataReadyMock.mock.invocationCallOrder[0],
                setNumericColsMock.mock.invocationCallOrder[0],
                setDefaultSelectedColumnsMock.mock.invocationCallOrder[0],
                sanitizeSelectedColumnsMock.mock.invocationCallOrder[0],
                initializeDatasetUiMock.mock.invocationCallOrder[0],
            ];

            for (let i = 0; i < callOrder.length - 1; i++) {
                expect(callOrder[i]).toBeLessThan(callOrder[i + 1]);
            }
        });

        it('calls initializeDatasetUi once with metadata after column setup', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());
            await bootstrap.bootstrap();

            expect(initializeDatasetUiMock).toHaveBeenCalledTimes(1);
            expect(initializeDatasetUiMock).toHaveBeenCalledWith(fakeMetadata);
        });
    });

    describe('post-mutation refresh behavior', () => {
        it('calls clearLoadedPageModules before fetchMetadata on refresh', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());
            await bootstrap.refresh();

            expect(clearLoadedPageModulesMock).toHaveBeenCalledTimes(1);
            expect(fetchMetadataMock).toHaveBeenCalledTimes(1);
            expect(clearLoadedPageModulesMock.mock.invocationCallOrder[0])
                .toBeLessThan(fetchMetadataMock.mock.invocationCallOrder[0]);
        });

        it('calls storeFetchedMetadata and markMetadataReady before column updates', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());
            await bootstrap.refresh();

            const storeCallOrder = storeFetchedMetadataMock.mock.invocationCallOrder[0];
            const markCallOrder = markMetadataReadyMock.mock.invocationCallOrder[0];
            const setNumericCallOrder = setNumericColsMock.mock.invocationCallOrder[0];
            const sanitizeCallOrder = sanitizeSelectedColumnsMock.mock.invocationCallOrder[0];

            expect(storeCallOrder).toBeLessThan(setNumericCallOrder);
            expect(markCallOrder).toBeLessThan(sanitizeCallOrder);
        });

        it('calls setNumericCols and sanitizeSelectedColumns before rebuildTimeseriesColumns', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());
            await bootstrap.refresh();

            const setNumericCallOrder = setNumericColsMock.mock.invocationCallOrder[0];
            const sanitizeCallOrder = sanitizeSelectedColumnsMock.mock.invocationCallOrder[0];
            const rebuildCallOrder = rebuildTimeseriesColumnsMock.mock.invocationCallOrder[0];

            expect(setNumericCallOrder).toBeLessThan(rebuildCallOrder);
            expect(sanitizeCallOrder).toBeLessThan(rebuildCallOrder);
        });

        it('calls rebuildTimeseriesColumns and refreshVisibleData last in the refresh sequence', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());
            await bootstrap.refresh();

            const rebuildCallOrder = rebuildTimeseriesColumnsMock.mock.invocationCallOrder[0];
            const refreshCallOrder = refreshVisibleDataMock.mock.invocationCallOrder[0];

            expect(rebuildCallOrder).toBeLessThan(refreshCallOrder);
        });

        it('refresh does not call initializeDatasetUi (only rebuildTimeseriesColumns for UI update)', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());
            await bootstrap.refresh();

            expect(initializeDatasetUiMock).not.toHaveBeenCalled();
        });

        it('refresh calls clearLoadedPageModules, fetchMetadata, storeFetchedMetadata, markMetadataReady, setNumericCols, sanitizeSelectedColumns, rebuildTimeseriesColumns, refreshVisibleData in that order', async () => {
            const bootstrap = createDatasetBootstrap(defaultDeps());
            await bootstrap.refresh();

            const clearOrder = clearLoadedPageModulesMock.mock.invocationCallOrder[0];
            const fetchOrder = fetchMetadataMock.mock.invocationCallOrder[0];
            const storeOrder = storeFetchedMetadataMock.mock.invocationCallOrder[0];
            const markOrder = markMetadataReadyMock.mock.invocationCallOrder[0];
            const setNumericOrder = setNumericColsMock.mock.invocationCallOrder[0];
            const sanitizeOrder = sanitizeSelectedColumnsMock.mock.invocationCallOrder[0];
            const rebuildOrder = rebuildTimeseriesColumnsMock.mock.invocationCallOrder[0];
            const refreshOrder = refreshVisibleDataMock.mock.invocationCallOrder[0];

            expect(clearOrder).toBeLessThan(fetchOrder);
            expect(fetchOrder).toBeLessThan(storeOrder);
            expect(storeOrder).toBeLessThan(markOrder);
            expect(markOrder).toBeLessThan(setNumericOrder);
            expect(setNumericOrder).toBeLessThan(sanitizeOrder);
            expect(sanitizeOrder).toBeLessThan(rebuildOrder);
            expect(rebuildOrder).toBeLessThan(refreshOrder);
        });
    });
});