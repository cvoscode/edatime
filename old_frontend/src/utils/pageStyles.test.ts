import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureStyleModule, pageStyleModulesFor, preloadPageStyles } from './pageStyles.js';

describe('pageStyles', () => {
    afterEach(() => {
        document.head.innerHTML = '';
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('maps only route-specific page styles', () => {
        expect(pageStyleModulesFor('home')).toEqual(['home']);
        expect(pageStyleModulesFor('drift')).toEqual(['drift']);
        expect(pageStyleModulesFor('scatter')).toEqual([]);
    });

    it('deduplicates stylesheet links', () => {
        ensureStyleModule('home');
        ensureStyleModule('home');

        expect(document.head.querySelectorAll('link[data-edatime-style="home"]')).toHaveLength(1);
    });

    it('preloads only the styles for the requested page', () => {
        preloadPageStyles('scatter');
        preloadPageStyles('home');

        expect(document.head.querySelector('link[data-edatime-style="drift"]')).toBeNull();
        expect(document.head.querySelector('link[data-edatime-style="home"]')).not.toBeNull();
    });

});