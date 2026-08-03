import { getPlotColorScale } from '../../utils/settings.js';
import { getColorFromScale, paletteForColorScale, type ColorScaleName } from '../../utils/colorScales.js';

export function correlationColor(value: number, maxAbs = 1): string {
    const domain = Math.max(1e-6, maxAbs);
    const clamped = Math.max(-1, Math.min(1, value / domain));
    return getColorFromScale((clamped + 1) / 2, getPlotColorScale('correlationMatrix'));
}

export function correlationScaleGradient(scale: ColorScaleName = getPlotColorScale('correlationMatrix')): string {
    return `linear-gradient(180deg, ${[...paletteForColorScale(scale)].reverse().join(',')})`;
}

export function getColorDomainMax(data: (number | null)[][], fitAxis: boolean): number {
    if (!fitAxis) return 1;
    let maxAbs = 0;
    for (let row = 0; row < data.length; row++) {
        for (let col = 0; col < data[row]!.length; col++) {
            if (row === col) continue;
            const value = data[row]![col];
            if (value != null && Number.isFinite(value)) maxAbs = Math.max(maxAbs, Math.abs(value));
        }
    }
    return maxAbs || 1;
}

export function formatScaleTick(value: number): string {
    return Math.abs(value) >= 1 ? value.toFixed(1) : value.toFixed(2);
}

export function correlationToneClass(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'heatmap-cell--missing';
    if (value > 0.08) return 'heatmap-cell--positive';
    if (value < -0.08) return 'heatmap-cell--negative';
    return 'heatmap-cell--neutral';
}

export function correlationTextColor(value: number | null, maxAbs = 1): string {
    if (value === null || !Number.isFinite(value)) return 'var(--text-dim)';
    const hex = correlationColor(value, maxAbs).replace('#', '');
    const [red, green, blue] = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    return luminance < 0.54 ? '#FFFFFF' : '#15202B';
}

export function escapeHtmlAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
