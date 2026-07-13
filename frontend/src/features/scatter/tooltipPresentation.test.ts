import { describe, expect, it } from 'vitest';
import { buildScatterTooltipHtml } from './tooltipPresentation.js';

describe('scatter tooltip presentation', () => {
    it('formats and escapes point and categorical color values', () => {
        const html = buildScatterTooltipHtml({ xColumn: 'x<', yColumn: 'y', colorColumn: 'group', point: [1.234, 5.678], seriesName: 'A&B', dataIndex: 0, xSpan: 10, ySpan: 10, columnTypes: new Map(), colorLabels: ['A&B'], colorValues: null });
        expect(html).toContain('x&lt;');
        expect(html).toContain('A&amp;B');
    });

    it('includes a finite continuous color value', () => {
        const html = buildScatterTooltipHtml({ xColumn: 'x', yColumn: 'y', colorColumn: 'score', point: [1, 2], seriesName: null, dataIndex: 1, xSpan: 1, ySpan: 1, columnTypes: new Map(), colorLabels: null, colorValues: [0.1, 0.25] });
        expect(html).toContain('score');
        expect(html).toContain('0.25');
    });
});
