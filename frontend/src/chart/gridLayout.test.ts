import { describe, expect, it } from 'vitest';

import { computeChartGrid } from './gridLayout.js';

describe('computeChartGrid', () => {
    it('shrinks the left gutter for compact y labels and expands when a y-axis title exists', () => {
        const compact = computeChartGrid({
            yTickLabels: ['113.76', '81.49', '49.21'],
            yAxisLabel: '',
            scale: 1,
        });
        const titled = computeChartGrid({
            yTickLabels: ['113.76', '81.49', '49.21'],
            yAxisLabel: 'Temperature',
            scale: 1,
        });

        expect(compact.left).toBeLessThan(120);
        expect(compact.left).toBeGreaterThanOrEqual(80);
        expect(compact.top).toBeGreaterThanOrEqual(24);
        expect(titled.left).toBeGreaterThan(compact.left);
    });
});
