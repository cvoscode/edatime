/** Whether a raw cached response can render the requested timeseries viewport. */
export function canReuseBufferedFetch(input: {
    expectedKey: string | null;
    actualKey: string | null;
    data: any | null;
    fetchedWindow: { start: number; end: number } | null;
    requestedView: { start: number | null; end: number | null };
}): boolean {
    const { fetchedWindow, requestedView } = input;
    return input.expectedKey === input.actualKey
        && !!input.data
        && input.data?._meta?.downsampled === false
        && Number.isFinite(requestedView.start)
        && Number.isFinite(requestedView.end)
        && !!fetchedWindow
        && Number.isFinite(fetchedWindow.start)
        && Number.isFinite(fetchedWindow.end)
        && fetchedWindow.start <= Number(requestedView.start)
        && fetchedWindow.end >= Number(requestedView.end);
}
