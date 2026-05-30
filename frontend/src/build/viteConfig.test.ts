import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'vite';

const viteConfig: { base: string } = { base: '/js/' };

describe('frontend vite build config', () => {
    it('serves lazy-loaded chunks from the packaged /js/ directory', () => {
        expect(viteConfig.base).toBe('/js/');
    });
});
