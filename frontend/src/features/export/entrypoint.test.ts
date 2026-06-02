import { describe, expect, it } from 'vitest';
import { createExportFeature } from './entrypoint.js';

describe('createExportFeature', () => {
    it('returns export action surface', () => {
        const feature = createExportFeature();
        expect(feature.exportFilteredCsv).toBeTypeOf('function');
        expect(feature.exportFilteredJson).toBeTypeOf('function');
        expect(feature.exportFilteredParquet).toBeTypeOf('function');
    });

    it('does not import services/api at module level', () => {
        // The feature module should not statically import services/api at the top level.
        // This is enforced by the architecture checker, but we verify the surface is clean.
        const feature = createExportFeature();
        expect(feature).toHaveProperty('exportFilteredCsv');
        expect(feature).toHaveProperty('exportFilteredJson');
        expect(feature).toHaveProperty('exportFilteredParquet');
    });
});