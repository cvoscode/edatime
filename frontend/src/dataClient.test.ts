/**
 * Tests for frontend/src/dataClient.ts
 *
 * Validates the data transport layer: fetch helpers, metadata validation,
 * scatter response guards, and URL construction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock fetch and the arrow import before importing the module
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the debug module
vi.mock('./debug.js', () => ({
    DEBUG: false,
    dbg: () => { },
}));

// Mock apache-arrow (it's aliased to /dev/null in vitest config)
vi.mock('apache-arrow', () => ({
    tableFromIPC: (buffer: ArrayBuffer) => {
        // Return a mock table with controllable columns
        return {
            schema: { fields: [{ name: 'ts', type: 'Int64' }, { name: 'value', type: 'Float64' }] },
            numRows: 3,
            getChild(name: string) {
                if (name === 'ts') return { get: (i: number) => [1704067200000, 1704153600000, 1704240000000][i] };
                if (name === 'value') return { get: (i: number) => [1.0, 2.0, 3.0][i] };
                return null;
            },
        };
    },
}));

describe('dataClient fetch helpers', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('fetchMetadata', () => {
        it('fetches and validates metadata response', async () => {
            const { fetchMetadata } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    total_rows: 720,
                    columns: [
                        { name: 'ts', dtype: 'Datetime[ns]' },
                        { name: 'value', dtype: 'Float64' },
                    ],
                    numeric_columns: ['value'],
                    time_range: { start_ms: 1704067200000, end_ms: 1706745600000 },
                }),
            });

            const metadata = await fetchMetadata();
            expect(metadata.total_rows).toBe(720);
            expect(metadata.columns).toHaveLength(2);
            expect(metadata.numeric_columns).toContain('value');
            expect(mockFetch).toHaveBeenCalledWith('/api/metadata', undefined);
        });

        it('throws on non-object metadata', async () => {
            const { fetchMetadata } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(null),
            });

            await expect(fetchMetadata()).rejects.toThrow('not an object');
        });

        it('throws on missing total_rows', async () => {
            const { fetchMetadata } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ columns: [], numeric_columns: [] }),
            });

            await expect(fetchMetadata()).rejects.toThrow('total_rows');
        });

        it('throws on HTTP error', async () => {
            const { fetchMetadata } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Internal Server Error'),
            });

            await expect(fetchMetadata()).rejects.toThrow('500');
        });
    });

    describe('fetchData', () => {
        it('constructs correct URL with parameters', async () => {
            const { fetchData } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '3'],
                    ['x-edatime-target-points', '1000'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('1704067200000', '1706745600000', 1000, 'value');

            const calledUrl = mockFetch.mock.calls[0][0];
            expect(calledUrl).toContain('/api/data?');
            expect(calledUrl).toContain('start=1704067200000');
            expect(calledUrl).toContain('end=1706745600000');
            expect(calledUrl).toContain('width=1000');
            expect(calledUrl).toContain('columns=value');
        });

        it('includes color_column when specified', async () => {
            const { fetchData } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            await fetchData('0', '1000', 500, 'value', 'temperature');

            const calledUrl = mockFetch.mock.calls[0][0];
            expect(calledUrl).toContain('color_column=temperature');
        });
    });

    describe('fetchScatterCorrelations', () => {
        it('validates the correlations response shape', async () => {
            const { fetchScatterCorrelations } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    correlations: [
                        { x: 'col_a', y: 'col_b', pearson: 0.95, spearman: 0.92 },
                    ],
                    columns: ['col_a', 'col_b'],
                }),
            });

            const result = await fetchScatterCorrelations();
            expect(result.correlations).toHaveLength(1);
            expect(result.correlations[0].pearson).toBe(0.95);
        });

        it('throws if correlations array is missing', async () => {
            const { fetchScatterCorrelations } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ columns: [] }),
            });

            await expect(fetchScatterCorrelations()).rejects.toThrow('correlations');
        });
    });

    describe('fetchScatterPoints', () => {
        it('sends POST with correct body', async () => {
            const { fetchScatterPoints } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    x: 'col_a',
                    y: 'col_b',
                    points: [{ x: 1, y: 2 }],
                }),
            });

            const opts = { x: 'col_a', y: 'col_b', limit: 5000 } as any;
            await fetchScatterPoints(opts);

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/scatter/points'),
                expect.objectContaining({ method: 'POST' }),
            );
        });
    });

    describe('fetchDistributions', () => {
        it('validates distribution response', async () => {
            const { fetchDistributions } = await import('./dataClient');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    columns: [
                        { name: 'value', histogram: { bins: [1, 2], counts: [10, 20] } },
                    ],
                }),
            });

            const ctx = { columns: ['value'] } as any;
            const result = await fetchDistributions(ctx);
            expect(result.columns).toHaveLength(1);
        });
    });
});
