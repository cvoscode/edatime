import { beforeEach, describe, expect, it } from 'vitest';

import {
    clearAllAnnotations,
    createBookmark,
    getAnnotationsForPage,
    initAnnotations,
} from './annotations.js';

describe('annotations store', () => {
    beforeEach(() => {
        localStorage.clear();
        clearAllAnnotations();
        delete (window as any).__edatimeAnnotations;
    });

    it('loads annotations without publishing a window registry', () => {
        createBookmark('Checkpoint', 42);

        initAnnotations();

        expect(getAnnotationsForPage('timeseries')).toHaveLength(1);
        expect((window as any).__edatimeAnnotations).toBeUndefined();
    });
});
