import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    __resetApiRequestStateForTests,
    getJson,
    deleteJson,
    invalidateDatasetRequestScope,
    postJson,
    readApiError,
} from './http.js';

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

function jsonResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    } as unknown as Response;
}

describe('api http request invalidation', () => {
    beforeEach(() => {
        __resetApiRequestStateForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        __resetApiRequestStateForTests();
    });

    it('rejects stale in-flight GET responses after dataset scope invalidation and refetches metadata', async () => {
        const first = createDeferredResponse();
        const second = createDeferredResponse();
        const fetchMock = vi.fn()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        vi.stubGlobal('fetch', fetchMock);

        const staleRequest = getJson('/api/v1/metadata', 'Metadata');

        invalidateDatasetRequestScope();

        const freshRequest = getJson('/api/v1/metadata', 'Metadata');

        expect(fetchMock).toHaveBeenCalledTimes(2);

        first.resolve(jsonResponse({ revision: 1, columns: ['old'] }));
        await expect(staleRequest).rejects.toThrow(/stale/i);

        second.resolve(jsonResponse({ revision: 2, columns: ['new'] }));
        await expect(freshRequest).resolves.toEqual({ revision: 2, columns: ['new'] });
    });
});

describe('api http request options', () => {
    beforeEach(() => {
        __resetApiRequestStateForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        __resetApiRequestStateForTests();
    });

    it('includes the captured dataset scope in postJson dedupe keys', async () => {
        const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {
            // Never resolves — keeps the dedupe entry alive for the duration
            // of the test so we can verify scope-based keying.
        }));
        vi.stubGlobal('fetch', fetchMock);

        const first = postJson('/api/v1/upload', { x: 1 }, 'Upload');
        const second = postJson('/api/v1/upload', { x: 1 }, 'Upload');

        // Same scope, same body => same dedupe key => single fetch.
        expect(fetchMock).toHaveBeenCalledTimes(1);

        invalidateDatasetRequestScope();

        const third = postJson('/api/v1/upload', { x: 1 }, 'Upload');

        // New scope => new dedupe key => fresh fetch.
        expect(fetchMock).toHaveBeenCalledTimes(2);

        // Suppress unhandled rejection warnings.
        first.catch(() => { });
        second.catch(() => { });
        third.catch(() => { });
    });

    it('uses an unscoped no-store DELETE request for non-dataset routes', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(deleteJson('/api/v1/database/connect', 'Database disconnect', { datasetScoped: false }))
            .resolves.toEqual({ status: 'ok' });

        expect(fetchMock).toHaveBeenCalledWith('/api/v1/database/connect', {
            method: 'DELETE',
            cache: 'no-store',
        });
    });

    it('rejects a stale in-flight POST response after dataset scope invalidation', async () => {
        const first = createDeferredResponse();
        const second = createDeferredResponse();
        const fetchMock = vi.fn()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        vi.stubGlobal('fetch', fetchMock);

        const staleRequest = postJson('/api/v1/drift/stats', { col: 'a' }, 'Drift stats');
        invalidateDatasetRequestScope();
        const freshRequest = postJson('/api/v1/drift/stats', { col: 'a' }, 'Drift stats');

        expect(fetchMock).toHaveBeenCalledTimes(2);

        first.resolve(jsonResponse({ ok: true }));
        await expect(staleRequest).rejects.toThrow(/stale/i);

        second.resolve(jsonResponse({ ok: true }));
        await expect(freshRequest).resolves.toEqual({ ok: true });
    });

    it('readApiError surfaces JSON error payloads with code and request identity', async () => {
        const response = {
            ok: false,
            status: 422,
            headers: {
                get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
            },
            json: vi.fn().mockResolvedValue({
                message: 'invalid filter',
                code: 'invalid_filter',
                correlation_id: 'req-123',
            }),
            text: vi.fn().mockResolvedValue(''),
        } as unknown as Response;

        const error = await readApiError(response, 'Upload');

        expect(error.message).toContain('Upload failed (422)');
        expect(error.message).toContain('[invalid_filter]');
        expect(error.message).toContain('(request_id=req-123)');
        expect(error.message).toContain('invalid filter');
        expect((error as Error & { status?: number }).status).toBe(422);
    });

    it('readApiError falls back to plain text when content-type is not JSON', async () => {
        const response = {
            ok: false,
            status: 500,
            headers: {
                get: () => 'text/plain',
            },
            json: vi.fn().mockResolvedValue(undefined),
            text: vi.fn().mockResolvedValue('Internal Server Error'),
        } as unknown as Response;

        const error = await readApiError(response, 'Metadata');
        expect(error.message).toContain('Metadata failed (500)');
        expect(error.message).toContain('Internal Server Error');
    });
});
