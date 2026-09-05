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
                get: (name: string) => {
                    if (name.toLowerCase() === 'content-type') return 'application/json';
                    if (name.toLowerCase() === 'x-edatime-contract') return 'v1';
                    return null;
                },
            },
            json: vi.fn().mockResolvedValue({
                error: 'Bad request',
                message: 'invalid filter',
                kind: 'validation',
                code: 'invalid_filter',
                correlation_id: 'req-123',
                request_id: 'req-123',
            }),
            text: vi.fn().mockResolvedValue(''),
        } as unknown as Response;

        const error = await readApiError(response, 'Upload');

        expect(error.message).toContain('Upload failed (422)');
        expect(error.message).toContain('[invalid_filter]');
        expect(error.message).toContain('{validation}');
        expect(error.message).toContain('(request_id=req-123)');
        expect(error.message).toContain('invalid filter');
        expect((error as Error & { status?: number }).status).toBe(422);
    });

    it('diagnoses a malformed JSON error response that declares the v1 contract', async () => {
        const response = {
            ok: false,
            status: 500,
            headers: {
                get: (name: string) => {
                    if (name.toLowerCase() === 'content-type') return 'application/json';
                    if (name.toLowerCase() === 'x-edatime-contract') return 'v1';
                    return null;
                },
            },
            json: vi.fn().mockResolvedValue({ message: 'unexpected upstream response' }),
            text: vi.fn().mockResolvedValue(''),
        } as unknown as Response;

        const error = await readApiError(response, 'Metadata');

        expect(error.message).toContain('Metadata failed (500)');
        expect(error.message).toContain('error response violates the v1 error contract');
        expect(error.message).toContain('error, kind, code, correlation_id, request_id');
        expect(error.message).toContain('unexpected upstream response');
    });

    it.each([
        ['application/json', '{broken', 'invalid JSON'],
        ['text/plain', 'upstream failure', 'expected application/json'],
    ])('diagnoses a v1 %s error while preserving its body', async (contentType, body, diagnostic) => {
        const response = new Response(body, {
            status: 502,
            headers: { 'content-type': contentType, 'x-edatime-contract': 'v1' },
        });
        const error = await readApiError(response, 'Metadata');
        expect(error.message).toContain('error response violates the v1 error contract');
        expect(error.message).toContain(diagnostic);
        expect(error.message).toContain(body);
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

    it('preserves the raw body when a JSON error response cannot be decoded', async () => {
        const response = {
            ok: false,
            status: 502,
            headers: {
                get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null,
            },
            json: vi.fn().mockRejectedValue(new SyntaxError('invalid JSON')),
            text: vi.fn().mockResolvedValue('{"upstream":"bad gateway"}'),
        } as unknown as Response;

        const error = await readApiError(response, 'Metadata');

        expect(error.message).toContain('{"upstream":"bad gateway"}');
    });
});
