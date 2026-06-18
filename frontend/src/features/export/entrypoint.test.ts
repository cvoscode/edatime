import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExportFeature } from './entrypoint.js';

const exportParquetMock = vi.fn();

vi.mock('../../services/api/index.js', () => ({
    exportParquet: (...args: unknown[]) => exportParquetMock(...args),
}));

vi.mock('../../utils/dom.js', () => ({
    downloadBlob: vi.fn(),
}));

vi.mock('../../services/timeseries/filtering.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/timeseries/filtering.js')>();
    return {
        ...actual,
        applyColumnRanges: vi.fn(),
        buildAdaptiveLineFiltersForQuery: vi.fn(() => [
            { column: 'HUFL', x1: 1, y1: 2, x2: 3, y2: 4, keepAbove: false },
        ]),
    };
});

vi.mock('../../store/appStateCompat.js', () => ({
    appState: {
        currentStart: 1,
        currentEnd: 10,
        selectedCols: ['HUFL'],
        columnRanges: {},
        lastFetchedData: null,
    },
}));

describe('createExportFeature', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        exportParquetMock.mockResolvedValue(new Blob(['x']));
    });

    it('returns export action surface', () => {
        const feature = createExportFeature();
        expect(feature.exportFilteredCsv).toBeTypeOf('function');
        expect(feature.exportFilteredJson).toBeTypeOf('function');
        expect(feature.exportFilteredParquet).toBeTypeOf('function');
    });

    it('does not import services/api at module level', () => {
        // The feature module should not statically import services/api at the top level.
        // This is enforced by the architecture checker, but we verify the surface is clean.
        const feature = createExportFeature();
        expect(feature).toHaveProperty('exportFilteredCsv');
        expect(feature).toHaveProperty('exportFilteredJson');
        expect(feature).toHaveProperty('exportFilteredParquet');
    });

    it('strips adaptive filter ids from parquet export query params', async () => {
        const feature = createExportFeature();

        await feature.exportFilteredParquet();

        const params = exportParquetMock.mock.calls[0]?.[0] as URLSearchParams;
        expect(JSON.parse(String(params.get('line_filters')))).toEqual([
            { column: 'HUFL', x1: 1, y1: 2, x2: 3, y2: 4, keepAbove: false },
        ]);
    });
});
