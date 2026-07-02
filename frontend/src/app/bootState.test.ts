import { beforeEach, describe, expect, it } from 'vitest';

import { markAppReady, resetAppReady } from './bootState.js';

describe('bootState', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('data-app-ready');
        document.body.innerHTML = '<div id="app-loading-overlay"></div>';
    });

    it('marks the app ready and hides the static loading overlay', () => {
        markAppReady();

        expect(document.documentElement.getAttribute('data-app-ready')).toBe('true');
        expect((document.getElementById('app-loading-overlay') as HTMLElement | null)?.hidden).toBe(true);
    });

    it('resets the ready flag and reveals the loading overlay again', () => {
        markAppReady();

        resetAppReady();

        expect(document.documentElement.hasAttribute('data-app-ready')).toBe(false);
        expect((document.getElementById('app-loading-overlay') as HTMLElement | null)?.hidden).toBe(false);
    });
});
