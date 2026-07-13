import { describe, expect, it } from 'vitest';
import { formatZoomRangeBadge } from './zoomRangeBadge.js';

describe('formatZoomRangeBadge', () => {
    it('formats a valid current range relative to its initial view', () => {
        expect(formatZoomRangeBadge({ xMin: 0, xMax: 100, yMin: null, yMax: null }, 25, 75)).toBe('Viewing 50%');
    });

    it('uses the placeholder for missing or degenerate ranges', () => {
        expect(formatZoomRangeBadge(null, 0, 100)).toBe('—');
        expect(formatZoomRangeBadge({ xMin: 1, xMax: 1, yMin: null, yMax: null }, 0, 1)).toBe('—');
    });
});
