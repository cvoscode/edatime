/**
 * colorPalettes — categorical color scales, gradient sampling, and color math.
 */

export const DISTRIBUTION_GROUP_COLORS = [
    '#4e79a7', '#f28e2c', '#e15759', '#76b7b2',
    '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
];
export const LOW_CARDINALITY_LIMIT = 8;

const fmt = new Intl.NumberFormat(undefined);

export { fmt };

function normalizeHexColor(hex: string): string {
    if (!hex.startsWith('#')) return '#000000';
    const clean = hex.replace('#', '');
    if (clean.length === 3) return '#' + clean.split('').map((c) => c + c).join('');
    if (clean.length !== 6) return '#000000';
    return '#' + clean.toLowerCase();
}

function clampColorChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = normalizeHexColor(hex).replace('#', '');
    return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16),
    };
}

export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
    return '#' + [r, g, b].map((v) => clampColorChannel(v).toString(16).padStart(2, '0')).join('');
}

export function sampleGradient(stops: string[], t: number): string {
    if (stops.length === 0) return '#888888';
    if (stops.length === 1) return stops[0];
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * (stops.length - 1);
    const lo = Math.floor(scaled);
    const hi = Math.min(lo + 1, stops.length - 1);
    const frac = scaled - lo;
    const a = hexToRgb(stops[lo]);
    const b = hexToRgb(stops[hi]);
    return rgbToHex({
        r: a.r + (b.r - a.r) * frac,
        g: a.g + (b.g - a.g) * frac,
        b: a.b + (b.b - a.b) * frac,
    });
}

export function computeColorExtent(values: number[] | null): { min: number; max: number } | null {
    if (!values || values.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (Number.isFinite(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    return min === Infinity ? null : { min, max };
}

export interface CategoricalColorGroups {
    groups: Map<string | number, string>;
    palette: string[];
}

export function getCategoryColor(index: number): string {
    return DISTRIBUTION_GROUP_COLORS[index % DISTRIBUTION_GROUP_COLORS.length];
}

export function buildCategoricalColorGroups(labels?: unknown[] | null): CategoricalColorGroups | null {
    if (!labels || labels.length === 0) return null;
    const uniqueValues = new Set<string | number>();
    for (const l of labels) {
        if (l !== null && l !== undefined) uniqueValues.add(l as string | number);
    }
    const groups = new Map<string | number, string>();
    let idx = 0;
    for (const v of uniqueValues) {
        groups.set(v, getCategoryColor(idx++));
    }
    return { groups, palette: DISTRIBUTION_GROUP_COLORS.slice(0, Math.min(idx, DISTRIBUTION_GROUP_COLORS.length)) };
}

export function paletteForScale(scale: string): string[] {
    switch (scale) {
        case 'viridis':
            return ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
        case 'plasma':
            return ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'];
        case 'inferno':
            return ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a'];
        case 'magma':
            return ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9fa6'];
        case 'blues':
            return ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'];
        case 'oranges':
            return ['#fff5eb', '#fdd0a2', '#fd8d3c', '#e6550d', '#a63603'];
        default:
            return ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f'];
    }
}