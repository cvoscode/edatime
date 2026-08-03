import { describe, expect, it } from 'vitest';

import config from '../frontend/vite.config';

describe('frontend vite chunking', () => {
    it('splits settings into a dedicated shared chunk', () => {
        const resolvedConfig = typeof config === 'function'
            ? config({ command: 'build', mode: 'production', isSsrBuild: false, isPreview: false })
            : config;
        const output = resolvedConfig.build?.rollupOptions?.output;
        const outputConfig = Array.isArray(output) ? output[0] : output;
        const manualChunks = outputConfig?.manualChunks;

        expect(typeof manualChunks).toBe('function');
        expect(manualChunks?.('/workspace/frontend/src/utils/settings.ts')).toBe('settings');
    });
});
