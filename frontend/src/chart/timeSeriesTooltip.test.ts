import { describe, expect, it } from 'vitest';
import { formatTimeSeriesTooltip } from './timeSeriesTooltip.js';

describe('formatTimeSeriesTooltip', () => {
    it('groups segmented series by base name and escapes visible labels', () => {
        const result = formatTimeSeriesTooltip([
            { seriesName: '__color_segment__temperature::low', value: [1_000, 1.25] },
            { seriesName: '__color_segment__temperature::high', value: [1_000, 2.5] },
            { seriesName: '<humidity>', value: [1_000, 3] },
        ], { min: 0, max: 2_000 });

        expect(result).toContain('temperature');
        expect(result).toContain('&lt;humidity&gt;');
        expect(result).toContain('1.25');
        expect(result).not.toContain('2.50');
    });

    it('returns no markup when no named series entry is available', () => {
        expect(formatTimeSeriesTooltip([{ value: [1_000, 1] }], { min: 0, max: 2_000 })).toBe('');
    });
});
