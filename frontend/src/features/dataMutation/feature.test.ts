import { describe, expect, it } from 'vitest';
import { createDataMutationFeature } from './feature.js';

describe('createDataMutationFeature', () => {
    it('returns data mutation action surface', () => {
        const feature = createDataMutationFeature();
        expect(feature.runTransform).toBeTypeOf('function');
        expect(feature.removeOutliers).toBeTypeOf('function');
    });

    it('does not import services/api at module level', () => {
        const feature = createDataMutationFeature();
        expect(feature).toHaveProperty('runTransform');
        expect(feature).toHaveProperty('removeOutliers');
    });
});
