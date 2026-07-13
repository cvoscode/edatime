import { describe, expect, it } from 'vitest';
import { buildScatterColorbarPresentation } from './colorbarPresentation.js';

describe('scatter colorbar presentation', () => {
    it('describes density colorbars independently of selected columns', () => {
        expect(buildScatterColorbarPresentation({ activeView: 'plot', renderMode: 'density', colormap: 'magma', colorScale: 'viridis', selectedColorColumn: null, colorValues: null, colorMin: null, colorMax: null, cardinality: null })).toEqual({ visible: true, name: 'Density (magma)', minLabel: 'Low', maxLabel: 'High', cardinalityLabel: null });
    });

    it('shows continuous range and bucketed category context', () => {
        const model = buildScatterColorbarPresentation({ activeView: 'plot', renderMode: 'points', colormap: 'magma', colorScale: 'viridis', selectedColorColumn: 'value', colorValues: [1, 2], colorMin: 1, colorMax: 2, cardinality: { used: 8, bucketed: 3 } });
        expect(model).toMatchObject({ visible: true, name: 'value (viridis)', minLabel: '1.00', maxLabel: '2.00', cardinalityLabel: '8 shown · 3 other' });
    });
});
