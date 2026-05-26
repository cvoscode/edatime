import { describe, expect, it } from 'vitest';

import { buildMatrixFetchPairs } from './matrix.js';

describe('buildMatrixFetchPairs', () => {
    it('prioritizes the active pair before the rest of the matrix', () => {
        const pairs = buildMatrixFetchPairs(
            ['HUFL', 'HULL', 'OT'],
            { x: 'HUFL', y: 'HULL' },
            [{ column: 'OT' }],
        );

        expect(pairs[0]).toEqual(['HUFL', 'HULL']);
        expect(pairs[1]).toEqual(['HULL', 'HUFL']);
    });

    it('promotes suggested columns ahead of unrelated cells', () => {
        const pairs = buildMatrixFetchPairs(
            ['HUFL', 'HULL', 'OT', 'MUFL'],
            { x: 'HUFL', y: 'HULL' },
            [{ column: 'OT' }],
        );

        const otWithCurrentAxis = pairs.findIndex(([column, row]) => (
            (column === 'HUFL' && row === 'OT')
            || (column === 'OT' && row === 'HUFL')
            || (column === 'HULL' && row === 'OT')
            || (column === 'OT' && row === 'HULL')
        ));
        const unrelatedPair = pairs.findIndex(([column, row]) => column === 'MUFL' && row === 'OT');

        expect(otWithCurrentAxis).toBeGreaterThanOrEqual(0);
        expect(unrelatedPair).toBeGreaterThan(otWithCurrentAxis);
    });
});