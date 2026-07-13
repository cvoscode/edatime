const MIN_LOOKAROUND_MS = 60_000;

export function getTimeseriesLookaroundMs(start: number, end: number): number {
    return Math.max(MIN_LOOKAROUND_MS, Math.round((end - start) * 1.25));
}

export function buildTimeseriesDataRequest(input: {
    start: number;
    end: number;
    columns: readonly string[];
    colorColumn: string | null;
}, chartWidth: number): {
    startIso: string;
    endIso: string;
    width: number;
    columns: string;
    colorColumn: string | null;
    lookaroundMs: number;
} | null {
    if (!Number.isFinite(input.start) || !Number.isFinite(input.end) || input.end <= input.start || input.columns.length === 0) return null;
    return {
        startIso: new Date(input.start).toISOString(),
        endIso: new Date(input.end).toISOString(),
        width: Math.max(1, Math.round(chartWidth || 1200)),
        columns: input.columns.join(','),
        colorColumn: input.colorColumn,
        lookaroundMs: getTimeseriesLookaroundMs(input.start, input.end),
    };
}
