import { beforeEach, describe, expect, it } from 'vitest';
import type { DatasetMetadata } from '../../types/api.js';
import { rememberScatterPair, restoreSavedScatterPair } from './pairIntent.js';

const metadata = {
    source_version_id: 'source-a', source_version_revision: 3,
    numeric_columns: ['HUFL', 'HULL', 'OT'],
} as DatasetMetadata;

describe('saved Pair plot axes', () => {
    beforeEach(() => sessionStorage.clear());

    it('restores the rendered pair only for the same source version and revision', () => {
        rememberScatterPair(metadata, { x: 'OT', y: 'HULL' });
        expect(restoreSavedScatterPair(metadata, metadata.numeric_columns)).toEqual({ x: 'OT', y: 'HULL' });
        expect(restoreSavedScatterPair({ ...metadata, source_version_id: 'source-b' }, metadata.numeric_columns)).toBeNull();
        expect(restoreSavedScatterPair({ ...metadata, source_version_revision: 4 }, metadata.numeric_columns)).toBeNull();
    });

    it('ignores axes removed by the active preparation plan', () => {
        rememberScatterPair(metadata, { x: 'OT', y: 'HULL' });
        expect(restoreSavedScatterPair(metadata, ['HUFL', 'HULL'])).toBeNull();
    });

    it('ignores damaged storage and sources without a version identity', () => {
        sessionStorage.setItem('edatime_pair_plot_axes', '{');
        expect(restoreSavedScatterPair(metadata, metadata.numeric_columns)).toBeNull();
        rememberScatterPair(metadata, { x: 'OT', y: 'HULL' });
        expect(restoreSavedScatterPair({ ...metadata, source_version_id: undefined }, metadata.numeric_columns)).toBeNull();
    });
});
