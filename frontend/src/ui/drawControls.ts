/**
 * drawControls — drawing tool, adaptive filter clearing, and zoom reset.
 * Extracted from toolbar.ts to reduce its size and improve maintainability.
 */

import { primaryChart } from '../charts/primaryChart.js';
import { emitFeatureEvent } from '../platform/featureEvents.js';
import { getDropdownValue, setDropdownDisabled } from './primitives/Dropdown.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

/**
 * Reflect the current adaptive-filter state on the Clear filters button.
 * Keep the action visible for discoverability and disable it when there is
 * nothing to clear.
 */
function syncAdaptiveClearButton(workspace: Pick<WorkspaceStore, 'getSnapshot'>): void {
    const btn = document.getElementById('adaptive-clear-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const hasFilters = workspace.getSnapshot().filters.adaptiveLines.length > 0;
    btn.hidden = false;
    btn.disabled = !hasFilters;
    btn.textContent = 'Clear adaptive filters';
    btn.title = hasFilters ? 'Clear adaptive line filters (Shift+C)' : 'No adaptive line filters to clear';
}

export function initDrawControls(
    fetchAndRender: () => void,
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'subscribe'>
        & Partial<Pick<WorkspaceStore, 'subscribeSelector'>>,
): () => void {
    const lifetime = new AbortController();
    const options = { signal: lifetime.signal };
    const drawTool = document.getElementById('draw-tool') as HTMLElement | null;
    const drawColor = document.getElementById('draw-color') as HTMLInputElement | null;
    const drawWidth = document.getElementById('draw-width') as HTMLInputElement | null;
    const drawClearBtn = document.getElementById('draw-clear-btn');
    const adaptiveClearBtn = document.getElementById('adaptive-clear-btn') as HTMLElement | null;
    const drawHelpBtn = document.getElementById('draw-help-btn') as HTMLElement | null;

    const syncChartCapabilities = () => {
        const drawingAvailable = primaryChart.current?.capabilities?.drawing !== false;
        setDropdownDisabled('draw-tool', !drawingAvailable);
        const controls = [drawColor, drawWidth, drawClearBtn].filter(
            (control): control is HTMLSelectElement | HTMLInputElement | HTMLButtonElement => control instanceof HTMLElement,
        );
        for (const control of controls) control.toggleAttribute('disabled', !drawingAvailable);
        const unavailable = document.getElementById('timeseries-drawing-unavailable');
        if (unavailable) unavailable.hidden = drawingAvailable;
        for (const control of [drawTool, ...controls]) {
            if (!control) continue;
            if (drawingAvailable) control.removeAttribute('title');
            else control.title = 'Drawing is unavailable in the Canvas fallback; PNG, SVG, and HTML export remain available.';
        }
    };

    const updateDrawMode = () => {
        if (primaryChart.current?.capabilities?.drawing !== false && primaryChart.current?.setDrawMode) {
            primaryChart.current.setDrawMode(getDropdownValue('draw-tool'), drawColor!.value, parseInt(drawWidth!.value, 10));
        }
    };

    if (drawTool) drawTool.addEventListener('change', updateDrawMode, options);
    if (drawColor) drawColor.addEventListener('input', updateDrawMode, options);
    if (drawWidth) drawWidth.addEventListener('input', updateDrawMode, options);
    if (drawClearBtn) {
        drawClearBtn.addEventListener('click', () => {
            if (primaryChart.current && primaryChart.current.clearDrawings) primaryChart.current.clearDrawings();
        }, options);
    }
    if (adaptiveClearBtn && !adaptiveClearBtn.dataset.bound) {
        adaptiveClearBtn.addEventListener('click', () => {
            const filters = workspace.getSnapshot().filters;
            workspace.setFilters({ ...filters, adaptiveLines: [] });
            emitFeatureEvent('adaptive:clear-pending', undefined);
            (primaryChart.current as unknown as { requestOverlayRender?: () => void })?.requestOverlayRender?.();
        }, options);
        adaptiveClearBtn.dataset.bound = '1';
    }
    if (drawHelpBtn && !drawHelpBtn.dataset.bound) {
        // The Draw "?" help icon opens the global keyboard shortcuts
        // modal so Draw / adaptive-filter interactions are documented
        // next to the tool instead of only being reachable through the
        // `?` global shortcut. Hover/focus also surfaces the
        // discoverability text via the title attribute so the inline
        // status row the previous version of the page carried is no
        // longer needed.
        drawHelpBtn.setAttribute(
            'title',
            'Show drawing and adaptive-filter help — ctrl + click a selected series chip to target adaptive line filters',
        );
        drawHelpBtn.addEventListener('click', () => {
            void import('../utils/a11y.js').then((m) => m.showKeyboardShortcutsHelp());
        }, options);
        drawHelpBtn.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                drawHelpBtn.click();
            }
        }, options);
        drawHelpBtn.dataset.bound = '1';
    }
    syncAdaptiveClearButton(workspace);
    syncChartCapabilities();
    const unsubscribeChart = primaryChart.subscribe(syncChartCapabilities);
    const unsubscribe = workspace.subscribeSelector
        ? workspace.subscribeSelector(
            (snapshot) => snapshot.filters.adaptiveLines.length,
            () => syncAdaptiveClearButton(workspace),
        )
        : workspace.subscribe(() => syncAdaptiveClearButton(workspace));
    return () => {
        lifetime.abort();
        unsubscribe();
        unsubscribeChart();
        if (adaptiveClearBtn) delete adaptiveClearBtn.dataset.bound;
        if (drawHelpBtn) delete drawHelpBtn.dataset.bound;
    };
}
