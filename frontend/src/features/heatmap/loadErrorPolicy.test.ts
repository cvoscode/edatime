import { describe, expect, it } from 'vitest';
import { classifyHeatmapLoadError } from './loadErrorPolicy.js';

describe('heatmap load error policy', () => {
    it('guides users when the dataset lacks enough numeric columns', () => {
        expect(classifyHeatmapLoadError(new Error('need two numeric columns'))).toMatchObject({
            reason: 'no-columns-available',
            title: 'Need at least two numeric columns',
            status: 'Not enough numeric columns',
        });
    });

    it('preserves unexpected failure context in the status', () => {
        expect(classifyHeatmapLoadError(new Error('gateway timeout'))).toMatchObject({
            reason: 'render-failure',
            title: 'Correlation matrix unavailable',
            status: 'Error: gateway timeout',
        });
    });
});
