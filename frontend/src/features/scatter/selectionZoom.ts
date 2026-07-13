/** Scatter plot box-zoom DOM interaction. View-state updates stay in rendering.ts. */

import { dragToViewport, type DragState } from '../../chart/chartInteractions.js';
import { scatterState } from '../../store/scatterState.js';
import { getChartPalette } from '../../utils/theme.js';
import { SCATTER_PLOT_GRID } from './layout.js';
import { applyView, resetView, type DensityViewRefresh } from './rendering.js';
import { currentControls } from './state.js';

export function initSelectionZoom(
    container: HTMLElement,
    options: { onDensityViewRefresh?: DensityViewRefresh } = {},
): void {
    if (!container || scatterState.selectionBox) return;
    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const box = document.createElement('div');
    const palette = getChartPalette();
    Object.assign(box.style, {
        position: 'absolute', left: '0', top: '0', width: '0', height: '0',
        border: `1px solid ${palette.pendingPointBorder}`, background: palette.pendingPoint,
        pointerEvents: 'none', display: 'none', zIndex: '8',
    });
    container.appendChild(box);
    scatterState.selectionBox = box;

    const renderSelectionBox = () => {
        if (!scatterState.selectionBox || !scatterState.drag) return;
        const left = Math.min(scatterState.drag.startX, scatterState.drag.endX);
        const right = Math.max(scatterState.drag.startX, scatterState.drag.endX);
        const top = Math.min(scatterState.drag.startY, scatterState.drag.endY);
        const bottom = Math.max(scatterState.drag.startY, scatterState.drag.endY);
        scatterState.selectionBox.style.left = `${left}px`;
        scatterState.selectionBox.style.top = `${top}px`;
        scatterState.selectionBox.style.width = `${Math.max(0, right - left)}px`;
        scatterState.selectionBox.style.height = `${Math.max(0, bottom - top)}px`;
        scatterState.selectionBox.style.display = 'block';
    };
    const hideSelectionBox = () => { if (scatterState.selectionBox) scatterState.selectionBox.style.display = 'none'; };

    container.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const rect = container.getBoundingClientRect();
        scatterState.drag = { pointerId: ev.pointerId, startX: ev.clientX - rect.left, endX: ev.clientX - rect.left, startY: ev.clientY - rect.top, endY: ev.clientY - rect.top };
        try { container.setPointerCapture(ev.pointerId); } catch { }
        renderSelectionBox();
    });
    container.addEventListener('pointermove', (ev) => {
        if (!scatterState.drag || ev.pointerId !== scatterState.drag.pointerId) return;
        const rect = container.getBoundingClientRect();
        scatterState.drag.endX = ev.clientX - rect.left;
        scatterState.drag.endY = ev.clientY - rect.top;
        renderSelectionBox();
    });

    const finishDrag = (ev: PointerEvent) => {
        if (!scatterState.drag || ev.pointerId !== scatterState.drag.pointerId) return;
        const drag: DragState = { ...scatterState.drag };
        scatterState.drag = null;
        hideSelectionBox();
        try { container.releasePointerCapture(ev.pointerId); } catch { }

        const isDensityMode = currentControls().renderMode === 'density';
        const dx = Math.abs(drag.endX - drag.startX);
        const dy = Math.abs(drag.endY - drag.startY);
        if (isDensityMode && (dx < 8 || dy < 8)) return;

        const rect = container.getBoundingClientRect();
        const next = dragToViewport(
            drag,
            Math.max(1, rect.width),
            Math.max(1, rect.height),
            SCATTER_PLOT_GRID,
            { min: scatterState.view.xMin, max: scatterState.view.xMax },
            { min: scatterState.view.yMin, max: scatterState.view.yMax },
        );
        if (next) applyView(next, true, options.onDensityViewRefresh);
    };

    container.addEventListener('pointerup', finishDrag);
    container.addEventListener('pointercancel', finishDrag);
    container.addEventListener('dblclick', (ev) => {
        if (ev.shiftKey) return;
        if (scatterState.zoomHistory.length > 0) {
            applyView(scatterState.zoomHistory.pop()!, false, options.onDensityViewRefresh);
            return;
        }
        resetView(false, options.onDensityViewRefresh);
    });
}
