import { describe, expect, it } from 'vitest';

import config from '../frontend/vite.config';

describe('frontend vite chunking', () => {
    it('splits settings into a dedicated shared chunk', () => {
        const output = config.build?.rollupOptions?.output;
        const outputConfig = Array.isArray(output) ? output[0] : output;
        const manualChunks = outputConfig?.manualChunks;

        expect(typeof manualChunks).toBe('function');
        expect(manualChunks?.('/workspace/frontend/src/utils/settings.ts')).toBe('settings');
    });
});
