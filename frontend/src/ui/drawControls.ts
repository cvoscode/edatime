/**
 * drawControls — drawing tool, adaptive filter clearing, and zoom reset.
 * Extracted from toolbar.ts to reduce its size and improve maintainability.
 */

import { chartState } from '../store/chartState.js';
import { setAdaptiveLineFilters, setPendingAdaptivePoint, store } from '../store/index.js';
import { getDropdownValue } from './primitives/Dropdown.js';
import { uiState } from '../store/uiState.js';

/**
 * Reflect the current adaptive-filter state on the Clear filters button.
 * The button stays hidden when there are no filters to clear so a user
 * who has not drawn any adaptive line cannot mis-click a no-op button.
 */
function syncAdaptiveClearButton(): void {
    const btn = document.getElementById('adaptive-clear-btn') as HTMLElement | null;
    if (!btn) return;
    const hasFilters = (uiState.adaptiveLineFilters || []).length > 0;
    btn.hidden = !hasFilters;
}

export function initDrawControls(fetchAndRender: () => void): void {
    const zoomResetBtn = document.getElementById('zoom-reset-btn') as HTMLElement | null;
    if (zoomResetBtn && !zoomResetBtn.dataset.bound) {
        zoomResetBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('edatime:reset-zoom', { detail: { source: 'toolbar' } }));
        });
        zoomResetBtn.dataset.bound = '1';
    }

    const drawTool = document.getElementById('draw-tool') as HTMLElement | null;
    const drawColor = document.getElementById('draw-color') as HTMLInputElement | null;
    const drawWidth = document.getElementById('draw-width') as HTMLInputElement | null;
    const drawClearBtn = document.getElementById('draw-clear-btn');
    const adaptiveClearBtn = document.getElementById('adaptive-clear-btn') as HTMLElement | null;

    const updateDrawMode = () => {
        if (chartState.chart && chartState.chart.setDrawMode) {
            chartState.chart.setDrawMode(getDropdownValue('draw-tool'), drawColor!.value, parseInt(drawWidth!.value, 10));
        }
    };

    if (drawTool) drawTool.addEventListener('change', updateDrawMode);
    if (drawColor) drawColor.addEventListener('input', updateDrawMode);
    if (drawWidth) drawWidth.addEventListener('input', updateDrawMode);
    if (drawClearBtn) {
        drawClearBtn.addEventListener('click', () => {
            if (chartState.chart && chartState.chart.clearDrawings) chartState.chart.clearDrawings();
        });
    }
    if (adaptiveClearBtn && !adaptiveClearBtn.dataset.bound) {
        adaptiveClearBtn.addEventListener('click', () => {
            setAdaptiveLineFilters([]);
            setPendingAdaptivePoint(null);
            (chartState.chart as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();
            window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change'));
        });
        adaptiveClearBtn.dataset.bound = '1';
    }
    syncAdaptiveClearButton();
    store.subscribe('ui:adaptiveLineFilters', syncAdaptiveClearButton);
}
