import { describe, expect, it } from 'vitest';

import { parseSessionSnapshot } from './sessionSnapshot.js';

const valid = {
    version: 1,
    timestamp: 1_700_000_000_000,
    page: 'fft',
    selectedCols: ['a', 'b'],
    seriesColors: { a: '#ff0000' },
    columnRanges: { a: { from: 0, to: 10 } },
    adaptiveLineFilters: [{ id: 'f1', column: 'a', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true }],
    currentStart: 100,
    currentEnd: 200,
    selectedColorColumn: null,
    chartText: { title: 'T', xLabel: 'X', yLabel: 'Y' },
    rollingEnabled: true,
    rollingWindow: 50,
    rollingDisplayMode: 'both',
    anomalyEnabled: false,
    anomalyMethod: 'zscore',
    anomalyThreshold: 3,
    scatterX: 'a',
    scatterY: 'b',
    scatterColorColumn: '',
    scatterRenderMode: 'density',
    datasetRevision: 2,
};

describe('parseSessionSnapshot', () => {
    it('round-trips a well-formed snapshot', () => {
        expect(parseSessionSnapshot(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
    });

    it('rejects anything that is not a version-1 object', () => {
        for (const bad of [null, undefined, 'x', 7, [], { version: 2 }, {}]) {
            expect(parseSessionSnapshot(bad)).toBeNull();
        }
    });

    it('drops fields of the wrong type instead of passing them through', () => {
        const parsed = parseSessionSnapshot({
            version: 1,
            selectedCols: 'a',
            rollingWindow: '50',
            rollingEnabled: 'yes',
            currentStart: 'soon',
            chartText: 'title',
            rollingDisplayMode: 'sparkly',
            datasetRevision: Number.NaN,
        });
        expect(parsed).toEqual({ version: 1 });
    });

    it('keeps only valid entries inside collections', () => {
        const parsed = parseSessionSnapshot({
            version: 1,
            selectedCols: ['a', 3, null, 'b'],
            seriesColors: { a: '#fff', b: 4 },
            columnRanges: { good: { from: 1, to: 2 }, bad: { from: 'x', to: 2 }, worse: 7 },
            adaptiveLineFilters: [
                { column: 'a', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: false },
                { column: 'a', x1: 0, y1: 0, x2: 1, keepAbove: false },
                'nope',
            ],
        });
        expect(parsed?.selectedCols).toEqual(['a', 'b']);
        expect(parsed?.seriesColors).toEqual({ a: '#fff' });
        expect(parsed?.columnRanges).toEqual({ good: { from: 1, to: 2 } });
        expect(parsed?.adaptiveLineFilters).toHaveLength(1);
    });

    it('distinguishes an explicit null viewport bound from a missing one', () => {
        expect(parseSessionSnapshot({ version: 1, currentStart: null })).toEqual({ version: 1, currentStart: null });
        expect(parseSessionSnapshot({ version: 1 })).not.toHaveProperty('currentStart');
    });

    it('does not let a __proto__ key pollute the result', () => {
        const parsed = parseSessionSnapshot(JSON.parse('{"version":1,"seriesColors":{"__proto__":"x","a":"#fff"}}'));
        expect(({} as Record<string, unknown>).x).toBeUndefined();
        expect(Object.getPrototypeOf(parsed?.seriesColors)).toBe(Object.prototype);
    });
});
