import { beforeEach, describe, expect, it } from 'vitest';
import { getHashPage } from './router.js';

describe('hash router valid pages', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '#');
    });

    it('accepts drift as a valid hash-routed page', () => {
        window.history.replaceState(null, '', '#page=drift');

        expect(getHashPage()).toBe('drift');
    });

    it('rejects unknown hash-routed pages', () => {
        window.history.replaceState(null, '', '#page=unknown');

        expect(getHashPage()).toBeNull();
    });
});