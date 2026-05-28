import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.js';

describe('frontend vite build config', () => {
    it('serves lazy-loaded chunks from the packaged /js/ directory', () => {
        expect(viteConfig.base).toBe('/js/');
    });
});
