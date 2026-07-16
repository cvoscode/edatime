import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetApiRequestStateForTests } from './http.js';
import { exportScatterParquet } from './export.js';
import { invalidateDatasetRequestScope } from './http.js';

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

function blobResponse(body = 'ok'): Response {
    return {
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(new Blob([body])),
        text: vi.fn().mockResolvedValue(body),
    } as unknown as Response;
}

describe('Parquet export API', () => {
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

    it('rejects stale in-flight scatter parquet exports after dataset scope invalidation', async () => {
        const first = createDeferredResponse();
        const second = createDeferredResponse();
        fetchMock
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        const staleRequest = exportScatterParquet({ filters: { columnRanges: {} } });

        invalidateDatasetRequestScope();

        const freshRequest = exportScatterParquet({ filters: { columnRanges: {} } });

        expect(fetchMock).toHaveBeenCalledTimes(2);

        first.resolve(blobResponse('stale'));
        await expect(staleRequest).rejects.toThrow(/stale/i);

        second.resolve(blobResponse('fresh'));
        await expect(freshRequest).resolves.toBeInstanceOf(Blob);
    });

    it('forwards request option signals to scatter parquet exports', async () => {
        const controller = new AbortController();
        fetchMock.mockResolvedValueOnce(blobResponse('ok'));

        await exportScatterParquet({ filters: { columnRanges: {} } }, { signal: controller.signal });

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/scatter/export/parquet');
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            method: 'POST',
            signal: controller.signal,
        });
    });
});
