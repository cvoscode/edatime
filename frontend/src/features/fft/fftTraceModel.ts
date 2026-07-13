import type { FftTrace } from '../../chart/FftChart.js';

export function resolveFftViewport(
    viewport: { xMin?: number | null; xMax?: number | null } | null | undefined,
    currentStart: number | null | undefined,
    currentEnd: number | null | undefined,
): { startMs: number; endMs: number } | null {
    const startMs = viewport?.xMin ?? currentStart;
    const endMs = viewport?.xMax ?? currentEnd;
    return typeof startMs === 'number' && typeof endMs === 'number'
        && Number.isFinite(startMs) && Number.isFinite(endMs)
        ? { startMs, endMs }
        : null;
}

export function buildFftTrace(result: any, color: string): FftTrace | null {
    if (!result || typeof result.column !== 'string'
        || !Array.isArray(result.frequencies) || !Array.isArray(result.magnitudes) || !Array.isArray(result.psd)) return null;
    return {
        column: result.column,
        frequencies: result.frequencies,
        magnitudes: result.magnitudes,
        psd: result.psd,
        color,
        sample_rate_hz: result.sample_rate_hz,
        nyquist_hz: result.nyquist_hz,
        dominant_peaks: result.dominant_peaks,
    };
}
