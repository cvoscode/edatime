import { describe, expect, it } from 'vitest';
import { toggleLegendSeriesVisibility } from './legendVisibilityPolicy.js';

describe('legend visibility policy', () => {
    it('toggles every expanded segment for the requested base series', () => {
        const series = [{ name: 'temp::low', visible: true }, { name: 'temp::high', visible: true }, { name: 'humidity', visible: true }];
        expect(toggleLegendSeriesVisibility(series, (name) => name.startsWith('temp::'), true))
            .toEqual([{ name: 'temp::low', visible: false }, { name: 'temp::high', visible: false }, series[2]]);
    });
});
