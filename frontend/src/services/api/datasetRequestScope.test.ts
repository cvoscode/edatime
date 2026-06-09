import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    __resetDatasetRequestScopeForTests,
    assertDatasetRequestScopeActive,
    captureDatasetRequestScope,
    dedupeInflight,
    invalidateDatasetRequestScope,
} from './datasetRequestScope.js';

describe('datasetRequestScope', () => {
    beforeEach(() => {
        __resetDatasetRequestScopeForTests();
    });

    afterEach(() => {
        __resetDatasetRequestScopeForTests();
    });

    it('starts at scope 0 and increments on invalidation', () => {
        expect(captureDatasetRequestScope()).toBe(0);
        const next = invalidateDatasetRequestScope();
        expect(next).toBe(1);
        expect(captureDatasetRequestScope()).toBe(1);
    });

    it('throws AbortError when a captured scope is invalidated', () => {
        const scope = captureDatasetRequestScope();
        invalidateDatasetRequestScope();
        try {
            assertDatasetRequestScopeActive(scope);
            throw new Error('expected assertDatasetRequestScopeActive to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).name).toBe('AbortError');
        }
    });

    it('accepts a still-active scope', () => {
        const scope = captureDatasetRequestScope();
        expect(() => assertDatasetRequestScopeActive(scope)).not.toThrow();
    });

    it('clears the inflight dedupe cache when invalidated', async () => {
        const factory = (): Promise<number> => new Promise((resolve) => {
            setTimeout(() => resolve(42), 0);
        });

        const first = dedupeInflight('metadata', factory);
        const second = dedupeInflight('metadata', factory);
        // Same inflight promise while still pending
        expect(second).toBe(first);
        // Invalidate mid-flight: stale callers should still see the same promise
        // but a new call after invalidation should start a fresh request.
        invalidateDatasetRequestScope();
        const third = dedupeInflight('metadata', factory);
        expect(third).not.toBe(first);

        // Drain both so the test does not leave dangling timers.
        await first;
        await third;
    });

    it('removes a dedupe key once the request settles', async () => {
        const factory = (): Promise<string> => Promise.resolve('ok');
        const first = dedupeInflight('data', factory);
        await first;
        const second = dedupeInflight('data', factory);
        // The second call should be a fresh promise because the first
        // finished and was removed from the inflight map.
        expect(second).not.toBe(first);
        await second;
    });
});
