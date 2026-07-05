import { beforeEach, describe, expect, it } from 'vitest';

import { markAppReady, resetAppReady } from './bootState.js';

describe('bootState', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('data-app-ready');
        document.body.removeAttribute('aria-busy');
        document.body.innerHTML = '<main id="main"></main>';
    });

    it('marks the app ready and clears the document busy state', () => {
        markAppReady();

        expect(document.documentElement.getAttribute('data-app-ready')).toBe('true');
        expect(document.body.getAttribute('aria-busy')).toBe('false');
    });

    it('resets the ready flag and restores the document busy state', () => {
        markAppReady();

        resetAppReady();

        expect(document.documentElement.hasAttribute('data-app-ready')).toBe(false);
        expect(document.body.getAttribute('aria-busy')).toBe('true');
    });
});
