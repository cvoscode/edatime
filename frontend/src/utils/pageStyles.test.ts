import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureStyleModule, pageStyleModulesFor, preloadPageStyles } from './pageStyles.js';

describe('pageStyles', () => {
    afterEach(() => {
        document.head.innerHTML = '';
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('maps page names to page-owned style modules', () => {
        expect(pageStyleModulesFor('home')).toEqual(['home']);
        expect(pageStyleModulesFor('drift')).toEqual(['drift']);
        expect(pageStyleModulesFor('heatmap')).toEqual(['scatter']);
        expect(pageStyleModulesFor('scatter')).toEqual(['scatter']);
        expect(pageStyleModulesFor('scattermatrix')).toEqual(['scatter']);
        expect(pageStyleModulesFor('timeseries')).toEqual([]);
    });

    it('injects one stylesheet link per page-owned module', () => {
        const first = ensureStyleModule('home');
        const second = ensureStyleModule('home');

        expect(first).toBeInstanceOf(HTMLLinkElement);
        expect(second).toBe(first);
        expect(first?.getAttribute('rel')).toBe('stylesheet');
        expect(first?.getAttribute('data-edatime-style')).toBe('home');
        expect(document.head.querySelectorAll('link[data-edatime-style="home"]')).toHaveLength(1);
    });

    it('preloads every style needed by a page before it is shown', () => {
        preloadPageStyles('heatmap');
        preloadPageStyles('scatter');
        preloadPageStyles('home');

        expect(document.head.querySelector('link[data-edatime-style="scatter"]')).toBeInstanceOf(HTMLLinkElement);
        expect(document.head.querySelector('link[data-edatime-style="home"]')).toBeInstanceOf(HTMLLinkElement);
        expect(document.head.querySelector('link[data-edatime-style="drift"]')).toBeNull();
    });

});
