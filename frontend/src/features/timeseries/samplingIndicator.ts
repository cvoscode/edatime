/**
 * Downsampling indicator for the Signals (Timeseries) page.
 *
 * Pure helper that derives a small, user-facing summary of the
 * currently rendered dataset's sampling state from the response meta.
 * The actual `runtimeCache.data` lives in the timeseries controller;
 * this module only formats what we know about it.
 */

export interface SamplingMeta {
    downsampled?: boolean | null;
    downsampleKnown?: boolean | null;
    returnedRows?: number | null;
    targetPoints?: number | null;
}

export type SamplingState =
    | { kind: 'unknown' }
    | { kind: 'exact'; rows: number | null }
    | { kind: 'downsampled'; rows: number | null; target: number | null; ratio: number | null };

export interface SamplingIndicator {
    label: string;
    detail: string;
    level: 'info' | 'warn';
}

/**
 * Classify the current render's sampling state. Returns `unknown` when
 * the meta is missing or `downsampleKnown` is false, because we cannot
 * tell the user anything useful in that case.
 */
export function classifySamplingState(meta: SamplingMeta | null | undefined): SamplingState {
    if (!meta || meta.downsampleKnown !== true) return { kind: 'unknown' };
    const rows = Number(meta.returnedRows);
    const target = Number(meta.targetPoints);
    const downsampled = meta.downsampled === true;
    const hasRows = Number.isFinite(rows) ? { rows } : { rows: null };
    const hasTarget = Number.isFinite(target) ? target : null;
    if (!downsampled) return { kind: 'exact', ...hasRows };
    const ratio = hasTarget && rows > 0 ? rows / hasTarget : null;
    return { kind: 'downsampled', ...hasRows, target: hasTarget, ratio };
}

function formatCount(value: number | null): string {
    if (value == null) return 'unknown';
    if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
}

/**
 * Render a small user-facing indicator. Returns null when there is
 * nothing meaningful to surface.
 */
export function formatSamplingIndicator(state: SamplingState): SamplingIndicator | null {
    if (state.kind === 'unknown') return null;
    if (state.kind === 'exact') {
        if (state.rows == null) return null;
        return {
            label: 'Exact',
            detail: `Showing ${formatCount(state.rows)} points`,
            level: 'info',
        };
    }
    const rows = formatCount(state.rows);
    const target = state.target != null ? formatCount(state.target) : 'unknown';
    if (state.rows == null) {
        return {
            label: 'Downsampled',
            detail: `Approximated to ~${target} points`,
            level: 'warn',
        };
    }
    return {
        label: 'Downsampled',
        detail: `Showing ${rows} of ${target} points (approx.)`,
        level: 'warn',
    };
}
