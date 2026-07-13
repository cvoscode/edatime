export interface FetchedWindow {
    start: number;
    end: number;
}

export function resolveFetchedWindow(input: {
    data: { ts?: ArrayLike<number> } | null | undefined;
    requestedStart: number;
    requestedEnd: number;
    lookaroundMs: number;
}): FetchedWindow {
    const fallback = {
        start: input.requestedStart - input.lookaroundMs,
        end: input.requestedEnd + input.lookaroundMs,
    };
    const timestamps = input.data?.ts;
    if (!timestamps || timestamps.length === 0) return fallback;

    const start = Number(timestamps[0]);
    const end = Number(timestamps[timestamps.length - 1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return fallback;
    return { start, end };
}
