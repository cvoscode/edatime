import { describe, expect, it } from 'vitest';
import { formatFftTooltip } from './fftTooltipPresentation.js';

describe('formatFftTooltip', () => {
    it('renders scaled, pre-scale, and raw spectral values', () => {
        const html = formatFftTooltip({ value: [0.01, 2], seriesName: 'OT', dataIndex: 0, series: { _preLog: [1.5], _raw: [31.6] } }, { xMax: 1, unit: 'Hz', scaleMode: 'minmax', scaleLabel: 'Min-max' });
        expect(html).toContain('OT');
        expect(html).toContain('pre-scale');
        expect(html).toContain('raw');
    });
});
