import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetApiRequestStateForTests } from '../services/api/http.js';
import { applyCleaningPlan, exportCleaningCode, exportCleaningData, exportCleaningManifest, exportCleaningPlan, previewCleaningPlan, selectDatasetVersion, validateCleaningPlan } from './api.js';
import type { CleaningPlan } from './types.js';

function plan(): CleaningPlan {
    return {
        schemaVersion: 1,
        id: 'plan-1',
        planRevision: 1,
        sourceVersionId: 'source-0',
        datasetRevision: 0,
        datasetFingerprint: 'frame',
        schemaFingerprint: 'schema',
        timeColumn: 'ts',
        stages: [],
        createdAt: 'now',
        updatedAt: 'now',
    };
}

function jsonResponse(body: unknown): Response {
    return { ok: true, status: 200, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

describe('cleaning API', () => {
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

    it('sends the complete anchored plan envelope for validation and preview', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ planHash: 'server-hash' }))
            .mockResolvedValueOnce(jsonResponse({ rowsBefore: 3, rowsAfter: 2 }));

        await validateCleaningPlan(plan());
        await previewCleaningPlan(plan());

        for (const [url, init] of fetchMock.mock.calls) {
            expect(url).toMatch(/\/api\/v1\/cleaning\/(validate|preview)/);
            const body = JSON.parse(String(init.body));
            expect(body).toMatchObject({
                expectedSourceVersionId: 'source-0',
                expectedDatasetRevision: 0,
                plan: { sourceVersionId: 'source-0', datasetFingerprint: 'frame', schemaFingerprint: 'schema' },
            });
        }
    });

    it('exports a full working dataset unless the caller explicitly supplies a projection', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            blob: vi.fn().mockResolvedValue(new Blob(['parquet'])),
        });

        await exportCleaningData(plan());

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/cleaning/export/data');
        const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(body.format).toBe('parquet');
        expect(body.outputColumns).toBeUndefined();
    });

    it('uses the same guarded envelope when materializing a child dataset', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ datasetRevision: 1, planHash: 'server-hash', sourceVersion: { id: 'source-1' } }));

        await applyCleaningPlan(plan());

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/cleaning/apply');
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
            expectedSourceVersionId: 'source-0', expectedDatasetRevision: 0,
        });
    });

    it('asks the server for the canonical plan artifact rather than serializing a browser-only snapshot', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(new Blob(['plan'])) });
        await exportCleaningPlan(plan());
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/cleaning/export/plan');
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ expectedSourceVersionId: 'source-0' });
    });

    it('requests backend-canonical code with the guarded plan envelope', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(new Blob(['code'])) });
        await exportCleaningCode(plan(), 'python');
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/cleaning/export/code');
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
            language: 'python', expectedSourceVersionId: 'source-0',
        });
    });

    it('requests an exact handoff manifest with the guarded plan envelope', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(new Blob(['manifest'])) });
        await exportCleaningManifest(plan());
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/cleaning/export/manifest');
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ expectedSourceVersionId: 'source-0' });
    });

    it('selects a retained version through the dedicated explicit endpoint', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'source-0' }));
        await selectDatasetVersion('source-0');
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/datasets/versions/select');
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ versionId: 'source-0' });
    });
});
