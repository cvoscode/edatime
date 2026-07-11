import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetApiRequestStateForTests } from './http.js';
import { exportParquet, exportScatterParquet } from './export.js';
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

    it('uses the shared structured error contract for a rejected export', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 422,
            headers: { get: () => 'application/json' },
            json: vi.fn().mockResolvedValue({
                message: 'invalid export range',
                code: 'invalid_range',
                correlation_id: 'export-123',
            }),
            text: vi.fn().mockResolvedValue(''),
        });

        await expect(exportParquet(new URLSearchParams({ start: 'a', end: 'b', columns: 'value' }))).rejects.toMatchObject({
            status: 422,
            code: 'invalid_range',
            correlationId: 'export-123',
        });
    });

    it('rejects stale in-flight parquet exports after dataset scope invalidation', async () => {
        const first = createDeferredResponse();
        const second = createDeferredResponse();
        fetchMock
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        const staleRequest = exportParquet(new URLSearchParams({ columns: 'value' }));

        invalidateDatasetRequestScope();

        const freshRequest = exportParquet(new URLSearchParams({ columns: 'value' }));

        expect(fetchMock).toHaveBeenCalledTimes(2);

        first.resolve(blobResponse('stale'));
        await expect(staleRequest).rejects.toThrow(/stale/i);

        second.resolve(blobResponse('fresh'));
        await expect(freshRequest).resolves.toBeInstanceOf(Blob);
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
});
