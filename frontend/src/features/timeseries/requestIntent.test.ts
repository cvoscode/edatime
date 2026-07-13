import { describe, expect, it } from 'vitest';

import { resolveTimeseriesRequestIntent } from './requestIntent.js';

describe('resolveTimeseriesRequestIntent', () => {
    it('uses the workspace selection and complete viewport when present', () => {
        expect(resolveTimeseriesRequestIntent(
            {
                selection: { columns: ['HUFL', 'OT'], colorColumn: 'label' },
                viewport: { xMin: 100, xMax: 200, yMin: null, yMax: null },
            },
            { start: 0, end: 500 },
        )).toEqual({
            start: 100,
            end: 200,
            columns: ['HUFL', 'OT'],
            colorColumn: 'label',
            key: 'HUFL,OT|label',
        });
    });

    it('falls back independently for missing or non-finite workspace bounds', () => {
        expect(resolveTimeseriesRequestIntent(
            {
                selection: { columns: ['value'], colorColumn: null },
                viewport: { xMin: Number.NaN, xMax: null, yMin: null, yMax: null },
            },
            { start: 10, end: 20 },
        )).toMatchObject({
            start: 10,
            end: 20,
            columns: ['value'],
            colorColumn: null,
            key: 'value|null',
        });
    });

    it('does not expose the workspace selection array for callers to mutate', () => {
        const selection = ['value'];
        const intent = resolveTimeseriesRequestIntent(
            { selection: { columns: selection, colorColumn: null }, viewport: null },
            { start: 0, end: 1 },
        );

        intent.columns.push('other');
        expect(selection).toEqual(['value']);
    });
});
