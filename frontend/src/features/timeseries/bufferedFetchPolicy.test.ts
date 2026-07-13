import { describe, expect, it } from 'vitest';
import { canReuseBufferedFetch } from './bufferedFetchPolicy.js';

describe('timeseries buffered fetch policy', () => {
    it('reuses only raw data covering the requested view with the same key', () => {
        expect(canReuseBufferedFetch({
            expectedKey: 'OT|', actualKey: 'OT|', data: { _meta: { downsampled: false } },
            fetchedWindow: { start: 0, end: 100 }, requestedView: { start: 20, end: 80 },
        })).toBe(true);
        expect(canReuseBufferedFetch({
            expectedKey: 'OT|', actualKey: 'OT|', data: { _meta: { downsampled: true } },
            fetchedWindow: { start: 0, end: 100 }, requestedView: { start: 20, end: 80 },
        })).toBe(false);
    });
});
