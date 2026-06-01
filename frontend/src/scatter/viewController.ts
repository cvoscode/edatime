/**
 * Scatter view orchestration — active view management, matrix/plot toggle,
 * sidebar selection sync, and cross-page navigation.
 *
 * These functions are exported for potential external use (e.g., causal page
 * may call openScatterPairInCausal). They are also imported by scatterPage.ts
 * for co-located use in the render pipeline.
 */
import { appState } from '../store/appStateCompat.js';
import { syncModeUI } from './rendering.js';
import { renderScatterMatrixView, selectMatrixPair } from './matrix.js';
import { getEl } from './helpers.js';
import { normalizeAnalyticsView } from './state.js';

export function setSidebarAnalyticsSelection(viewName: string): void {
    const navPage = viewName === 'matrix' ? 'scattermatrix' : 'scatter';
    for (const button of document.querySelectorAll('.sidebar .nav-item[data-page]')) {
        const page = (button as HTMLElement).dataset.page;
        const active = page === navPage;
        if (page === 'scatter' || page === 'scattermatrix') {
            button.classList.toggle('active', active);
        }
    }
}

export function syncScatterViewButtons(viewName: string): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-scatter-view]')) {
        const active = button.dataset.scatterView === viewName;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
}

export async function setScatterView(
    viewName: string,
    options: { render?: boolean } = {},
): Promise<void> {
    const nextView = viewName || 'plot';
    const shouldRender = options.render !== false;
    appState.scatter.activeView = nextView;
    setSidebarAnalyticsSelection(nextView);
    syncScatterViewButtons(nextView);
    syncModeUI();

    for (const panel of document.querySelectorAll<HTMLElement>('[data-scatter-view-panel]')) {
        panel.hidden = panel.dataset.scatterViewPanel !== nextView;
    }

    if (!shouldRender) return;
    if (nextView === 'matrix') {
        // matrix.js selectMatrixPair needs the render callbacks — import locally
        const { refreshCorrelationsAndSuggestions, renderScatter } = await import('./scatterPage.js');
        await renderScatterMatrixView(
            async (x: string, y: string) => onMatrixCellClick(x, y, refreshCorrelationsAndSuggestions, renderScatter),
        );
        return;
    }
    requestAnimationFrame(() => appState.scatter.chart?.resize?.());
}

export async function refreshActiveScatterView(): Promise<void> {
    return setScatterView(appState.scatter.activeView, { render: true });
}

export async function onMatrixCellClick(
    x: string,
    y: string,
    refreshCorrelationsAndSuggestions: () => Promise<void>,
    renderScatter: () => Promise<void>,
): Promise<void> {
    const matrixLoading = getEl('scatter-matrix-loading');
    if (matrixLoading) matrixLoading.hidden = false;
    try {
        await selectMatrixPair(x, y, refreshCorrelationsAndSuggestions, renderScatter, setScatterView);
    } catch (error: any) {
        console.error(error);
        const { handleErr } = await import('./scatterPage.js');
        handleErr(error);
    } finally {
        if (matrixLoading) matrixLoading.hidden = true;
    }
}

export function openScatterPairInCausal(): void {
    const xCol = (getEl('scatter-x-col') as HTMLSelectElement | null)?.value;
    const yCol = (getEl('scatter-y-col') as HTMLSelectElement | null)?.value;
    if (!xCol || !yCol) return;
    window.dispatchEvent(new CustomEvent('edatime:causal-preselect', {
        detail: { columns: [xCol, yCol] },
    }));
    document.querySelector<HTMLElement>('.sidebar .nav-item[data-page="causal"]')?.click?.();
}