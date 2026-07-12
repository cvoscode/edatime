import type { SpectrogramResult } from '../../services/api/index.js';
import {
    fillVisibleSpectrogramPoints,
    isSpectrogramColorFilterActive,
    type SpectrogramMode,
    type SpectrogramPoint,
    type SpectrogramValueRange,
} from './spectrogramPointFilter.js';

export interface SpectrogramGridModel {
    result: SpectrogramResult;
    log: Float64Array;
    raw: Float64Array;
    linearPoints: SpectrogramPoint[];
    logPoints: SpectrogramPoint[];
    visibleLinearPoints: SpectrogramPoint[];
    visibleLogPoints: SpectrogramPoint[];
    logMin: number;
    logMax: number;
    linearMin: number;
    linearMax: number;
    lastVisibleMode: SpectrogramMode | null;
    lastVisibleRangeKey: string | null;
}

export function buildSpectrogramGridModel(result: SpectrogramResult): SpectrogramGridModel {
    const timeAxis = result.times_ms;
    const frequencyAxis = result.frequencies;
    const total = timeAxis.length * frequencyAxis.length;
    const log = new Float64Array(total);
    const raw = new Float64Array(total);
    const linear = new Float64Array(total);
    let logMin = Number.POSITIVE_INFINITY;
    let logMax = Number.NEGATIVE_INFINITY;
    let linearMin = Number.POSITIVE_INFINITY;
    let linearMax = Number.NEGATIVE_INFINITY;
    for (let timeIndex = 0; timeIndex < timeAxis.length; timeIndex += 1) {
        const row = result.magnitudes[timeIndex] || [];
        const offset = timeIndex * frequencyAxis.length;
        for (let frequencyIndex = 0; frequencyIndex < frequencyAxis.length; frequencyIndex += 1) {
            const index = offset + frequencyIndex;
            const value = Number(row[frequencyIndex] ?? NaN);
            raw[index] = value;
            linear[index] = value;
            if (Number.isFinite(value)) {
                linearMin = Math.min(linearMin, value);
                linearMax = Math.max(linearMax, value);
            }
            const logValue = Number.isFinite(value) && value > 0 ? Math.log10(value) : NaN;
            log[index] = logValue;
            if (Number.isFinite(logValue)) {
                logMin = Math.min(logMin, logValue);
                logMax = Math.max(logMax, logValue);
            }
        }
    }
    if (!Number.isFinite(logMin) || !Number.isFinite(logMax)) { logMin = 0; logMax = 1; }
    if (!Number.isFinite(linearMin) || !Number.isFinite(linearMax)) { linearMin = 0; linearMax = 1; }
    if (!(logMax > logMin)) logMax = logMin + 1;
    if (!(linearMax > linearMin)) linearMax = linearMin + 1;
    const linearPoints = buildSpectrogramPoints(result, linear, raw);
    const logPoints = buildSpectrogramPoints(result, log, raw);
    return {
        result, log, raw, linearPoints, logPoints,
        visibleLinearPoints: linearPoints.slice(), visibleLogPoints: logPoints.slice(),
        logMin, logMax, linearMin, linearMax, lastVisibleMode: null, lastVisibleRangeKey: null,
    };
}

export function getSpectrogramDisplayBounds(model: SpectrogramGridModel, mode: SpectrogramMode): SpectrogramValueRange {
    return mode === 'log'
        ? { min: model.logMin, max: model.logMax }
        : { min: model.linearMin, max: model.linearMax };
}

export function getVisibleSpectrogramPoints(
    model: SpectrogramGridModel,
    mode: SpectrogramMode,
    range: SpectrogramValueRange | null,
    bounds: SpectrogramValueRange,
): SpectrogramPoint[] {
    const source = mode === 'log' ? model.logPoints : model.linearPoints;
    if (!isSpectrogramColorFilterActive(range, bounds)) return source;
    const key = `${mode}:${range.min}:${range.max}`;
    const target = mode === 'log' ? model.visibleLogPoints : model.visibleLinearPoints;
    if (model.lastVisibleMode === mode && model.lastVisibleRangeKey === key) return target;
    model.lastVisibleMode = mode;
    model.lastVisibleRangeKey = key;
    return fillVisibleSpectrogramPoints(source, target, range);
}

function buildSpectrogramPoints(
    result: SpectrogramResult,
    displayValues: Float64Array,
    rawValues: Float64Array,
): SpectrogramPoint[] {
    const points: SpectrogramPoint[] = new Array(displayValues.length);
    let writeIndex = 0;
    for (let timeIndex = 0; timeIndex < result.times_ms.length; timeIndex += 1) {
        const offset = timeIndex * result.frequencies.length;
        for (let frequencyIndex = 0; frequencyIndex < result.frequencies.length; frequencyIndex += 1) {
            const index = offset + frequencyIndex;
            if (!Number.isFinite(displayValues[index])) continue;
            points[writeIndex++] = [timeIndex, frequencyIndex, displayValues[index]!, rawValues[index]!];
        }
    }
    points.length = writeIndex;
    return points;
}
