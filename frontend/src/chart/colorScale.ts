/**
 * Color-scale helpers: VIRIDIS gradient, category colors, color-segment
 * building for time-series color-by-column rendering.
 *
 * Performance-critical: buildColorizedSeries now batches adjacent points
 * with similar colors into longer line segments to avoid creating thousands
 * of individual ChartGPU series.
 */

import { getSeriesColor } from '../state.js';

export const VIRIDIS = ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'] as const;

// Pre-parsed VIRIDIS RGB for fast interpolation
const VIRIDIS_RGB: [number, number, number][] = (VIRIDIS as readonly string[]).map((hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
]);

export function getInterpolatedColor(t: number): string {
    if (!Number.isFinite(t)) return VIRIDIS[0];
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * (VIRIDIS_RGB.length - 1);
    const leftIndex = Math.floor(scaled);
    const rightIndex = Math.min(VIRIDIS_RGB.length - 1, leftIndex + 1);
    const weight = scaled - leftIndex;
    const left = VIRIDIS_RGB[leftIndex];
    const right = VIRIDIS_RGB[rightIndex];
    const r = Math.round(left[0] + (right[0] - left[0]) * weight);
    const g = Math.round(left[1] + (right[1] - left[1]) * weight);
    const b = Math.round(left[2] + (right[2] - left[2]) * weight);
    return `rgb(${r}, ${g}, ${b})`;
}

/** Number of color buckets for batching segments. */
const COLOR_BUCKETS = 64;

/** Pre-compute a palette of COLOR_BUCKETS evenly-spaced colors. */
const _bucketPalette: string[] = [];
for (let i = 0; i < COLOR_BUCKETS; i++) {
    _bucketPalette.push(getInterpolatedColor(i / (COLOR_BUCKETS - 1)));
}

function bucketIndexForValue(value: number, min: number, span: number): number {
    if (span <= 0) return 0;
    const t = (value - min) / span;
    return Math.max(0, Math.min(COLOR_BUCKETS - 1, Math.floor(t * (COLOR_BUCKETS - 1) + 0.5)));
}

export function categoryColorFor(label: string, categories: string[]): string {
    const index = categories.indexOf(label);
    return getSeriesColor(label, index >= 0 ? index : categories.length);
}

export interface ColorScaleInfo {
    isNumeric: boolean;
    min: number | null;
    max: number | null;
    categories: string[];
}

export function analyzeColorValues(values: unknown[]): ColorScaleInfo | null {
    if (!Array.isArray(values) || values.length === 0) return null;

    const uniqueValues = new Set<string>();
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let numericCount = 0;
    let nonNumericCount = 0;
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
        for (let i = 0; i < values.length; i++) {
            const value = Number(values[i]);
            if (!Number.isFinite(value)) continue;
            if (value < min) min = value;
            if (value > max) max = value;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        return { isNumeric: true, min, max, categories: [] };
    }

    const categories: string[] = [];
    for (const value of uniqueValues) categories.push(value);
    return { isNumeric: false, min: null, max: null, categories };
}

export function colorForScaleValue(rawValue: unknown, scaleInfo: ColorScaleInfo): string | null {
    if (!scaleInfo) return null;
    if (scaleInfo.isNumeric) {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) return null;
        const span = (scaleInfo.max as number) - (scaleInfo.min as number);
        const t = span > 0 ? (numeric - (scaleInfo.min as number)) / span : 0;
        return getInterpolatedColor(t);
    }
    return categoryColorFor(String(rawValue), scaleInfo.categories);
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

    // ── Batched color-segment building ──
    // Group consecutive points that map to the same color bucket into a single
    // series segment.  This reduces the number of ChartGPU series from O(N) to
    // O(COLOR_BUCKETS) in the typical case, dramatically improving render perf.

    if (scaleInfo.isNumeric) {
        const min = scaleInfo.min as number;
        const span = (scaleInfo.max as number) - min;

        // Assign bucket index to each point
        const buckets = new Uint8Array(points.length);
        for (let i = 0; i < points.length; i++) {
            const v = Number(colorValues[i]);
            buckets[i] = Number.isFinite(v) ? bucketIndexForValue(v, min, span) : 0;
        }

        // Walk through and batch consecutive same-bucket runs
        let segIdx = 0;
        let runStart = 0;
        while (runStart < points.length) {
            const bucket = buckets[runStart];
            let runEnd = runStart + 1;
            while (runEnd < points.length && buckets[runEnd] === bucket) runEnd++;

            // Include the point before and after for continuity (overlap by 1)
            const segStart = runStart;
            const segEnd = Math.min(runEnd, points.length);
            const segData: [number, number][] = [];
            for (let j = segStart; j < segEnd; j++) segData.push(points[j]);
            // Bridge to next segment: include first point of next run
            if (segEnd < points.length) segData.push(points[segEnd]);

            const color = _bucketPalette[bucket];
            series.push({
                type: 'line',
                name: segIdx === 0 ? colName : `__color_segment__${colName}::${segIdx}`,
                color,
                visible,
                showInLegend: segIdx === 0,
                data: segData,
            });
            segIdx++;
            runStart = runEnd;
        }
    } else {
        // Categorical: group consecutive same-category runs
        const labels = colorValues.map((v) => String(v ?? ''));
        let segIdx = 0;
        let runStart = 0;
        while (runStart < labels.length) {
            const label = labels[runStart];
            let runEnd = runStart + 1;
            while (runEnd < labels.length && labels[runEnd] === label) runEnd++;

            const segStart = runStart;
            const segEnd = Math.min(runEnd, points.length);
            const segData: [number, number][] = [];
            for (let j = segStart; j < segEnd; j++) segData.push(points[j]);
            if (segEnd < points.length) segData.push(points[segEnd]);

            const color = categoryColorFor(label, scaleInfo.categories);
            series.push({
                type: 'line',
                name: segIdx === 0 ? colName : `__color_segment__${colName}::${segIdx}`,
                color,
                visible,
                showInLegend: segIdx === 0,
                data: segData,
            });
            segIdx++;
            runStart = runEnd;
        }
    }

    if (showMarkers && visible && points.length <= 500) {
        for (let i = 0; i < points.length; i++) {
            const pointColor = colorForScaleValue(colorValues[i], scaleInfo) || getSeriesColor(colName, 0);
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
