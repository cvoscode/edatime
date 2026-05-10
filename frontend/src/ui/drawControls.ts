/**
 * drawControls — drawing tool, adaptive filter clearing, and zoom reset.
 * Extracted from toolbar.ts to reduce its size and improve maintainability.
 */

import { appState } from '../state.js';

export function initDrawControls(fetchAndRender: () => void): void {
    const zoomResetBtn = document.getElementById('zoom-reset-btn') as HTMLElement | null;
    if (zoomResetBtn && !zoomResetBtn.dataset.bound) {
        zoomResetBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('edatime:reset-zoom', { detail: { source: 'toolbar' } }));
        });
        zoomResetBtn.dataset.bound = '1';
    }

    const drawTool = document.getElementById('draw-tool') as HTMLSelectElement | null;
    const drawColor = document.getElementById('draw-color') as HTMLInputElement | null;
    const drawWidth = document.getElementById('draw-width') as HTMLInputElement | null;
    const drawClearBtn = document.getElementById('draw-clear-btn');
    const adaptiveClearBtn = document.getElementById('adaptive-clear-btn') as HTMLElement | null;

    const updateDrawMode = () => {
        if (appState.chart && appState.chart.setDrawMode) {
            appState.chart.setDrawMode(drawTool!.value, drawColor!.value, parseInt(drawWidth!.value, 10));
        }
    };

    if (drawTool) drawTool.addEventListener('change', updateDrawMode);
    if (drawColor) drawColor.addEventListener('input', updateDrawMode);
    if (drawWidth) drawWidth.addEventListener('input', updateDrawMode);
    if (drawClearBtn) {
        drawClearBtn.addEventListener('click', () => {
            if (appState.chart && appState.chart.clearDrawings) appState.chart.clearDrawings();
        });
    }
    if (adaptiveClearBtn && !adaptiveClearBtn.dataset.bound) {
        adaptiveClearBtn.addEventListener('click', () => {
            appState.adaptiveLineFilters = [];
            appState.pendingAdaptivePoint = null;
            (appState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();
            window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change'));
        });
        adaptiveClearBtn.dataset.bound = '1';
    }
}