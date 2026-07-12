import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetApiRequestStateForTests, invalidateDatasetRequestScope } from './http.js';
import {
    fetchAnomalies,
    fetchCausalGraph,
    fetchCorrelationMatrix,
    fetchFft,
    fetchRollingBands,
    fetchSpectralFilter,
    fetchSpectrogram,
    postRemoveOutliers,
    postTransform,
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
    });

    afterEach(() => {
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

        const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
        expect(requestUrl.pathname).toBe('/api/analytics/rolling');
        expect(requestUrl.searchParams.get('start')).toBe('2025-01-01T00:00:00.000Z');
        expect(requestUrl.searchParams.get('end')).toBe('2025-01-02T00:00:00.000Z');
        expect(requestUrl.searchParams.get('columns')).toBe('value,temp');
        expect(requestUrl.searchParams.get('window')).toBe('25');
    });

    it('fetchAnomalies preserves threshold omission when none is provided', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ method: 'zscore', threshold: 3, regions: [] }));

        await fetchAnomalies(
            '2025-01-01T00:00:00.000Z',
            '2025-01-02T00:00:00.000Z',
            'value',
            'mad',
        );

        const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
        expect(requestUrl.pathname).toBe('/api/analytics/anomalies');
        expect(requestUrl.searchParams.get('method')).toBe('mad');
        expect(requestUrl.searchParams.get('threshold')).toBeNull();
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

    it('allows unscoped analytics GET requests to survive dataset invalidation', async () => {
        const deferred = createDeferredResponse();
        fetchMock.mockReturnValueOnce(deferred.promise);

        const request = fetchRollingBands('start', 'end', 'value', 50, { datasetScoped: false });

        invalidateDatasetRequestScope();

        deferred.resolve(jsonResponse({ bands: [] }));
        await expect(request).resolves.toEqual({ bands: [] });
    });

    it('fetchFft forwards max_points through the query string', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ sample_count: 0, results: [] }));

        await fetchFft(
            '2025-01-01T00:00:00.000Z',
            '2025-01-02T00:00:00.000Z',
            'value',
            4096,
        );

        const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
        expect(requestUrl.pathname).toBe('/api/analytics/fft');
        expect(requestUrl.searchParams.get('max_points')).toBe('4096');
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

        const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
        expect(requestUrl.pathname).toBe('/api/analytics/spectrogram');
        expect(requestUrl.searchParams.get('window_size')).toBe('320');
        expect(requestUrl.searchParams.get('hop_size')).toBe('48');
        expect(requestUrl.searchParams.get('max_points')).toBe('4096');
        expect(requestUrl.searchParams.get('normalize')).toBe('zscore');
        expect(requestUrl.searchParams.get('clip')).toBe('percentile');
        expect(requestUrl.searchParams.get('clip_param')).toBeNull();
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

        const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
        expect(requestUrl.searchParams.get('clip_param')).toBe('0');
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

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/analytics/causal');
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
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

    it('postTransform and postRemoveOutliers preserve their legacy mutation payloads', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'ok', column: 'x', expression: 'col("x") * 2' }))
            .mockResolvedValueOnce(jsonResponse({
                method: 'zscore',
                columns: ['value'],
                rows_before: 10,
                rows_after: 8,
                rows_removed: 2,
            }));

        await postTransform('col("x") * 2', 'x_scaled');
        await postRemoveOutliers(['value'], 'zscore', 3, 25);

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/transform');
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
            expression: 'col("x") * 2',
            output_name: 'x_scaled',
        });

        expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/analytics/remove_outliers');
        expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
            columns: 'value',
            method: 'zscore',
            threshold: 3,
            window: 25,
        });
    });

    it('fetchCorrelationMatrix and fetchSpectralFilter keep their current GET routes', async () => {
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

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/scatter/correlations/matrix');

        const requestUrl = new URL(String(fetchMock.mock.calls[1]?.[0]), 'http://localhost');
        expect(requestUrl.pathname).toBe('/api/analytics/spectral-filter');
        expect(requestUrl.searchParams.get('column')).toBe('value');
        expect(requestUrl.searchParams.get('filter_type')).toBe('bandpass');
    });
});
