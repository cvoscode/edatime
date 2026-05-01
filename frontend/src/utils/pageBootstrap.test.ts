import { describe, expect, it } from 'vitest';
import { pageNeedsDatasetBootstrap } from './pageBootstrap.js';

describe('pageNeedsDatasetBootstrap', () => {
    it('skips bootstrap for home and upload', () => {
        expect(pageNeedsDatasetBootstrap('home')).toBe(false);
        expect(pageNeedsDatasetBootstrap('upload')).toBe(false);
    });

    it('requires bootstrap for analysis pages', () => {
        expect(pageNeedsDatasetBootstrap('timeseries')).toBe(true);
        expect(pageNeedsDatasetBootstrap('scatter')).toBe(true);
        expect(pageNeedsDatasetBootstrap('drift')).toBe(true);
    });
});