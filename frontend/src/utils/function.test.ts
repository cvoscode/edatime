import { describe, expect, it, vi } from 'vitest';
import { debounce } from './function.js';

describe('debounce', () => {
    it('invokes only the latest call after the delay', () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        const debounced = debounce(callback, 50);

        debounced('first');
        debounced('latest');
        vi.advanceTimersByTime(49);
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(callback).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledWith('latest');
        vi.useRealTimers();
    });
});
