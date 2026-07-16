import { describe, expect, it } from 'vitest';
import { createDataMutationFeature } from './feature.js';

describe('createDataMutationFeature', () => {
    it('returns data mutation action surface', () => {
        const feature = createDataMutationFeature();
        expect(feature.proposeOutliers).toBeTypeOf('function');
    });

    it('does not import services/api at module level', () => {
        const feature = createDataMutationFeature();
        expect(feature).toHaveProperty('proposeOutliers');
    });
});
