import { describe, expect, it } from 'vitest';
import { buildHeatmapCellPresentation } from './cellPresentation.js';

describe('heatmap cell presentation', () => {
    it('formats an interactive negative correlation accessibly', () => {
        const cell = buildHeatmapCellPresentation({ value: -0.64, colorDomainMax: 1, rowName: 'temperature', columnName: 'pressure', interactive: true });

        expect(cell).toMatchObject({ toneClass: 'heatmap-cell--negative', signedValue: '−0.64', textColor: '#15202B', interactive: true });
        expect(cell.tooltip).toContain('click to explore in Scatter');
    });

    it('formats missing and diagonal values without an interaction affordance', () => {
        const cell = buildHeatmapCellPresentation({ value: null, colorDomainMax: 1, rowName: 'temperature', columnName: 'temperature', interactive: false });

        expect(cell).toMatchObject({ toneClass: 'heatmap-cell--missing', signedValue: '—', background: 'transparent', interactive: false });
        expect(cell.tooltip).not.toContain('click to explore');
    });
});
