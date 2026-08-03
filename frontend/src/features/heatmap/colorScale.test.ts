import { describe, expect, it } from 'vitest';
import { correlationColor, correlationScaleGradient, correlationTextColor, correlationToneClass, escapeHtmlAttribute, formatScaleTick, getColorDomainMax } from './colorScale.js';

describe('heatmap color scale', () => {
    it('maps correlation direction and fitted domains deterministically', () => {
        expect(correlationColor(1)).toBe('#b2182b');
        expect(correlationColor(-1)).toBe('#3b4cc0');
        expect(correlationScaleGradient()).toContain('#b2182b');
        expect(getColorDomainMax([[1, 0.4], [0.4, 1]], false)).toBe(1);
        expect(getColorDomainMax([[1, 0.4], [0.4, 1]], true)).toBe(0.4);
        expect(formatScaleTick(0.4)).toBe('0.40');
    });

    it('provides semantic cell presentation and escaped attributes', () => {
        expect(correlationToneClass(null)).toBe('heatmap-cell--missing');
        expect(correlationToneClass(-0.2)).toBe('heatmap-cell--negative');
        expect(correlationTextColor(0.6)).toBe('#15202B');
        expect(escapeHtmlAttribute('A & "B"')).toBe('A &amp; &quot;B&quot;');
    });
});
