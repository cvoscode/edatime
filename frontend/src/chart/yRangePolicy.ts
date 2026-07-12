import type { RobustDisplayRangeOptions } from '../types.js';
import { quantileSorted } from '../utils/spectralScaling.js';

export function normalizeRobustDisplayRange(options: RobustDisplayRangeOptions): RobustDisplayRangeOptions {
    const mode = options.mode === 'iqr' ? 'iqr' : 'percentile';
    const fallback = mode === 'iqr' ? 1.5 : 1;
    const param = Number.isFinite(options.param) ? Number(options.param) : fallback;
    return { mode, param: mode === 'iqr' ? Math.max(0.1, param) : Math.min(25, Math.max(0, param)) };
}

export function computeRobustDisplayBounds(values: readonly number[], options: RobustDisplayRangeOptions | null): { min: number; max: number } | null {
    if (!options) return null;
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length < 4) return null;
    if (options.mode === 'percentile') {
        const min = quantileSorted(sorted, options.param / 100);
        const max = quantileSorted(sorted, 1 - (options.param / 100));
        return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
    }
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    if (!Number.isFinite(q1) || !Number.isFinite(q3) || q3 <= q1) return null;
    const min = q1 - options.param * (q3 - q1);
    const max = q3 + options.param * (q3 - q1);
    return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}

export function suggestRobustDisplayRange(values: readonly number[], dataMin: number | null, dataMax: number | null): RobustDisplayRangeOptions | null {
    if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return null;
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length < 4) return null;
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    return Number.isFinite(q1) && Number.isFinite(q3) && q3 > q1 && dataMax! - dataMin! > (q3 - q1) * 3
        ? { mode: 'percentile', param: 1 }
        : null;
}
