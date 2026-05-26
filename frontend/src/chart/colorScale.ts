/**
 * Color-scale helpers: per-segment colorized series using user-selected colormap.
 * buildColorizedSeries batches adjacent points with similar colors into longer
 * segments to avoid creating thousands of individual ChartGPU series.
 */

import { getSetting, COLOR_SCALES, type ColorScaleName } from '../utils/settings.js';
export { COLOR_SCALES as VIRIDIS } from '../utils/settings.js';
import { getSeriesColor } from '../state.js';

/** Build RGB arrays for each scale from COLOR_SCALES. */
const _SCALE_RGB: Record<ColorScaleName, [number, number, number][]> = {
    viridis: (COLOR_SCALES.viridis as readonly string[]).map(_hexToRgb),
    plasma: (COLOR_SCALES.plasma as readonly string[]).map(_hexToRgb),
    magma: (COLOR_SCALES.magma as readonly string[]).map(_hexToRgb),
    coolwarm: (COLOR_SCALES.coolwarm as readonly string[]).map(_hexToRgb),
    inferno: (COLOR_SCALES.inferno as readonly string[]).map(_hexToRgb),
};

function _hexToRgb(hex: string): [number, number, number] {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}

/** Get the user's preferred colormap name. */
const _userScale = (): ColorScaleName => getSetting('colorScale');

/** Interpolate a color from the active colormap for t ∈ [0, 1]. */
export function getInterpolatedColor(t: number, scaleName?: ColorScaleName): string {
    const scale = scaleName ?? _userScale();
    if (!Number.isFinite(t)) return (COLOR_SCALES.viridis as readonly string[])[0];
    const clamped = Math.max(0, Math.min(1, t));
    const rgbArr = _SCALE_RGB[scale] ?? _SCALE_RGB.viridis;
    const scaled = clamped * (rgbArr.length - 1);
    const lo = Math.floor(scaled);
    const hi = Math.min(rgbArr.length - 1, lo + 1);
    const w = scaled - lo;
    const a = rgbArr[lo];
    const b = rgbArr[hi];
    const r = Math.round(a[0] + (b[0] - a[0]) * w);
    const g = Math.round(a[1] + (b[1] - a[1]) * w);
    const bv = Math.round(a[2] + (b[2] - a[2]) * w);
    return `rgb(${r},${g},${bv})`;
}

/** Number of color buckets for batching segments. */
const COLOR_BUCKETS = 64;

/** Pre-compute a palette of COLOR_BUCKETS colors per active scale. */
const _bucketPalettes: Record<ColorScaleName, string[]> = {
    viridis: [],
    plasma: [],
    magma: [],
    coolwarm: [],
    inferno: [],
};
for (const scale of Object.keys(_bucketPalettes) as ColorScaleName[]) {
    const arr = _SCALE_RGB[scale];
    for (let i = 0; i < COLOR_BUCKETS; i++) {
        const t = i / (COLOR_BUCKETS - 1);
        const scaled = t * (arr.length - 1);
        const lo = Math.floor(scaled);
        const hi = Math.min(arr.length - 1, lo + 1);
        const w = scaled - lo;
        const a = arr[lo];
        const b = arr[hi];
        const r = Math.round(a[0] + (b[0] - a[0]) * w);
        const g = Math.round(a[1] + (b[1] - a[1]) * w);
        const bv = Math.round(a[2] + (b[2] - a[2]) * w);
        _bucketPalettes[scale].push(`rgb(${r},${g},${bv})`);
    }
}

function _bucketPalette(scale: ColorScaleName): string[] {
    return _bucketPalettes[scale] ?? _bucketPalettes.viridis;
}

function _bucketIndex(value: number, min: number, span: number): number {
    if (span <= 0) return 0;
    const t = Math.max(0, Math.min(1, (value - min) / span));
    return Math.max(0, Math.min(COLOR_BUCKETS - 1, Math.floor(t * (COLOR_BUCKETS - 1) + 0.5)));
}

export interface ColorScaleInfo {
    isNumeric: boolean;
    min: number | null;
    max: number | null;
    categories: string[];
}

export function analyzeColorValues(values: unknown[]): ColorScaleInfo | null {
    if (!Array.isArray(values) || values.length === 0) return null;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let numericCount = 0;
    let nonNumericCount = 0;
    const uniqueValues = new Set<string>();
    const sampleSize = Math.min(values.length, 1000);

    for (let i = 0; i < sampleSize; i++) {
        const raw = values[i];
        if (raw == null) continue;
        uniqueValues.add(String(raw));
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) numericCount += 1;
        else nonNumericCount += 1;
    }

    const isNumeric = numericCount > 0 && nonNumericCount === 0;
    if (isNumeric) {
        for (const v of values) {
            const n = Number(v);
            if (!Number.isFinite(n)) continue;
            if (n < min) min = n;
            if (n > max) max = n;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        return { isNumeric: true, min, max, categories: [] };
    }

    const categories: string[] = [];
    for (const v of uniqueValues) categories.push(v);
    return { isNumeric: false, min: null, max: null, categories };
}

export function colorForScaleValue(rawValue: unknown, scaleInfo: ColorScaleInfo, scaleName?: ColorScaleName): string | null {
    if (!scaleInfo) return null;
    if (scaleInfo.isNumeric) {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) return null;
        const span = (scaleInfo.max as number) - (scaleInfo.min as number);
        const t = span > 0 ? (numeric - (scaleInfo.min as number)) / span : 0;
        return getInterpolatedColor(t, scaleName);
    }
    const index = scaleInfo.categories.indexOf(String(rawValue ?? ''));
    return getSeriesColor(String(rawValue ?? ''), index >= 0 ? index : scaleInfo.categories.length);
}

export function categoryColorFor(label: string, categories: string[]): string {
    const index = categories.indexOf(label);
    return getSeriesColor(label, index >= 0 ? index : categories.length);
}

export interface ColorizedResult {
    series: any[];
    annotations: any[];
}

export function buildColorizedSeries(
    colName: string,
    points: [number, number][],
    colorValues: unknown[],
    scaleInfo: ColorScaleInfo,
    visible: boolean,
    showMarkers: boolean,
): ColorizedResult {
    const series: any[] = [];
    const annotations: any[] = [];
    if (!Array.isArray(points) || points.length === 0 || !Array.isArray(colorValues) || !scaleInfo) {
        return { series, annotations };
    }

    if (points.length === 1) {
        const pointColor = colorForScaleValue(colorValues[0], scaleInfo) || getSeriesColor(colName, 0);
        series.push({ type: 'line', name: colName, color: pointColor, visible, data: [points[0], points[0]] });
        if (showMarkers && visible) {
            annotations.push({ type: 'point', x: points[0][0], y: points[0][1], layer: 'aboveSeries', marker: { symbol: 'circle', size: 5, style: { color: pointColor } } });
        }
        return { series, annotations };
    }

    const scaleName = _userScale();

    if (scaleInfo.isNumeric) {
        const min = scaleInfo.min as number;
        const span = (scaleInfo.max as number) - min;
        const buckets = new Uint8Array(points.length);
        for (let i = 0; i < points.length; i++) {
            const v = Number(colorValues[i]);
            buckets[i] = Number.isFinite(v) ? _bucketIndex(v, min, span) : 0;
        }

        const palette = _bucketPalette(scaleName);
        let segIdx = 0;
        let runStart = 0;
        while (runStart < points.length) {
            const bucket = buckets[runStart];
            let runEnd = runStart + 1;
            while (runEnd < points.length && buckets[runEnd] === bucket) runEnd++;

            const segEnd = Math.min(runEnd, points.length);
            const segData: [number, number][] = [];
            for (let j = runStart; j < segEnd; j++) segData.push(points[j]);
            if (segEnd < points.length) segData.push(points[segEnd]);

            const color = palette[bucket];
            series.push({
                type: 'line',
                name: segIdx === 0 ? colName : `__color_segment__${colName}::${segIdx}`,
                color,
                visible,
                showInLegend: false,
                data: segData,
            });
            segIdx++;
            runStart = runEnd;
        }
    } else {
        const labels = colorValues.map((v) => String(v ?? ''));
        let segIdx = 0;
        let runStart = 0;
        while (runStart < labels.length) {
            const label = labels[runStart];
            let runEnd = runStart + 1;
            while (runEnd < labels.length && labels[runEnd] === label) runEnd++;

            const segEnd = Math.min(runEnd, points.length);
            const segData: [number, number][] = [];
            for (let j = runStart; j < segEnd; j++) segData.push(points[j]);
            if (segEnd < points.length) segData.push(points[segEnd]);

            const color = categoryColorFor(label, scaleInfo.categories);
            series.push({
                type: 'line',
                name: segIdx === 0 ? colName : `__color_segment__${colName}::${segIdx}`,
                color,
                visible,
                showInLegend: false,
                data: segData,
            });
            segIdx++;
            runStart = runEnd;
        }
    }

    if (showMarkers && visible && points.length <= 500) {
        for (let i = 0; i < points.length; i++) {
            const pointColor = colorForScaleValue(colorValues[i], scaleInfo, scaleName) || getSeriesColor(colName, 0);
            annotations.push({ type: 'point', x: points[i][0], y: points[i][1], layer: 'aboveSeries', marker: { symbol: 'circle', size: 5, style: { color: pointColor } } });
        }
    }

    return { series, annotations };
}

export function baseSeriesName(name: string): string {
    const text = String(name || '');
    if (!text) return '';
    if (text.endsWith('__markers')) return text.slice(0, -'__markers'.length);
    if (text.startsWith('__color_segment__')) {
        const body = text.slice('__color_segment__'.length);
        return body.split('::')[0] || '';
    }
    if (text.startsWith('__color_markers__')) {
        const body = text.slice('__color_markers__'.length);
        return body.split('::')[0] || '';
    }
    return text;
}