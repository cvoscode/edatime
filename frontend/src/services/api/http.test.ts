import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    __resetApiRequestStateForTests,
    getJson,
    invalidateDatasetRequestScope,
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

        const staleRequest = getJson('/api/metadata', 'Metadata');

        invalidateDatasetRequestScope();

        const freshRequest = getJson('/api/metadata', 'Metadata');

        expect(fetchMock).toHaveBeenCalledTimes(2);

        first.resolve(jsonResponse({ revision: 1, columns: ['old'] }));
        await expect(staleRequest).rejects.toThrow(/stale/i);

        second.resolve(jsonResponse({ revision: 2, columns: ['new'] }));
        await expect(freshRequest).resolves.toEqual({ revision: 2, columns: ['new'] });
    });
});
