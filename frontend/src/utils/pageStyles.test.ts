import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureStyleModule, pageStyleModulesFor, preloadPageStyles } from './pageStyles.js';

describe('pageStyles', () => {
    afterEach(() => {
        document.head.innerHTML = '';
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('does not request raw page stylesheet files', () => {
        expect(pageStyleModulesFor('home')).toEqual([]);
        expect(pageStyleModulesFor('drift')).toEqual([]);
        expect(pageStyleModulesFor('scatter')).toEqual([]);
    });

    it('does not inject stylesheet links', () => {
        expect(ensureStyleModule('home')).toBeNull();
        expect(ensureStyleModule('home')).toBeNull();

        expect(document.head.querySelectorAll('link[data-edatime-style="home"]')).toHaveLength(0);
    });

    it('keeps preloading as a no-op compatibility hook', () => {
        preloadPageStyles('scatter');
        preloadPageStyles('home');

        expect(document.head.querySelector('link[data-edatime-style="drift"]')).toBeNull();
        expect(document.head.querySelector('link[data-edatime-style="home"]')).toBeNull();
        expect(document.head.querySelector('link[data-edatime-style="scatter"]')).toBeNull();
    });

});
