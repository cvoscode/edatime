import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetApiRequestStateForTests, invalidateDatasetRequestScope } from './http.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import {
    fetchAnomalies,
    fetchCausalGraph,
    fetchCorrelationMatrix,
    fetchFft,
    fetchRollingBands,
    fetchSpectralFilter,
    fetchSpectrogram,
} from './analytics.js';

function jsonResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(body),
    } as unknown as Response;
}

interface DeferredResponse {
    promise: Promise<Response>;
    resolve: (response: Response) => void;
    reject: (error: unknown) => void;
}

function createDeferredResponse(): DeferredResponse {
    let resolve!: (response: Response) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Response>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function jsonErrorResponse(status: number, body: unknown): Response {
    return {
        ok: false,
        status,
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    } as unknown as Response;
}

describe('analytics api helpers', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        __resetApiRequestStateForTests();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
        cleaningPlanStore.resetForDataset({
            sourceVersionId: 'source-baseline', datasetRevision: 1,
            datasetFingerprint: 'dataset-baseline', schemaFingerprint: 'schema-baseline', timeColumn: 'ts',
        });
    });

    afterEach(() => {
        cleaningPlanStore.clear();
        vi.restoreAllMocks();
        __resetApiRequestStateForTests();
    });

    it('fetchRollingBands encodes the current rolling route contract', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ bands: [] }));

        await fetchRollingBands(
            '2025-01-01T00:00:00.000Z',
            '2025-01-02T00:00:00.000Z',
            'value,temp',
            25,
        );

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/analytics/rolling');
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
            start: '2025-01-01T00:00:00.000Z', end: '2025-01-02T00:00:00.000Z', columns: 'value,temp', window: 25,
        });
    });

    it('fetchAnomalies preserves threshold omission when none is provided', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ method: 'zscore', threshold: 3, regions: [] }));

        await fetchAnomalies(
            '2025-01-01T00:00:00.000Z',
            '2025-01-02T00:00:00.000Z',
            'value',
            'mad',
        );

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/analytics/anomalies');
        const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(body.method).toBe('mad');
        expect(body.threshold).toBeUndefined();
    });

    it('adds the active cleaning plan to rolling, anomaly, spectral-filter, and correlation requests', async () => {
        cleaningPlanStore.resetForDataset({
            sourceVersionId: 'source-3',
            datasetRevision: 3,
            datasetFingerprint: 'dataset-3',
            schemaFingerprint: 'schema-3',
            timeColumn: 'ts',
        });
        cleaningPlanStore.addStage({
            kind: 'columnRange',
            executionClass: 'polarsExpression',
            scope: 'row',
            enabled: true,
            sourcePage: 'timeseries',
            label: 'range',
            column: 'value',
            from: 0,
            to: 10,
            mode: 'keepInside',
        });
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ bands: [] }))
            .mockResolvedValueOnce(jsonResponse({ method: 'zscore', threshold: 3, regions: [] }))
            .mockResolvedValueOnce(jsonResponse({ column: 'value', ts: [], values: [], filter_type: 'lowpass' }))
            .mockResolvedValueOnce(jsonResponse({ columns: [] }));

        await fetchRollingBands('start', 'end', 'value');
        await fetchAnomalies('start', 'end', 'value');
        await fetchSpectralFilter(new URLSearchParams({ column: 'value', filter_type: 'lowpass' }));
        await fetchCorrelationMatrix();

        for (const [index, call] of fetchMock.mock.calls.entries()) {
            const request = call[1] as RequestInit | undefined;
            const envelope = JSON.parse(String(request?.body ?? '{}')).cleaning_plan;
            expect(envelope).toMatchObject({
                expectedSourceVersionId: 'source-3',
                expectedDatasetRevision: 3,
                plan: { stages: [{ kind: 'columnRange' }] },
            });
        }
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
        expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
        expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'POST' });
        expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'POST' });
    });

    it('propagates structured errors from analytics routes', async () => {
        fetchMock.mockResolvedValueOnce(jsonErrorResponse(422, {
            message: 'invalid analysis range',
            code: 'invalid_range',
            correlation_id: 'analytics-123',
        }));

        await expect(fetchRollingBands('start', 'end', 'value')).rejects.toMatchObject({
            status: 422,
            code: 'invalid_range',
            correlationId: 'analytics-123',
        });
    });

    it('forwards request option signals to analytics requests', async () => {
        const controller = new AbortController();
        fetchMock.mockResolvedValueOnce(jsonResponse({ bands: [] }));

        await fetchRollingBands('start', 'end', 'value', 50, { signal: controller.signal });

        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
    });

    it('allows unscoped analytics POST requests to survive dataset invalidation', async () => {
        const deferred = createDeferredResponse();
        fetchMock.mockReturnValueOnce(deferred.promise);

        const request = fetchRollingBands('start', 'end', 'value', 50, { datasetScoped: false });

        invalidateDatasetRequestScope();

        deferred.resolve(jsonResponse({ bands: [] }));
        await expect(request).resolves.toEqual({ bands: [] });
    });

    it('fetchFft forwards max_points in its plan-aware body', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ sample_count: 0, results: [] }));

        await fetchFft(
            '2025-01-01T00:00:00.000Z',
            '2025-01-02T00:00:00.000Z',
            'value',
            4096,
        );

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/analytics/fft');
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).max_points).toBe(4096);
    });

    it('fetchSpectrogram includes hop size and valid scale options only', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({
            sample_count: 0,
            result: { column: 'value', times_ms: [], frequencies: [], magnitudes: [] },
        }));

        await fetchSpectrogram(
            '2025-01-01T00:00:00.000Z',
            '2025-01-02T00:00:00.000Z',
            'value',
            320,
            48,
            4096,
            undefined,
            { normalize: 'zscore', clip: 'percentile', clipParam: Number.NaN },
        );

        const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(body).toMatchObject({ window_size: 320, hop_size: 48, max_points: 4096, normalize: 'zscore', clip: 'percentile' });
        expect(body.clip_param).toBeUndefined();
    });

    it('fetchSpectrogram preserves finite clip parameters including zero', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({
            sample_count: 0,
            result: { column: 'value', times_ms: [], frequencies: [], magnitudes: [] },
        }));

        await fetchSpectrogram(
            '2025-01-01T00:00:00.000Z',
            '2025-01-02T00:00:00.000Z',
            'value',
            320,
            undefined,
            4096,
            undefined,
            { clip: 'percentile', clipParam: 0 },
        );

        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).clip_param).toBe(0);
    });

    it('fetchCausalGraph posts the current causal payload shape', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({
            columns: ['a', 'b'],
            tau_max: 5,
            links: [],
            graph: [],
            val_matrix: [],
            p_matrix: [],
        }));

        await fetchCausalGraph(
            ['a', 'b'],
            5,
            0.1,
            'pcmci',
            2048,
            undefined,
            0.3,
            'gpdc',
            4,
            'bh',
        );

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/analytics/causal');
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
            columns: 'a,b',
            tau_max: 5,
            alpha: 0.1,
            method: 'pcmci',
            max_points: 2048,
            pc_alpha: 0.3,
            test: 'gpdc',
            max_conds_dim: 4,
            fdr_method: 'bh',
        });
    });

    it('fetchCorrelationMatrix and fetchSpectralFilter use plan-aware POST routes', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ columns: [] }))
            .mockResolvedValueOnce(jsonResponse({ column: 'value', ts: [], values: [], filter_type: 'bandpass' }));

        await fetchCorrelationMatrix();
        await fetchSpectralFilter(new URLSearchParams({
            start: '2025-01-01T00:00:00.000Z',
            end: '2025-01-02T00:00:00.000Z',
            column: 'value',
            filter_type: 'bandpass',
        }));

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/scatter/correlations/matrix');
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
        expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/analytics/spectral-filter');
        const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
        expect(body.column).toBe('value');
        expect(body.filter_type).toBe('bandpass');
    });
});
