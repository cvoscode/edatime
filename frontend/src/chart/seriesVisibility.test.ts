import { describe, expect, it } from 'vitest';
import { getVisibilityByBaseName } from './seriesVisibility.js';

describe('series visibility', () => {
    it('groups expanded series by their base name and preserves hidden state', () => {
        const result = getVisibilityByBaseName([
            { name: 'temp [low]', visible: false },
            { name: 'temp [high]' },
            { name: 'pressure' },
        ], (name) => name.replace(/ \[[^\]]+\]$/, ''));
        expect(Array.from(result.entries())).toEqual([['temp', true], ['pressure', true]]);
    });

    it('returns no state for non-series input', () => {
        expect(getVisibilityByBaseName(null, (name) => name)).toEqual(new Map());
    });
});
