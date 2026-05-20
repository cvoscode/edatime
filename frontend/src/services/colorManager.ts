/**
 * Color Manager Service
 * Centralizes all color logic: palette selection, series coloring,
 * continuous/categorical color scales, and null-value handling.
 */
import type { ColorScaleName } from '../utils/colorScale';
import {
    getColorPalette,
    sampleGradient,
    buildCategoricalColorGroups,
} from '../utils/colorScale';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of buildColorScale — a array of sampled stops for a continuous scale */
export interface ContinuousColorInfo {
    values: number[];
    colors: string[];
}

// ---------------------------------------------------------------------------
// 1. Palette access
// ---------------------------------------------------------------------------

/**
 * Return `count` hex colors from the named scale.
 * If `count` exceeds the scale's built-in palette size, the palette is rotated
 * with decreasing opacity so that distinct "recycled" colors remain distinguishable.
 */
export function getPalette(scale: ColorScaleName, count: number): string[] {
    if (count <= 0) return [];
    const base = getColorPalette(scale, count);
    if (base.length >= count) return base.slice(0, count);

    // Exhausted the palette — cycle with lowered opacity
    const result: string[] = [...base];
    let cycleIndex = 0;
    while (result.length < count) {
        const opacity = Math.max(0.3, 1.0 - (cycleIndex + 1) * 0.15);
        const original = base[cycleIndex % base.length];
        result.push(withOpacity(original, opacity));
        cycleIndex++;
    }
    return result;
}

// ---------------------------------------------------------------------------
// 2. Series colors
// ---------------------------------------------------------------------------

/**
 * Assign one hex color to each column name.
 * - Custom colors supplied in `customColors` are used as-is for matching columns.
 * - Remaining columns receive colors from a viridis palette, rotating as needed.
 */
export function assignSeriesColors(
    columns: string[],
    customColors?: Record<string, string>
): Record<string, string> {
    const assigned: Record<string, string> = {};

    // First, apply custom colors for every column that has one
    for (const col of columns) {
        if (customColors?.[col]) {
            assigned[col] = customColors[col];
        }
    }

    // Now fill the rest from the palette
    const unassigned = columns.filter(c => !assigned[c]);
    const palette = getPalette('viridis', unassigned.length);
    for (let i = 0; i < unassigned.length; i++) {
        assigned[unassigned[i]] = palette[i];
    }

    return assigned;
}

// ---------------------------------------------------------------------------
// 3. Continuous color scale (scatter color-by-column)
// ---------------------------------------------------------------------------

/**
 * Build a sampled color array for a continuous numeric color column.
 *
 * @param colorValues  Raw color-column values (may contain null / non-finite)
 * @param colorMin     User-provided or auto-detected minimum (null → auto)
 * @param colorMax     User-provided or auto-detected maximum (null → auto)
 * @param scale        Named color scale
 * @returns            `{ values, colors }` with one color per unique finite value,
 *                     or `null` when there are no usable values.
 */
export function buildColorScale(
    colorValues: number[] | null,
    colorMin: number | null,
    colorMax: number | null,
    scale: ColorScaleName
): ContinuousColorInfo | null {
    if (!colorValues || colorValues.length === 0) return null;

    // Collect finite values and auto-range if needed
    const finite = colorValues.filter(v => Number.isFinite(v));
    if (finite.length === 0) return null;

    const min = colorMin !== null ? colorMin : Math.min(...finite);
    const max = colorMax !== null ? colorMax : Math.max(...finite);

    // Single-color edge case
    if (min === max) {
        const singleColor = getColorPalette(scale, 1)[0];
        return { values: [min], colors: [singleColor] };
    }

    // Sample the scale at a reasonable number of stops
    const STOPS = 16;
    const stops = getColorPalette(scale, STOPS);
    const domain = [min, max];

    // Map each unique finite value to a colour
    const uniqueVals = [...new Set(finite)].sort((a, b) => a - b);
    const colors = uniqueVals.map(v => {
        const t = (v - domain[0]) / (domain[1] - domain[0]);
        return sampleGradient(stops, t);
    });

    return { values: uniqueVals, colors };
}

// ---------------------------------------------------------------------------
// 4. Categorical color scale
// ---------------------------------------------------------------------------

/**
 * Build a colour-per-category map from an array of raw values.
 *
 * @param values  Raw column values (may contain null / empty strings)
 * @returns       `{ categories, colorMap, missing }` where `missing` is the
 *                colour used for null / blank entries, or `null` if none exist.
 */
export function categorizeColors(
    values: (string | null)[]
): { categories: string[]; colorMap: Record<string, string>; missing: string | null } {
    const groups = buildCategoricalColorGroups(values);
    if (!groups) {
        return { categories: [], colorMap: {}, missing: null };
    }

    const colorMap: Record<string, string> = {};
    for (const [label, color] of groups.colorByLabel) {
        colorMap[label] = color;
    }

    // The 'Missing' label (null / blank inputs) gets the last colour in the
    // rotation, or null if there was no null entry.
    const missing = colorMap['Missing'] ?? null;

    return { categories: groups.categories, colorMap, missing };
}

// ---------------------------------------------------------------------------
// 5. Resolve colour for a single value
// ---------------------------------------------------------------------------

/** Arguments for resolving a continuous numeric value */
export interface ResolveContinuousArgs {
    value: number;
    colorMin: number;
    colorMax: number;
    scale: ColorScaleName;
}

/** Arguments for resolving a categorical string value */
export interface ResolveCategoricalArgs {
    value: string | null;
    categories: string[];
    colorMap: Record<string, string>;
    missing: string | null;
}

/**
 * Return the hex colour for a single value given the appropriate scale info.
 *
 * @param scale            'continuous' or 'categorical'
 * @param continuousInfo    Required when scale === 'continuous'
 * @param categoricalInfo   Required when scale === 'categorical'
 */
export function resolveColorForValue(
    value: number | string,
    scale: 'continuous' | 'categorical',
    continuousInfo?: ResolveContinuousArgs,
    categoricalInfo?: ResolveCategoricalArgs
): string {
    if (scale === 'continuous' && continuousInfo) {
        const { value: v, colorMin, colorMax, scale: sc } = continuousInfo;
        if (!Number.isFinite(v) || colorMin === colorMax) {
            return getColorPalette(sc, 1)[0];
        }
        const t = (v - colorMin) / (colorMax - colorMin);
        const stops = getColorPalette(sc, 16);
        return sampleGradient(stops, Math.max(0, Math.min(1, t)));
    }

    if (scale === 'categorical' && categoricalInfo) {
        const { value: v, colorMap, missing } = categoricalInfo;
        if (v === null || v === undefined || v.trim() === '') {
            return missing ?? '#888888';
        }
        return colorMap[v.trim()] ?? '#888888';
    }

    // Fallback
    return '#888888';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Apply a decimal opacity to a hex colour. */
function withOpacity(hex: string, opacity: number): string {
    const clean = String(hex).replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean;

    const r = parseInt(full, 16) >> 16 & 255;
    const g = parseInt(full, 16) >> 8 & 255;
    const b = parseInt(full, 16) & 255;

    const toHex = (v: number) =>
        Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

    const blendedR = r + (255 - r) * (1 - opacity);
    const blendedG = g + (255 - g) * (1 - opacity);
    const blendedB = b + (255 - b) * (1 - opacity);

    return `#${toHex(blendedR)}${toHex(blendedG)}${toHex(blendedB)}`;
}