import { describe, expect, it, vi } from 'vitest';
import { createTimeseriesRuntimeCache } from './runtimeCache.js';

describe('TimeseriesRuntimeCache', () => {
    it('keeps deferred fetch work local and cancels it on disposal', () => {
        vi.useFakeTimers();
        const cache = createTimeseriesRuntimeCache();
        const first = vi.fn();
        const second = vi.fn();
        cache.scheduleFetch(first, 10);
        cache.scheduleFetch(second, 10);
        cache.dispose();
        vi.advanceTimersByTime(10);

        expect(first).not.toHaveBeenCalled();
        expect(second).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});
