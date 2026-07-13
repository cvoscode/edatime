/** Build the spectral-filter query only for a valid FFT viewport and column. */
export function buildFftFilterRequest(input: {
    startMs: number | null | undefined;
    endMs: number | null | undefined;
    column: string | null | undefined;
    filterType: string;
    lowHz?: number;
    highHz?: number;
}): URLSearchParams | null {
    if (!input.column || typeof input.startMs !== 'number' || typeof input.endMs !== 'number'
        || !Number.isFinite(input.startMs) || !Number.isFinite(input.endMs)) return null;
    return new URLSearchParams({
        start: new Date(input.startMs).toISOString(),
        end: new Date(input.endMs).toISOString(),
        column: input.column,
        filter_type: input.filterType,
        ...(Number.isFinite(input.lowHz) ? { low_hz: String(input.lowHz) } : {}),
        ...(Number.isFinite(input.highHz) ? { high_hz: String(input.highHz) } : {}),
    });
}
