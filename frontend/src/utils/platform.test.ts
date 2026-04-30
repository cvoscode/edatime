import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultGpuPowerPreference, installWindowsWebGpuRequestAdapterWorkaround } from './platform.js';

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
        await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', forceFallbackAdapter: false } as any);

        expect(requestAdapter).toHaveBeenCalledWith({ forceFallbackAdapter: false });
    });
});