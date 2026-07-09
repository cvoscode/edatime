import { describe, expect, it, vi } from 'vitest';

import { createLifecycleScope } from './lifecycleScope.js';

describe('lifecycle scope', () => {
    it('aborts active work and runs registered cleanups once in reverse order', () => {
        const scope = createLifecycleScope();
        const first = vi.fn();
        const second = vi.fn();
        scope.add(first);
        scope.add(second);

        scope.dispose();
        scope.dispose();

        expect(scope.signal.aborted).toBe(true);
        expect(second).toHaveBeenCalledBefore(first);
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('removes event listeners and cancels timers on disposal', () => {
        vi.useFakeTimers();
        const scope = createLifecycleScope();
        const target = new EventTarget();
        const listener = vi.fn();
        const callback = vi.fn();
        scope.listen(target, 'change', listener);
        scope.timeout(callback, 10);

        scope.dispose();
        target.dispatchEvent(new Event('change'));
        vi.advanceTimersByTime(10);

        expect(listener).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('immediately cleans resources added after disposal', () => {
        const scope = createLifecycleScope();
        const cleanup = vi.fn();
        scope.dispose();

        scope.add(cleanup);

        expect(cleanup).toHaveBeenCalledTimes(1);
    });
});
