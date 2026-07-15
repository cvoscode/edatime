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

        const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
        expect(requestUrl.pathname).toBe('/api/v1/analytics/rolling');
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
        expect(requestUrl.pathname).toBe('/api/v1/analytics/anomalies');
        expect(requestUrl.searchParams.get('method')).toBe('mad');
        expect(requestUrl.searchParams.get('threshold')).toBeNull();
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
            const url = new URL(String(call[0]), 'http://localhost');
            const envelope = index < 4
                ? JSON.parse(String(request?.body ?? '{}')).cleaning_plan
                : JSON.parse(String(url.searchParams.get('cleaning_plan')));
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
        expect(requestUrl.pathname).toBe('/api/v1/analytics/fft');
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
        expect(requestUrl.pathname).toBe('/api/v1/analytics/spectrogram');
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

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/analytics/causal');
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

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/transform');
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
            expression: 'col("x") * 2',
            output_name: 'x_scaled',
        });

        expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/analytics/remove_outliers');
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

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/scatter/correlations/matrix');

        const requestUrl = new URL(String(fetchMock.mock.calls[1]?.[0]), 'http://localhost');
        expect(requestUrl.pathname).toBe('/api/v1/analytics/spectral-filter');
        expect(requestUrl.searchParams.get('column')).toBe('value');
        expect(requestUrl.searchParams.get('filter_type')).toBe('bandpass');
    });
});
