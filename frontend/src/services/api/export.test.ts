import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetApiRequestStateForTests } from './http.js';
import { exportParquet } from './export.js';

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
});
