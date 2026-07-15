/**
 * Frontend contract tests for the /api/v1 cutover.
 *
 * Pin every endpoint module exported URL to the canonical /api/v1 base.
 * These tests double as the contract surface: when a new endpoint is
 * added, this file must be updated alongside the module.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

interface FetchCall {
    url: string;
    init?: RequestInit;
}

function installFetchSpy(): { calls: FetchCall[]; restore: () => void } {
    const calls: FetchCall[] = [];
    const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.toString()
                : (input as Request).url;
        calls.push({ url, init });
        const body = JSON.stringify({
            total_rows: 0,
            columns: [],
            numeric_columns: [],
            points: [],
            correlations: [],
            suggestions: [],
            top_pairs: [],
            numeric_columns_meta: [],
            base_column: '',
            mode: 'pearson_raw',
            threshold_field: 0,
            bands: [],
            regions: [],
            method: 'zscore',
            threshold: 3,
            summary_stats: null,
            results: [],
            result: { column: 'value', times_ms: [], frequencies: [], magnitudes: [] },
            sample_count: 0,
            status: 'ok',
            column: 'value',
            expression: '',
            rows_before: 0,
            rows_after: 0,
            rows_removed: 0,
        });
        return Promise.resolve(new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
    });
    const original = globalThis.fetch;
    globalThis.fetch = spy as unknown as typeof fetch;
    return {
        calls,
        restore: () => { globalThis.fetch = original; },
    };
}

const ISO = '2025-01-01T00:00:00.000Z';

beforeEach(() => {
    vi.resetModules();
});

describe('contract: every endpoint targets /api/v1', () => {
    it('metadata module targets /api/v1', async () => {
        const spy = installFetchSpy();
        try {
            const { fetchMetadata, fetchSampleDataset } =
                await import('./metadata.js');
            await fetchMetadata();
            await fetchSampleDataset('ETTm2.csv');
            const urls = spy.calls.map((c) => c.url);
            expect(urls[0]).toBe('/api/v1/metadata');
            expect(urls[1]).toBe('/api/v1/sample/ETTm2.csv');
        } finally {
            spy.restore();
        }
    });

    it('export module targets /api/v1', async () => {
        const spy = installFetchSpy();
        try {
            const { exportParquet, exportScatterParquet } =
                await import('./export.js');
            await exportParquet(new URLSearchParams({ columns: 'value' }));
            await exportScatterParquet({ x: 'a', y: 'b' });
            const urls = spy.calls.map((c) => c.url);
            expect(urls[0]).toBe('/api/v1/export/parquet?columns=value');
            expect(urls[1]).toBe('/api/v1/scatter/export/parquet');
        } finally {
            spy.restore();
        }
    });

    it('scatter matrix helper targets /api/v1', async () => {
        const spy = installFetchSpy();
        try {
            const { fetchCorrelationMatrix } =
                await import('./scatter-matrix.js');
            await fetchCorrelationMatrix();
            const url = spy.calls[0]?.url;
            expect(url).toBe('/api/v1/scatter/correlations/matrix?mode=pearson_raw');
        } finally {
            spy.restore();
        }
    });

    it('scatter matrix helper carries the active cleaning plan', async () => {
        const spy = installFetchSpy();
        try {
            const { cleaningPlanStore } = await import('../../cleaning/store.js');
            const { fetchCorrelationMatrix } = await import('./scatter-matrix.js');
            cleaningPlanStore.resetForDataset({
                sourceVersionId: 'source-matrix',
                datasetRevision: 5,
                datasetFingerprint: 'dataset-matrix',
                schemaFingerprint: 'schema-matrix',
                timeColumn: 'ts',
            });
            cleaningPlanStore.addStage({
                kind: 'columnRange',
                executionClass: 'polarsExpression',
                scope: 'row',
                enabled: true,
                sourcePage: 'correlation',
                label: 'Matrix range',
                column: 'value',
                from: 0,
                to: 10,
                mode: 'keepInside',
            });

            await fetchCorrelationMatrix('spearman_diff');

            const url = new URL(String(spy.calls[0]?.url), 'http://localhost');
            expect(url.pathname).toBe('/api/v1/scatter/correlations/matrix');
            expect(url.searchParams.get('mode')).toBe('spearman_diff');
            expect(JSON.parse(String(url.searchParams.get('cleaning_plan')))).toMatchObject({
                expectedSourceVersionId: 'source-matrix',
                expectedDatasetRevision: 5,
                plan: { stages: [{ kind: 'columnRange' }] },
            });
            cleaningPlanStore.clear();
        } finally {
            spy.restore();
        }
    });

    it('timeseries data fetch targets /api/v1', async () => {
        const spy = installFetchSpy();
        try {
            const { fetchData } = await import('./timeseries.js');
            await fetchData(ISO, ISO, 100, 'value');
            const url = spy.calls[0]?.url;
            expect(url).toContain('/api/v1/data?');
            expect(url).toContain('columns=value');
        } finally {
            spy.restore();
        }
    });

    it('upload module targets /api/v1', async () => {
        const spy = installFetchSpy();
        try {
            const {
                previewUpload,
                uploadDataset,
                fetchDatabaseTables,
                connectDatabase,
                loadDatabaseTable,
                deleteDatabaseConnection,
                fetchDatabaseStatus,
                fetchDriftStats,
                fetchDriftInvestigation,
            } = await import('./upload.js');
            const fd = new FormData();
            await previewUpload(fd);
            await uploadDataset(fd);
            await fetchDatabaseTables();
            await connectDatabase({});
            await loadDatabaseTable({});
            await deleteDatabaseConnection();
            await fetchDatabaseStatus();
            await fetchDriftStats({});
            await fetchDriftInvestigation({});
            const urls = spy.calls.map((c) => c.url);
            expect(urls).toEqual([
                '/api/v1/upload/preview',
                '/api/v1/upload',
                '/api/v1/database/tables',
                '/api/v1/database/connect',
                '/api/v1/database/load',
                '/api/v1/database/connect',
                '/api/v1/database/status',
                '/api/v1/drift/stats',
                '/api/v1/drift/investigate',
            ]);
        } finally {
            spy.restore();
        }
    });

    it('scatter module targets /api/v1', async () => {
        const spy = installFetchSpy();
        try {
            const { fetchScatterPoints, fetchScatterCorrelations } =
                await import('./scatter.js');
            // fetchScatterMatrix requires Arrow IPC, covered in scatter.test.ts.
            await fetchScatterPoints('a', 'b');
            await fetchScatterCorrelations('a', 0.5, 'pearson_raw');
            const urls = spy.calls.map((c) => c.url);
            expect(urls[0]).toBe('/api/v1/scatter/points');
            expect(urls[1]).toBe('/api/v1/scatter/correlations?threshold=0.5&base=a&mode=pearson_raw');
        } finally {
            spy.restore();
        }
    });

    it('analytics module targets /api/v1', async () => {
        const spy = installFetchSpy();
        try {
            const {
                fetchRollingBands,
                fetchAnomalies,
                fetchFft,
                fetchSpectrogram,
                fetchCausalGraph,
                postTransform,
                fetchCorrelationMatrix,
                postRemoveOutliers,
                fetchSpectralFilter,
            } = await import('./analytics.js');
            await fetchRollingBands(ISO, ISO, 'value', 50);
            await fetchAnomalies(ISO, ISO, 'value', 'zscore', 3);
            await fetchFft(ISO, ISO, 'value', 1024);
            await fetchSpectrogram(ISO, ISO, 'value', 64, 32, 2048);
            await fetchCausalGraph(['value'], 2, 0.05, 'pcmci', 1000, undefined);
            await postTransform('value*2', 'value2');
            await fetchCorrelationMatrix();
            await postRemoveOutliers(null, 'zscore', 3, 10);
            await fetchSpectralFilter(new URLSearchParams({
                start: ISO, end: ISO, column: 'value',
                window_size: '64', hop_size: '32', max_points: '1024',
            }));
            const urls = spy.calls.map((c) => c.url);
            expect(urls[0]).toContain('/api/v1/analytics/rolling?');
            expect(urls[1]).toContain('/api/v1/analytics/anomalies?');
            expect(urls[2]).toContain('/api/v1/analytics/fft?');
            expect(urls[3]).toContain('/api/v1/analytics/spectrogram?');
            expect(urls[4]).toBe('/api/v1/analytics/causal');
            expect(urls[5]).toBe('/api/v1/transform');
            expect(urls[6]).toBe('/api/v1/scatter/correlations/matrix');
            expect(urls[7]).toBe('/api/v1/analytics/remove_outliers');
            expect(urls[8]).toContain('/api/v1/analytics/spectral-filter?');
        } finally {
            spy.restore();
        }
    });
});
