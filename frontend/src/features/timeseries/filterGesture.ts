import { canOpenColumnFilter, requestColumnFilterOpen } from './filterModalEvents.js';

export function initChartPageFilterGesture(): void {
    const pageChart = document.getElementById('page-timeseries');
    if (!pageChart || pageChart.dataset.filterCtxBound) return;
    let lastContextTs: number | null = null;
    pageChart.addEventListener('contextmenu', (event: MouseEvent) => {
        if ((event.target as HTMLElement)?.closest?.('#main-chart') || !canOpenColumnFilter()) return;
        event.preventDefault();
        const now = performance.now();
        const doubleContext = lastContextTs !== null && now - lastContextTs <= 450;
        lastContextTs = now;
        if (!doubleContext) return;
        lastContextTs = null;
        requestColumnFilterOpen(null);
    });
    pageChart.dataset.filterCtxBound = '1';
}
