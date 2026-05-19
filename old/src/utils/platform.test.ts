import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultGpuPowerPreference, installWindowsWebGpuRequestAdapterWorkaround, stripIgnoredPowerPreference } from './platform.js';

describe('stripIgnoredPowerPreference', () => {
    it('removes powerPreference while preserving other options', () => {
        expect(stripIgnoredPowerPreference({ powerPreference: 'high-performance', forceFallbackAdapter: false })).toEqual({
            forceFallbackAdapter: false,
        });
    });

    it('returns undefined when powerPreference was the only option', () => {
        expect(stripIgnoredPowerPreference({ powerPreference: 'high-performance' })).toBeUndefined();
    });

    it('passes through options without powerPreference', () => {
        const options = { forceFallbackAdapter: false };
        expect(stripIgnoredPowerPreference(options)).toBe(options);
    });
});

describe('defaultGpuPowerPreference', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('does not set a power preference on Windows browsers', () => {
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });

        expect(defaultGpuPowerPreference()).toBeUndefined();
    });

    it('strips ignored powerPreference options from requestAdapter on Windows', async () => {
        const requestAdapter = vi.fn().mockResolvedValue({ name: 'adapter' });
        vi.stubGlobal('navigator', {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            gpu: { requestAdapter },
        });

        installWindowsWebGpuRequestAdapterWorkaround();
        const gpu = navigator.gpu as { requestAdapter: (options?: Record<string, unknown>) => Promise<unknown | null> };
        await gpu.requestAdapter({ powerPreference: 'high-performance', forceFallbackAdapter: false });

        expect(requestAdapter).toHaveBeenCalledWith({ forceFallbackAdapter: false });
    });
});