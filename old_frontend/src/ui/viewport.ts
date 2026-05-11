/**
 * viewport — zoom, view-history, and chart-gesture controls.
 * Manages zoom-out, reset-to-initial, and the zoom history stack.
 * Also handles context-menu filter gestures on the chart page.
 */

import { appState } from '../state.js';
import { dbg, dbgGroup } from '../debug.js';
import { updateAnalysisZoom, updateAnalysisYRange } from './analysisStatus.js';
import type { ViewSnapshot } from '../types.js';

export function refreshZoomControlsState(): void {
    const supportsZoom = !!appState.chart?.supportsZoomControls?.();
    const resetBtn = document.getElementById('zoom-reset-btn') as HTMLButtonElement | null;
    if (resetBtn) resetBtn.disabled = !supportsZoom;
    updateZoomRangeBadge();
}

export function updateZoomRangeBadge(): void {
    const badge = document.getElementById('zoom-range-badge');
    if (!badge) return;
    const init = appState.initialView;
    const curr = appState.currentStart !== null && appState.currentEnd !== null
        ? appState.currentEnd - appState.currentStart
        : null;
    if (!init || curr === null) {
        badge.textContent = '—';
        return;
    }
    const initRange = (init.xMax ?? 0) - (init.xMin ?? 0);
    if (!initRange || initRange <= 0) {
        badge.textContent = '—';
        return;
    }
    const ratio = curr / initRange;
    const pct = (ratio * 100).toFixed(0);
    badge.textContent = `Viewing ${pct}%`;
}

export function getCurrentView(): ViewSnapshot {
    const yr = appState.chart?.getYRange?.();
    return {
        xMin: appState.currentStart,
        xMax: appState.currentEnd,
        yMin: yr?.min ?? null,
        yMax: yr?.max ?? null,
    };
}

export function applyViewport(
    view: ViewSnapshot,
    fetchAndRender: () => void,
    sourceKind = 'api',
): void {
    dbgGroup(`applyViewport (${sourceKind})`, () => {
        dbg('incoming view', view);
    });
    appState.currentStart = view.xMin;
    appState.currentEnd = view.xMax;
    appState.chart?.setXRange?.(appState.currentStart as number, appState.currentEnd as number);

    updateAnalysisZoom(appState.currentStart as number, appState.currentEnd as number, sourceKind);

    if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax! > view.yMin!) {
        updateAnalysisYRange(view.yMin!, view.yMax!, sourceKind);
        appState.pendingYMode = 'restore' as any;
        appState.pendingRestoreY = { min: view.yMin!, max: view.yMax! };
    } else {
        appState.pendingYMode = 'fit';
        appState.pendingRestoreY = null;
    }

    if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);
    appState.fetchDebounceId = setTimeout(fetchAndRender, 0);
    updateZoomRangeBadge();
}

export function zoomOut(fetchAndRender: () => void): void {
    dbgGroup('zoomOut (dblclick)', () => {
        dbg('history depth', appState.zoomHistory.length);
        dbg('initialView', appState.initialView);
    });
    if (appState.zoomHistory.length > 0) {
        applyViewport(appState.zoomHistory.pop() as ViewSnapshot, fetchAndRender, 'zoom-out');
    } else if (appState.initialView) {
        applyViewport(appState.initialView as ViewSnapshot, fetchAndRender, 'zoom-out');
    }
}

export function resetZoom(fetchAndRender: () => void): void {
    dbgGroup('resetZoom', () => {
        dbg('initialView', appState.initialView);
    });
    if (!appState.initialView) return;
    appState.zoomHistory = [];
    applyViewport(appState.initialView as ViewSnapshot, fetchAndRender, 'reset');
}

export function initChartPageFilterGesture(): void {
    const pageChart = document.getElementById('page-timeseries');
    if (!pageChart) return;
    if (pageChart.dataset.filterCtxBound) return;

    let lastContextTs = 0;

    pageChart.addEventListener('contextmenu', (e: MouseEvent) => {
        const inPlot = (e.target as HTMLElement)?.closest?.('#main-chart');
        if (inPlot) return;
        const open = (window as any).__edatime?.openFilterForCol;
        if (typeof open !== 'function') return;
        e.preventDefault();

        const now = performance.now();
        const isDoubleContext = (now - lastContextTs) <= 450;
        lastContextTs = now;
        if (!isDoubleContext) return;

        lastContextTs = 0;
        open(null);
    });

    pageChart.dataset.filterCtxBound = '1';
}

export function initResetZoomListener(fetchAndRender: () => void): void {
    window.addEventListener('edatime:reset-zoom', () => {
        zoomOut(fetchAndRender);
    });
}