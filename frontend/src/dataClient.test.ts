/**
 * Characterization tests for the services/api public surface.
 *
 * Validates the data transport layer: fetch helpers, metadata validation,
 * scatter response guards, and URL construction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const arrowMockState = vi.hoisted(() => ({
    fields: [
        { name: 'event_time', type: 'Int64' },
        { name: 'value', type: 'Float64' },
    ] as Array<{ name: string; type: string }>,
    rows: {
        event_time: [1704067200000, 1704153600000, 1704240000000],
        value: [1.0, 2.0, 3.0],
    } as Record<string, unknown[]>,
}));

// We need to mock fetch and the arrow import before importing the module
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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
            schema: { fields: arrowMockState.fields },
            numRows: Math.max(0, ...Object.values(arrowMockState.rows).map((values) => values.length)),
            getChild(name: string) {
                const values = arrowMockState.rows[name];
                if (values) return { get: (i: number) => values[i] };
                return null;
            },
        };
    },
}));

describe('API client fetch helpers', () => {
    beforeEach(async () => {
        mockFetch.mockReset();
        // Every data-analysis route now executes the explicit dataset baseline.
        // Individual tests may replace this plan with a transformed one.
        const { cleaningPlanStore } = await import('./cleaning/store.js');
        cleaningPlanStore.resetForDataset({
            sourceVersionId: 'source-baseline', datasetRevision: 1,
            datasetFingerprint: 'dataset-baseline', schemaFingerprint: 'schema-baseline', timeColumn: 'event_time',
        });
        arrowMockState.fields = [
            { name: 'event_time', type: 'Int64' },
            { name: 'value', type: 'Float64' },
        ];
        arrowMockState.rows = {
            event_time: [1704067200000, 1704153600000, 1704240000000],
            value: [1.0, 2.0, 3.0],
        };
    });

    afterEach(async () => {
        const { cleaningPlanStore } = await import('./cleaning/store.js');
        cleaningPlanStore.clear();
        vi.restoreAllMocks();
    });

    describe('fetchMetadata', () => {
        it('fetches and validates metadata response', async () => {
            const { fetchMetadata } = await import('./services/api/index.js');

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
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/metadata', { cache: 'no-store' });
        });

        it('throws on non-object metadata', async () => {
            const { fetchMetadata } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(null),
            });

            await expect(fetchMetadata()).rejects.toThrow(
                'does not match the contracted JSON container shape',
            );
        });

        it('throws on missing total_rows', async () => {
            const { fetchMetadata } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ columns: [], numeric_columns: [] }),
            });

            await expect(fetchMetadata()).rejects.toThrow('total_rows');
        });

        it('throws on HTTP error', async () => {
            const { fetchMetadata } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Internal Server Error'),
            });

            await expect(fetchMetadata()).rejects.toThrow('500');
        });
    });

    describe('fetchData', () => {
        beforeEach(async () => {
            const { cleaningPlanStore } = await import('./cleaning/store.js');
            cleaningPlanStore.resetForDataset({
                sourceVersionId: 'source-baseline',
                datasetRevision: 1,
                datasetFingerprint: 'dataset-baseline',
                schemaFingerprint: 'schema-baseline',
                timeColumn: 'event_time',
            });
        });

        afterEach(async () => {
            const { cleaningPlanStore } = await import('./cleaning/store.js');
            cleaningPlanStore.clear();
        });

        it('refuses to query before the dataset baseline plan exists', async () => {
            const { fetchData } = await import('./services/api/index.js');
            const { cleaningPlanStore } = await import('./cleaning/store.js');
            cleaningPlanStore.clear();

            await expect(fetchData('0', '1000', 500, 'value'))
                .rejects.toThrow('requires an active cleaning plan');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('rejects stale data responses after the dataset request scope is invalidated', async () => {
            const { fetchData } = await import('./services/api/index.js');
            const { invalidateDatasetRequestScope, __resetApiRequestStateForTests } = await import('./services/api/http.js');

            __resetApiRequestStateForTests();

            let resolveBuffer!: (value: ArrayBuffer) => void;
            const bufferPromise = new Promise<ArrayBuffer>((resolve) => {
                resolveBuffer = resolve;
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '3'],
                    ['x-edatime-target-points', '1000'],
                    ['x-edatime-time-column', 'event_time'],
                ]),
                arrayBuffer: () => bufferPromise,
            });

            const pending = fetchData('1704067200000', '1706745600000', 1000, 'value');

            invalidateDatasetRequestScope();

            resolveBuffer(new ArrayBuffer(100));

            await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        });

        it('reads the original timestamp column from the Arrow schema', async () => {
            const { fetchData } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '3'],
                    ['x-edatime-target-points', '1000'],
                    ['x-edatime-time-column', 'event_time'],
                    ['x-edatime-source-version', 'source-0'],
                    ['x-edatime-source-revision', '7'],
                    ['x-edatime-schema-fingerprint', 'fnv1a-deadbeef'],
                    ['x-edatime-plan-hash', 'plan-123'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('1704067200000', '1706745600000', 1000, 'value');

            expect(Array.from(result.ts)).toEqual([1704067200000, 1704153600000, 1704240000000]);
            expect(Array.from(result.values.value)).toEqual([1, 2, 3]);
            expect(result._meta.executionIdentity).toEqual({
                sourceVersionId: 'source-0',
                sourceRevision: 7,
                schemaFingerprint: 'fnv1a-deadbeef',
                planHash: 'plan-123',
            });
        });

        it('always sends a plan-aware POST request', async () => {
            const { fetchData } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '3'],
                    ['x-edatime-target-points', '1000'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            await fetchData('1704067200000', '1706745600000', 1000, 'value');

            expect(mockFetch).toHaveBeenCalledWith('/api/v1/data', expect.objectContaining({ method: 'POST' }));
            expect(JSON.parse(String(mockFetch.mock.calls[0][1]?.body))).toMatchObject({
                start: '1704067200000',
                end: '1706745600000',
                width: 1000,
                columns: 'value',
                cleaning_plan: {
                    expectedSourceVersionId: 'source-baseline',
                    expectedDatasetRevision: 1,
                    plan: { stages: [] },
                },
            });
        });

        it('uses the plan-aware POST contract when an executable cleaning plan is active', async () => {
            const { fetchData } = await import('./services/api/index.js');
            const { cleaningPlanStore } = await import('./cleaning/store.js');
            cleaningPlanStore.resetForDataset({
                sourceVersionId: 'source-7',
                datasetRevision: 7,
                datasetFingerprint: 'dataset-7',
                schemaFingerprint: 'schema-7',
                timeColumn: 'event_time',
            });
            cleaningPlanStore.addStage({
                kind: 'columnRange',
                executionClass: 'polarsExpression',
                scope: 'row',
                enabled: true,
                sourcePage: 'timeseries',
                label: 'Keep useful values',
                column: 'value',
                from: 1,
                to: 2,
                mode: 'keepInside',
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '3'],
                    ['x-edatime-target-points', '1000'],
                    ['x-edatime-time-column', 'event_time'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            try {
                await fetchData('1704067200000', '1706745600000', 1000, 'value');

                expect(mockFetch).toHaveBeenCalledWith('/api/v1/data', expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                }));
                const body = JSON.parse(String(mockFetch.mock.calls[0][1]?.body));
                expect(body).toMatchObject({
                    start: '1704067200000',
                    end: '1706745600000',
                    width: 1000,
                    columns: 'value',
                    cleaning_plan: {
                        expectedSourceVersionId: 'source-7',
                        expectedDatasetRevision: 7,
                        plan: { sourceVersionId: 'source-7', stages: [{ kind: 'columnRange' }] },
                    },
                });
            } finally {
                cleaningPlanStore.clear();
            }
        });

        it('includes color_column when specified', async () => {
            const { fetchData } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            await fetchData('0', '1000', 500, 'value', 'temperature');

            const body = JSON.parse(String(mockFetch.mock.calls[0][1]?.body));
            expect(body.color_column).toBe('temperature');
        });

        it('includes lookaround_ms when specified', async () => {
            const { fetchData } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            await fetchData('0', '1000', 500, 'value', null, 120_000);

            const body = JSON.parse(String(mockFetch.mock.calls[0][1]?.body));
            expect(body.lookaround_ms).toBe(120_000);
        });

        it('populates data.color_column and data.color when a color column is present in the Arrow table', async () => {
            const { fetchData } = await import('./services/api/index.js');

            arrowMockState.fields = [
                { name: 'event_time', type: 'Int64' },
                { name: 'value', type: 'Float64' },
                { name: 'temperature', type: 'Float64' },
            ];
            arrowMockState.rows = {
                event_time: [1704067200000, 1704153600000],
                value: [1.0, 2.0],
                temperature: [20.5, 21.0],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '2'],
                    ['x-edatime-target-points', '500'],
                    ['x-edatime-time-column', 'event_time'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('1704067200000', '1704153600000', 500, 'value', 'temperature');

            expect(result.color_column).toBe('temperature');
            expect(result.color).toEqual([20.5, 21.0]);
        });

        it('sets downsampleKnown to false when x-edatime-downsampled header is absent', async () => {
            const { fetchData } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    // no x-edatime-downsampled header
                    ['x-edatime-returned-rows', '2'],
                    ['x-edatime-target-points', '500'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('0', '1000', 500, 'value');

            expect(result._meta.downsampleKnown).toBe(false);
        });

        it('reads x-edatime-returned-rows and x-edatime-target-points into _meta', async () => {
            const { fetchData } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '1'],
                    ['x-edatime-returned-rows', '512'],
                    ['x-edatime-target-points', '1024'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('0', '1000', 500, 'value');

            expect(result._meta.downsampleKnown).toBe(true);
            expect(result._meta.downsampled).toBe(true);
            expect(result._meta.returnedRows).toBe(512);
            expect(result._meta.targetPoints).toBe(1024);
        });

        it('preserves bounded overview provenance from response headers', async () => {
            const { fetchData } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '1'],
                    ['x-edatime-returned-rows', '512'],
                    ['x-edatime-target-points', '1024'],
                    ['x-edatime-sampling-algorithm', 'envelope-lttb-v1'],
                    ['x-edatime-approximate', '1'],
                    ['x-edatime-filtered-rows', '1000000'],
                    ['x-edatime-candidate-rows', '4096'],
                    ['x-edatime-dropped-rows', '999488'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('0', '1000', 500, 'value');

            expect(result._meta).toMatchObject({
                samplingAlgorithm: 'envelope-lttb-v1',
                approximate: true,
                filteredRows: 1_000_000,
                candidateRows: 4_096,
                droppedRows: 999_488,
            });
        });

        it('interprets timestamps below 1e11 as seconds (epoch seconds → ms)', async () => {
            const { fetchData } = await import('./services/api/index.js');

            arrowMockState.fields = [
                { name: 'ts', type: 'Int64' },
                { name: 'value', type: 'Float64' },
            ];
            // 1704067200 = 2024-01-01 00:00:00 UTC — epoch seconds
            arrowMockState.rows = {
                ts: [1704067200, 1704153600],
                value: [1.0, 2.0],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '2'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('0', '2000000000', 500, 'value');

            // 1704067200 × 1000 = 1704067200000 ms
            expect(result.ts[0]).toBe(1704067200000);
            expect(result.ts[1]).toBe(1704153600000);
        });

        it('interprets timestamps between 1e11 and 1e14 as milliseconds (passthrough)', async () => {
            const { fetchData } = await import('./services/api/index.js');

            arrowMockState.fields = [
                { name: 'ts', type: 'Int64' },
                { name: 'value', type: 'Float64' },
            ];
            // 1704067200000 — already in ms
            arrowMockState.rows = {
                ts: [1704067200000, 1704153600000],
                value: [1.0, 2.0],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '2'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('0', '2000000000000', 500, 'value');

            expect(result.ts[0]).toBe(1704067200000);
            expect(result.ts[1]).toBe(1704153600000);
        });

        it('interprets timestamps between 1e14 and 1e17 as microseconds (÷ 1000)', async () => {
            const { fetchData } = await import('./services/api/index.js');

            arrowMockState.fields = [
                { name: 'ts', type: 'Int64' },
                { name: 'value', type: 'Float64' },
            ];
            // 1704067200000000 µs → 1704067200000 ms
            arrowMockState.rows = {
                ts: [1704067200000000, 1704153600000000],
                value: [1.0, 2.0],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '2'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('0', '2000000000000000', 500, 'value');

            expect(result.ts[0]).toBe(1704067200000);
            expect(result.ts[1]).toBe(1704153600000);
        });

        it('interprets timestamps ≥ 1e17 as nanoseconds (÷ 1e6)', async () => {
            const { fetchData } = await import('./services/api/index.js');

            arrowMockState.fields = [
                { name: 'ts', type: 'Int64' },
                { name: 'value', type: 'Float64' },
            ];
            // 1704067200000000000 ns → 1704067200000 ms
            arrowMockState.rows = {
                ts: [1704067200000000000, 1704153600000000000],
                value: [1.0, 2.0],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-downsampled', '0'],
                    ['x-edatime-returned-rows', '2'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
            });

            const result = await fetchData('0', '2000000000000000000', 500, 'value');

            expect(result.ts[0]).toBe(1704067200000);
            expect(result.ts[1]).toBe(1704153600000);
        });
    });

    describe('fetchScatterCorrelations', () => {
        it('validates the correlations response shape', async () => {
            const { fetchScatterCorrelations } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['x-edatime-source-version', 'source-0'],
                    ['x-edatime-source-revision', '7'],
                    ['x-edatime-schema-fingerprint', 'fnv1a-deadbeef'],
                    ['x-edatime-plan-hash', 'none'],
                ]),
                json: () => Promise.resolve({
                    mode: 'kendall_diff',
                    base_column: 'col_a',
                    threshold: 0.7,
                    numeric_columns: ['col_a', 'col_b'],
                    correlations: [
                        { column: 'col_b', count: 12, value: 0.95 },
                    ],
                    suggestions: [{ x: 'col_a', y: 'col_b', correlation: 0.95 }],
                }),
            });

            const result = await fetchScatterCorrelations(null, 0.7, 'kendall_diff');
            expect(result.correlations).toHaveLength(1);
            expect(result.mode).toBe('kendall_diff');
            expect(result.correlations[0].value).toBe(0.95);
            expect(result.executionIdentity).toEqual({
                sourceVersionId: 'source-0',
                sourceRevision: 7,
                schemaFingerprint: 'fnv1a-deadbeef',
                planHash: 'none',
            });
        });

        it('passes the configured threshold and mode in the plan-aware body', async () => {
            const { fetchScatterCorrelations } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    mode: 'pearson_diff',
                    base_column: 'col_a',
                    threshold: 0.75,
                    numeric_columns: ['col_a'],
                    correlations: [],
                    suggestions: [],
                }),
            });

            await fetchScatterCorrelations('col_a', 0.75, 'pearson_diff');
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/scatter/correlations', expect.objectContaining({ method: 'POST' }));
            expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toMatchObject({
                base: 'col_a', threshold: 0.75, mode: 'pearson_diff',
            });
        });

        it('includes the active cleaning plan in correlation requests', async () => {
            const { fetchScatterCorrelations } = await import('./services/api/index.js');
            const { cleaningPlanStore } = await import('./cleaning/store.js');
            cleaningPlanStore.resetForDataset({
                sourceVersionId: 'source-9',
                datasetRevision: 9,
                datasetFingerprint: 'dataset-9',
                schemaFingerprint: 'schema-9',
                timeColumn: 'ts',
            });
            cleaningPlanStore.addStage({
                kind: 'columnRange',
                executionClass: 'polarsExpression',
                scope: 'row',
                enabled: true,
                sourcePage: 'scatter',
                label: 'Keep range',
                column: 'col_a',
                from: 1,
                to: 5,
                mode: 'keepInside',
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    mode: 'pearson_raw',
                    base_column: 'col_a',
                    threshold: 0.5,
                    numeric_columns: ['col_a', 'col_b'],
                    correlations: [],
                    suggestions: [],
                }),
            });

            try {
                await fetchScatterCorrelations('col_a', 0.5, 'pearson_raw');

                const request = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
                const envelope = JSON.parse(String(request?.body ?? '{}')).cleaning_plan;
                expect(envelope).toMatchObject({
                    expectedSourceVersionId: 'source-9',
                    expectedDatasetRevision: 9,
                    plan: { stages: [{ kind: 'columnRange' }] },
                });
                expect(request).toMatchObject({ method: 'POST' });
            } finally {
                cleaningPlanStore.clear();
            }
        });

        it('throws if correlations array is missing', async () => {
            const { fetchScatterCorrelations } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ columns: [] }),
            });

            await expect(fetchScatterCorrelations(null)).rejects.toThrow('correlations');
        });
    });

    describe('fetchScatterPoints', () => {
        it('sends POST with correct body', async () => {
            const { fetchScatterPoints } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([['Content-Type', 'application/json']]),
                json: () => Promise.resolve({
                    x: 'col_a',
                    y: 'col_b',
                    color: null,
                    total_points: 1,
                    returned_points: 1,
                    points: [[1, 2]],
                    color_values: null,
                    color_labels: null,
                    color_min: null,
                    color_max: null,
                }),
            });

            await fetchScatterPoints('col_a', 'col_b', 5000);

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/scatter/points'),
                expect.objectContaining({ method: 'POST' }),
            );
        });

        it('does not lower adaptive lines into scatter transport fields', async () => {
            const { fetchScatterPoints } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([['Content-Type', 'application/json']]),
                json: () => Promise.resolve({
                    x: 'col_a',
                    y: 'col_b',
                    color: null,
                    total_points: 1,
                    returned_points: 1,
                    points: [[1, 2]],
                    color_values: null,
                    color_labels: null,
                    color_min: null,
                    color_max: null,
                }),
            });

            await fetchScatterPoints('col_a', 'col_b', 5000, null, {
                lineFilters: [
                    { id: 'adaptive-1', column: 'col_a', x1: 1, y1: 2, x2: 3, y2: 4, keepAbove: true } as any,
                ],
            });

            const request = mockFetch.mock.calls.at(-1)?.[1] as RequestInit | undefined;
            const payload = JSON.parse(String(request?.body ?? '{}'));
            expect(payload.line_filters).toBeUndefined();
            expect(payload.cleaning_plan).toBeDefined();
        });

        it('reads scatter Arrow responses using the declared axis columns', async () => {
            const { fetchScatterPoints } = await import('./services/api/index.js');

            arrowMockState.fields = [
                { name: 'LULL', type: 'Float64' },
                { name: 'HULL', type: 'Float64' },
                { name: 'color_value', type: 'Float64' },
            ];
            arrowMockState.rows = {
                LULL: [1.5, 2.5],
                HULL: [10.0, 20.0],
                color_value: [0.1, 0.9],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['Content-Type', 'application/vnd.apache.arrow.stream'],
                    ['x-edatime-scatter-x', 'LULL'],
                    ['x-edatime-scatter-y', 'HULL'],
                    ['x-edatime-scatter-total', '70000'],
                    ['x-edatime-scatter-returned', '2'],
                    ['x-edatime-color-min', '0.1'],
                    ['x-edatime-color-max', '0.9'],
                    ['x-edatime-source-version', 'source-0'],
                    ['x-edatime-source-revision', '7'],
                    ['x-edatime-schema-fingerprint', 'fnv1a-deadbeef'],
                    ['x-edatime-plan-hash', 'none'],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(128)),
            });

            const result = await fetchScatterPoints('LULL', 'HULL', 5000, 'MUFL');

            expect(result.points).toEqual([[1.5, 10.0], [2.5, 20.0]]);
            expect(result.total_points).toBe(70000);
            expect(result.color_values).toEqual([0.1, 0.9]);
            expect(result.executionIdentity).toEqual({
                sourceVersionId: 'source-0',
                sourceRevision: 7,
                schemaFingerprint: 'fnv1a-deadbeef',
                planHash: 'none',
            });
        });
    });

    describe('fetchScatterMatrix', () => {
        it('sends one POST with the matrix batch payload', async () => {
            const { fetchScatterMatrix } = await import('./services/api/index.js');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['Content-Type', 'application/vnd.apache.arrow.stream'],
                    ['x-edatime-matrix-cells', btoa(JSON.stringify([]))],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
            });

            await fetchScatterMatrix(
                [
                    { x: 'HUFL', y: 'HULL' },
                    { x: 'OT', y: 'MUFL' },
                ],
                'group',
                {
                    start: 10,
                    end: 20,
                    filters: [{ column: 'HUFL', from: 1, to: 9 }],
                    lineFilters: [{ column: 'HUFL', x1: 1, y1: 2, x2: 3, y2: 4, keepAbove: true }],
                },
                4096,
            );

            const request = mockFetch.mock.calls.at(-1)?.[1] as RequestInit | undefined;
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/scatter/matrix'),
                expect.objectContaining({ method: 'POST' }),
            );
            expect(JSON.parse(String(request?.body ?? '{}'))).toMatchObject({
                pairs: [
                    { x: 'HUFL', y: 'HULL' },
                    { x: 'OT', y: 'MUFL' },
                ],
                color: 'group',
                start: 10,
                end: 20,
                limit: 4096,
                cleaning_plan: { expectedSourceVersionId: 'source-baseline' },
            });
        });

        it('decodes Arrow rows into per-cell datasets using matrix metadata headers', async () => {
            const { fetchScatterMatrix } = await import('./services/api/index.js');

            arrowMockState.fields = [
                { name: 'cell_id', type: 'Utf8' },
                { name: 'x', type: 'Float64' },
                { name: 'y', type: 'Float64' },
                { name: 'color_value', type: 'Float64' },
                { name: 'color_label', type: 'Utf8' },
            ];
            arrowMockState.rows = {
                cell_id: ['HUFL|HULL', 'HUFL|HULL', 'OT|MUFL'],
                x: [1.5, 2.5, 9.0],
                y: [10.0, 20.0, 12.0],
                color_value: [0.1, 0.9, Number.NaN],
                color_label: [null, null, 'cluster-a'],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([
                    ['Content-Type', 'application/vnd.apache.arrow.stream'],
                    ['x-edatime-matrix-cells', btoa(JSON.stringify([
                        {
                            cell_id: 'HUFL|HULL',
                            x: 'HUFL',
                            y: 'HULL',
                            total_points: 70000,
                            returned_points: 2,
                            color_min: 0.1,
                            color_max: 0.9,
                        },
                        {
                            cell_id: 'OT|MUFL',
                            x: 'OT',
                            y: 'MUFL',
                            total_points: 10,
                            returned_points: 1,
                            color_min: null,
                            color_max: null,
                        },
                    ]))],
                ]),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(128)),
            });

            const result = await fetchScatterMatrix(
                [
                    { x: 'HUFL', y: 'HULL' },
                    { x: 'OT', y: 'MUFL' },
                ],
                'group',
                null,
                5000,
            );

            expect(Array.from(result.cells.keys())).toEqual(['HUFL|HULL', 'OT|MUFL']);
            expect(result.cells.get('HUFL|HULL')).toEqual({
                totalPoints: 70000,
                points: [[1.5, 10.0], [2.5, 20.0]],
                colorValues: [0.1, 0.9],
                colorLabels: null,
            });
            expect(result.cells.get('OT|MUFL')).toEqual({
                totalPoints: 10,
                points: [[9.0, 12.0]],
                colorValues: null,
                colorLabels: ['cluster-a'],
            });
        });
    });
});
