import { beforeEach, describe, expect, it } from 'vitest';
import {
    readHeatmapDisplayModes,
    writeHeatmapDiagonalMode,
    writeHeatmapPairMode,
} from './displayModes.js';

describe('correlation matrix display modes', () => {
    beforeEach(() => window.localStorage.clear());

    it('defaults to a KDE diagonal and pair density', () => {
        expect(readHeatmapDisplayModes()).toEqual({ diagonal: 'kde', pairs: 'density' });
    });

    it('restores the selected views independently', () => {
        writeHeatmapDiagonalMode('histogram');
        writeHeatmapPairMode('scatter');

        expect(readHeatmapDisplayModes()).toEqual({ diagonal: 'histogram', pairs: 'scatter' });
    });

    it('falls back safely when stored values are invalid', () => {
        window.localStorage.setItem('edatime_heatmap_diagonal_mode', 'boxplot');
        window.localStorage.setItem('edatime_heatmap_pair_mode', 'hexbin');

        expect(readHeatmapDisplayModes()).toEqual({ diagonal: 'kde', pairs: 'density' });
    });
});
