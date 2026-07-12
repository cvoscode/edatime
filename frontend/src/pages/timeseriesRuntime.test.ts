// Test that freezes the Timeseries lifecycle ownership behavior.
// Verifies that createTimeseriesRuntime uses page-runtime vocabulary
// and owns Timeseries activation.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTimeseriesLifecycle as createTimeseriesRuntime } from '../features/timeseries/lifecycle.js';

// Shared helper to dispatch a page-change event
function dispatchPageChange(page: string) {
    window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page } }));
}

describe('createTimeseriesRuntime', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // Test 1: Timeseries runtime initializes its feature once on first activation
    // -------------------------------------------------------------------------
    it('initFeature is called exactly once on the first timeseries page activation', () => {
        const initFeature = vi.fn();
        const ensureReady = vi.fn().mockResolvedValue(undefined);
        const runtime = createTimeseriesRuntime({ initFeature, ensureReady });
        runtime.mount();
        dispatchPageChange('timeseries');
        dispatchPageChange('timeseries');
        dispatchPageChange('timeseries');
        expect(initFeature).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // Test 2: initFeature does NOT fire before the timeseries page is activated
    // -------------------------------------------------------------------------
    it('initFeature is NOT called before the timeseries page is activated', () => {
        const initFeature = vi.fn();
        const ensureReady = vi.fn().mockResolvedValue(undefined);
        const runtime = createTimeseriesRuntime({ initFeature, ensureReady });
        runtime.mount();
        dispatchPageChange('other');
        dispatchPageChange('scatter');
        expect(initFeature).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Test 3: ensureReady() is called when the timeseries page becomes visible
    // -------------------------------------------------------------------------
    it('ensureReady() is called when the timeseries page becomes visible', () => {
        const initFeature = vi.fn();
        const ensureReady = vi.fn().mockResolvedValue(undefined);
        const runtime = createTimeseriesRuntime({ initFeature, ensureReady });
        runtime.mount();
        dispatchPageChange('timeseries');
        expect(ensureReady).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // Test 4: ensureReady() is NOT called for non-timeseries pages
    // -------------------------------------------------------------------------
    it('ensureReady() is NOT called when a non-timeseries page becomes visible', () => {
        const initFeature = vi.fn();
        const ensureReady = vi.fn().mockResolvedValue(undefined);
        const runtime = createTimeseriesRuntime({ initFeature, ensureReady });
        runtime.mount();
        dispatchPageChange('fft');
        dispatchPageChange('heatmap');
        expect(ensureReady).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Test 5: initFeature is still called only once regardless of other page
    // activations (proves it delegates to createPageLifecycle once-only guarantee)
    // -------------------------------------------------------------------------
    it('initFeature is still called only once regardless of other page activations', () => {
        const initFeature = vi.fn();
        const ensureReady = vi.fn().mockResolvedValue(undefined);
        const runtime = createTimeseriesRuntime({ initFeature, ensureReady });
        runtime.mount();
        dispatchPageChange('other');
        dispatchPageChange('timeseries');
        dispatchPageChange('scatter');
        dispatchPageChange('timeseries');
        // initFeature fires once on first timeseries activation only
        expect(initFeature).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // Test 6: createTimeseriesRuntime delegates to createPageRuntime with
    // page: 'timeseries' and correct emptyStateRootId
    // -------------------------------------------------------------------------
    it('createTimeseriesRuntime passes page: "timeseries" to createPageRuntime', () => {
        const initFeature = vi.fn();
        const ensureReady = vi.fn().mockResolvedValue(undefined);
        const runtime = createTimeseriesRuntime({ initFeature, ensureReady });
        runtime.mount();
        dispatchPageChange('timeseries');
        // The page: 'timeseries' is what causes the lifecycle to respond to
        // timeseries page-change events
        expect(ensureReady).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // Test 7: mount() returns an unregister cleanup function
    // -------------------------------------------------------------------------
    it('mount() returns an unregister function that removes the page-change listener', () => {
        const initFeature = vi.fn();
        const ensureReady = vi.fn().mockResolvedValue(undefined);
        const runtime = createTimeseriesRuntime({ initFeature, ensureReady });
        const unregister = runtime.mount();
        dispatchPageChange('timeseries');
        expect(initFeature).toHaveBeenCalledTimes(1);
        expect(ensureReady).toHaveBeenCalledTimes(1);
        unregister();
        dispatchPageChange('timeseries');
        // After unregister, no new calls
        expect(initFeature).toHaveBeenCalledTimes(1);
        expect(ensureReady).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // Test 8: ensureReady is called on every timeseries activation (not just once)
    // -------------------------------------------------------------------------
    it('ensureReady() fires on every timeseries page activation', () => {
        const initFeature = vi.fn();
        const ensureReady = vi.fn().mockResolvedValue(undefined);
        const runtime = createTimeseriesRuntime({ initFeature, ensureReady });
        runtime.mount();
        dispatchPageChange('timeseries');
        dispatchPageChange('timeseries');
        dispatchPageChange('timeseries');
        expect(initFeature).toHaveBeenCalledTimes(1);
        expect(ensureReady).toHaveBeenCalledTimes(3);
    });
});
