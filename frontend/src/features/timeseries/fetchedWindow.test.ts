import { describe, expect, it } from 'vitest';
import { resolveFetchedWindow } from './fetchedWindow.js';

describe('fetched response window', () => {
    it('uses the returned timestamp bounds when the response is ordered', () => {
        expect(resolveFetchedWindow({
            data: { ts: new Float64Array([5, 10, 20]) },
            requestedStart: 10,
            requestedEnd: 15,
            lookaroundMs: 60,
        })).toEqual({ start: 5, end: 20 });
    });

    it('uses the requested padded window when response timestamps are absent or invalid', () => {
        const input = { requestedStart: 100, requestedEnd: 200, lookaroundMs: 50 };

        expect(resolveFetchedWindow({ ...input, data: { ts: [] } })).toEqual({ start: 50, end: 250 });
        expect(resolveFetchedWindow({ ...input, data: { ts: [Number.NaN, 200] } })).toEqual({ start: 50, end: 250 });
        expect(resolveFetchedWindow({ ...input, data: { ts: [200, 100] } })).toEqual({ start: 50, end: 250 });
    });
});
