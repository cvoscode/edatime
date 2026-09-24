import type { FilteredDataObject, SeriesData } from '../types/chart.js';

export interface SeriesNormalization {
    min: number;
    max: number;
}

export function toDisplaySeriesValue(value: number, scale?: SeriesNormalization): number {
    if (!Number.isFinite(value)) return Number.NaN;
    if (!scale) return value;
    if (!Number.isFinite(scale.min) || !Number.isFinite(scale.max)) return Number.NaN;
    return scale.max > scale.min ? (value - scale.min) / (scale.max - scale.min) : 0.5;
}

export function toSourceSeriesValue(value: number, scale?: SeriesNormalization): number {
    if (!scale) return value;
    return scale.min + value * (scale.max - scale.min);
}

/** Use the trace's filtered samples, never the unmasked source values, for its scale. */
export function getSeriesDisplayData(
    data: FilteredDataObject,
    column: string,
    normalize: boolean,
): (SeriesData & { normalization?: SeriesNormalization }) | null {
    const filtered = data.series?.[column];
    const x = filtered?.x ?? data.ts;
    const sourceY = filtered?.y ?? data.values?.[column];
    if (!x || !sourceY) return null;
    if (!normalize) return { x, y: sourceY };

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const count = Math.min(x.length, sourceY.length);
    for (let i = 0; i < count; i++) {
        if (!Number.isFinite(x[i]) || !Number.isFinite(sourceY[i])) continue;
        min = Math.min(min, sourceY[i]);
        max = Math.max(max, sourceY[i]);
    }
    const normalization = {
        min: Number.isFinite(min) ? min : Number.NaN,
        max: Number.isFinite(max) ? max : Number.NaN,
    };
    const y = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        y[i] = Number.isFinite(x[i]) ? toDisplaySeriesValue(sourceY[i], normalization) : Number.NaN;
    }
    return { x, y, normalization };
}
