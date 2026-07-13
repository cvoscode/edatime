/** Bind the Timeseries page's double-right-click filter shortcut. */
export function initChartPageFilterGesture(
    openColumnFilter: (column: string | null) => void,
): () => void {
    const pageChart = document.getElementById('page-timeseries');
    if (!pageChart) return () => {};

    const abortController = new AbortController();
    let lastContextTs: number | null = null;
    pageChart.addEventListener('contextmenu', (event: MouseEvent) => {
        if ((event.target as HTMLElement)?.closest?.('#main-chart')) return;
        event.preventDefault();
        const now = performance.now();
        const doubleContext = lastContextTs !== null && now - lastContextTs <= 450;
        lastContextTs = now;
        if (!doubleContext) return;
        lastContextTs = null;
        openColumnFilter(null);
    }, { signal: abortController.signal });

    return () => abortController.abort();
}
