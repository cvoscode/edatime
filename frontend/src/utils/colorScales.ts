/** Shared continuous color scales used consistently by charts and analytics. */
export type ColorScaleName = 'viridis' | 'plasma' | 'magma' | 'coolwarm' | 'inferno';

export const COLOR_SCALES: Record<ColorScaleName, readonly string[]> = {
    viridis: ['#440154','#482878','#3e4a89','#31688e','#26838f','#1f9d89','#35b779','#6ece58','#b5de2b','#fde725'],
    plasma: ['#0d0887','#5302a3','#8b0aa5','#b83289','#e16462','#fca636','#f0f921'],
    magma: ['#000004','#1b0c41','#4a0c6b','#781c6d','#a52c60','#cf4446','#f26b1d','#fca50a','#fca636','#fde725'],
    coolwarm: ['#3b4cc0','#6786d1','#9eb2de','#c9d3e8','#f7f7f7','#f4a582','#d6605a','#b2182b'],
    inferno: ['#000004','#1b0c41','#4a0c6b','#781c6d','#a52c60','#cf4446','#fca636','#fca50a','#fde725'],
};

export function isColorScaleName(value: string): value is ColorScaleName {
    return value in COLOR_SCALES;
}

export function paletteForColorScale(scale: string | null | undefined): readonly string[] {
    return scale && isColorScaleName(scale) ? COLOR_SCALES[scale] : COLOR_SCALES.viridis;
}

export function getColorFromScale(value: number, scale: ColorScaleName = 'viridis'): string {
    const colors = paletteForColorScale(scale);
    if (!Number.isFinite(value)) return colors[0]!;
    const clamped = Math.max(0, Math.min(1, value));
    const position = clamped * (colors.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(colors.length - 1, Math.ceil(position));
    const ratio = position - lower;
    return blendHex(colors[lower]!, colors[upper]!, ratio);
}

function blendHex(a: string, b: string, ratio: number): string {
    const parse = (value: string) => Number.parseInt(value.replace('#', ''), 16);
    const left = parse(a);
    const right = parse(b);
    const channels = [16, 8, 0].map((shift) => Math.round(((left >> shift) & 255) + ((((right >> shift) & 255) - ((left >> shift) & 255)) * ratio)));
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
