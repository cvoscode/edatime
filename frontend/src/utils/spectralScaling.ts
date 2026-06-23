// filepath: frontend/src/utils/spectralScaling.ts
/**
 * Spectral scaling helpers for FFT / spectrogram visualisations.
 *
 * The raw magnitudes returned by `/api/analytics/spectrogram` and
 * `/api/analytics/fft` typically span many orders of magnitude and
 * contain extreme outliers. Plotting them on a colorbar / y-axis with
 * global min/max compresses the meaningful range into a narrow band
 * (the "noger" / no-good look).
 *
 * `applySpectralScale` clips the raw values into a robust range
 * (percentile or IQR) and then stretches them to `[0, 1]` (or leaves
 * them in raw units when `mode === 'none'`). The same algorithm is
 * reused by the backend (`apply_scale` in
 * `crates/edatime-service/src/analytics/spectrogram.rs`) so that
 * client and server agree on what "min-max" / "zscore" / "robust" mean.
 *
 * This module is pure (no DOM / no ECharts) so it can be unit-tested
 * in isolation and reused on both the spectrogram and FFT pages.
 */

export type ScaleMode = 'none' | 'minmax' | 'zscore' | 'robust';
export type ClipMode = 'none' | 'percentile' | 'iqr';

export interface SpectralScaleOptions {
    /** How to stretch the (clipped) values for display. */
    mode: ScaleMode;
    /** How to clip outliers before stretching. */
    clip: ClipMode;
    /**
     * Threshold for the active clip mode.
     *  - `percentile`: percentage on each tail (default 0.5 → 0.5%/99.5%)
     *  - `iqr`: k multiplier of the IQR (default 1.5 → boxplot rule)
     */
    clipParam: number;
}

export interface SpectralScaleResult {
    /** Display values, same length and order as `raw`. */
    displayValues: Float64Array;
    /** Min of `displayValues` (used to set the visualMap / y-axis minimum). */
    vmin: number;
    /** Max of `displayValues` (used to set the visualMap / y-axis maximum). */
    vmax: number;
    /** Low clip bound applied to `raw` (in raw units, for tooltip display). */
    clipLow: number;
    /** High clip bound applied to `raw` (in raw units, for tooltip display). */
    clipHigh: number;
    /** Echoed for downstream label generation. */
    mode: ScaleMode;
    /** Echoed for downstream label generation. */
    clip: ClipMode;
}

export const DEFAULT_SPECTRAL_SCALE: SpectralScaleOptions = {
    mode: 'none',
    clip: 'none',
    clipParam: 0.5,
};

/**
 * Apply clip + normalization to a flat array of raw magnitudes.
 *
 * Non-finite entries (NaN, ±Infinity) are propagated as NaN in the
 * output — callers should filter them out when feeding a renderer.
 */
export function applySpectralScale(
    raw: ArrayLike<number>,
    opts: SpectralScaleOptions,
): SpectralScaleResult {
    const n = raw.length;
    const out = new Float64Array(n);

    // 1. Collect finite values for statistics.
    const finite: number[] = [];
    for (let i = 0; i < n; i += 1) {
        const v = Number(raw[i]);
        if (Number.isFinite(v)) finite.push(v);
    }

    // Edge case: empty / all-non-finite.
    if (finite.length === 0) {
        // Walk the original indices so non-finite cells are NaN in the output.
        let fi = 0;
        for (let i = 0; i < n; i += 1) {
            const v = Number(raw[i]);
            if (Number.isFinite(v)) {
                out[i] = NaN;
                fi += 1;
            } else {
                out[i] = NaN;
            }
        }
        return {
            displayValues: out,
            vmin: 0,
            vmax: 1,
            clipLow: NaN,
            clipHigh: NaN,
            mode: opts.mode,
            clip: opts.clip,
        };
    }

    // 2. Determine clip bounds.
    const { clipLow, clipHigh } = computeClipBounds(finite, opts.clip, opts.clipParam);

    // 3. Clip + normalize. We work on the clipped values so `mode === 'none'`
    //    with an active clip still tightens the colorbar.
    const clipped: number[] = new Array(finite.length);
    for (let i = 0; i < finite.length; i += 1) {
        const v = finite[i];
        clipped[i] = v < clipLow ? clipLow : v > clipHigh ? clipHigh : v;
    }

    let vmin: number;
    let vmax: number;
    if (opts.mode === 'none') {
        // For mode='none' we report the data span directly so the colorbar
        // reflects what the user sees. When a clip is active this is the
        // clipped span; otherwise it's the raw data extent.
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of clipped) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        vmin = lo;
        vmax = hi;
    } else {
        const stretched = stretchValues(clipped, opts.mode);
        vmin = stretched.min;
        vmax = stretched.max;
        // Map back into output array using the stretch transform.
        for (let i = 0; i < finite.length; i += 1) {
            clipped[i] = stretched.values[i];
        }
    }

    // 4. Walk the original indices so non-finite cells stay NaN.
    let fi = 0;
    for (let i = 0; i < n; i += 1) {
        const v = Number(raw[i]);
        if (Number.isFinite(v)) {
            out[i] = clipped[fi];
            fi += 1;
        } else {
            out[i] = NaN;
        }
    }

    // Guard against degenerate ranges (all values equal, or clip collapsed
    // to a point). The renderer needs a non-zero span.
    if (!(vmax > vmin)) {
        vmax = vmin + 1;
    }

    return {
        displayValues: out,
        vmin,
        vmax,
        clipLow,
        clipHigh,
        mode: opts.mode,
        clip: opts.clip,
    };
}

function computeClipBounds(
    finite: number[],
    mode: ClipMode,
    param: number,
): { clipLow: number; clipHigh: number } {
    if (mode === 'none' || finite.length === 0) {
        return { clipLow: -Infinity, clipHigh: Infinity };
    }

    const sorted = finite.slice().sort((a, b) => a - b);

    if (mode === 'percentile') {
        // `param` is the percentage on each tail (0..50). On small samples a
        // large tail percentage can collapse to a point; allow up to 49%
        // per side. The lower bound is clamped to keep at least 2 samples
        // outside the clip on each side when possible.
        const pct = Math.min(49, Math.max(0, Number.isFinite(param) ? param : 0.5));
        const lo = quantileSorted(sorted, pct / 100);
        const hi = quantileSorted(sorted, 1 - pct / 100);
        return { clipLow: lo, clipHigh: hi };
    }

    // IQR: param is k (boxplot rule k=1.5, extreme k=3).
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    const iqr = q3 - q1;
    const k = Math.max(0, Number.isFinite(param) ? param : 1.5);
    return { clipLow: q1 - k * iqr, clipHigh: q3 + k * iqr };
}

function stretchValues(
    values: number[],
    mode: ScaleMode,
): { values: number[]; min: number; max: number } {
    if (mode === 'minmax') {
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of values) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        if (!(hi > lo)) {
            // All equal → map to 0.5 so the colorbar collapses to a point.
            const collapsed = values.map(() => 0.5);
            return { values: collapsed, min: 0, max: 1 };
        }
        const span = hi - lo;
        const out = values.map((v) => (v - lo) / span);
        return { values: out, min: 0, max: 1 };
    }

    if (mode === 'zscore') {
        // Compute mean / std on the clipped values.
        let sum = 0;
        for (const v of values) sum += v;
        const mean = sum / values.length;
        let sqSum = 0;
        for (const v of values) {
            const d = v - mean;
            sqSum += d * d;
        }
        const std = Math.sqrt(sqSum / Math.max(1, values.length - 1));
        if (std === 0 || !Number.isFinite(std)) {
            const collapsed = values.map(() => 0.5);
            return { values: collapsed, min: 0, max: 1 };
        }
        const z = values.map((v) => (v - mean) / std);
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of z) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        const span = hi - lo;
        const out = z.map((v) => (span > 0 ? (v - lo) / span : 0.5));
        return { values: out, min: 0, max: 1 };
    }

    if (mode === 'robust') {
        const sorted = values.slice().sort((a, b) => a - b);
        const q1 = quantileSorted(sorted, 0.25);
        const q3 = quantileSorted(sorted, 0.75);
        const iqr = q3 - q1;
        if (iqr === 0 || !Number.isFinite(iqr)) {
            const collapsed = values.map(() => 0.5);
            return { values: collapsed, min: 0, max: 1 };
        }
        // Map Q1 → 0.25, Q3 → 0.75 on [0, 1].
        const out = values.map((v) => {
            const t = (v - q1) / iqr;
            return 0.25 + 0.5 * t;
        });
        return { values: out, min: 0, max: 1 };
    }

    // Should be unreachable (caller is expected to pass a known mode).
    return { values: values.slice(), min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Linear-interpolation quantile on a pre-sorted ascending array.
 * Mirrors numpy's default `method='linear'`.
 */
export function quantileSorted(sorted: number[], q: number): number {
    if (sorted.length === 0) return NaN;
    if (sorted.length === 1) return sorted[0];
    const qq = Math.min(1, Math.max(0, q));
    const idx = qq * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Short, human-readable label for the active scale mode — used by
 * the colorbar / y-axis labels and tooltip.
 */
export function scaleModeLabel(mode: ScaleMode, clip: ClipMode, clipParam: number): string {
    if (mode === 'none' && clip === 'none') return 'raw';
    if (mode === 'none') {
        return clip === 'percentile'
            ? `clipped [p${clipParam}, p${(100 - clipParam).toFixed(1)}]`
            : `clipped [Q1−${clipParam}·IQR, Q3+${clipParam}·IQR]`;
    }
    const base = mode === 'minmax'
        ? 'min-max [0,1]'
        : mode === 'zscore'
            ? 'z-score → [0,1]'
            : 'robust [Q1, Q3]';
    if (clip === 'none') return base;
    const tail = clip === 'percentile'
        ? `, clip p${clipParam}/p${(100 - clipParam).toFixed(1)}`
        : `, clip IQR k=${clipParam}`;
    return `${base}${tail}`;
}
