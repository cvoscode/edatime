/**
 * viewport — zoom, view-history, and chart-gesture controls.
 * Manages zoom-out, reset-to-initial, and the zoom history stack.
 * Also handles context-menu filter gestures on the chart page.
 */

import { appState } from '../store/appStateCompat.js';
import {
    setFetchDebounceId,
    setPendingRestoreY,
    setPendingYMode,
    setViewport,
    setZoomHistory,
    store,
} from '../store/index.js';
import { dbg, dbgGroup } from '../debug.js';
import { updateAnalysisZoom, updateAnalysisYRange } from './analysisStatus.js';
import type { ViewSnapshot } from '../types.js';

// Keep the zoom-range badge in sync with the store regardless of which
// path mutates `appState.currentStart/currentEnd` or `appState.initialView`.
// Without this, the badge only refreshed when the legacy `applyViewport()`
// path ran; zoom-in interactions (chart callbacks, range controls, dataset
// reloads) bypassed that path and the badge would stay stuck on its
// previous percentage.
let zoomBadgeSubscriptionsInstalled = false;
function installZoomBadgeSubscriptions(): void {
    if (zoomBadgeSubscriptionsInstalled) return;
    zoomBadgeSubscriptionsInstalled = true;
    store.subscribe('chart:viewport', () => updateZoomRangeBadge());
    store.subscribe('chart:initialView', () => updateZoomRangeBadge());
}

export function refreshZoomControlsState(): void {
    installZoomBadgeSubscriptions();
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
    setViewport(view.xMin, view.xMax);
    appState.chart?.setXRange?.(appState.currentStart as number, appState.currentEnd as number);

    updateAnalysisZoom(appState.currentStart as number, appState.currentEnd as number, sourceKind);

    if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax! > view.yMin!) {
        updateAnalysisYRange(view.yMin!, view.yMax!, sourceKind);
        setPendingYMode('restore');
        setPendingRestoreY({ min: view.yMin!, max: view.yMax! });
        // Persist onto the chart so an in-progress render is not overwritten
        // by `_buildYAxisOption`'s data-fit branch (which would otherwise ignore
        // a user y range and re-paint the chart at the full data span after a
        // zoom-in or zoom-out transition).
        appState.chart?.setYRange?.(view.yMin!, view.yMax!);
    } else {
        setPendingYMode('fit');
        setPendingRestoreY(null);
        // Drop any persisted user y range so a quick-range, zoom-out, or
        // reset that does not specify a y range reverts the chart to the
        // data-driven fit on the next render.
        appState.chart?.resetYRange?.();
    }

    if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);
    setFetchDebounceId(setTimeout(fetchAndRender, 0));
    updateZoomRangeBadge();
}

export function zoomOut(fetchAndRender: () => void): void {
    dbgGroup('zoomOut (dblclick)', () => {
        dbg('history depth', appState.zoomHistory.length);
        dbg('initialView', appState.initialView);
    });
    if (appState.zoomHistory.length > 0) {
        const nextHistory = appState.zoomHistory.slice(0, -1);
        const nextView = appState.zoomHistory[appState.zoomHistory.length - 1] as ViewSnapshot;
        setZoomHistory(nextHistory);
        applyViewport(nextView, fetchAndRender, 'zoom-out');
    } else if (appState.initialView) {
        applyViewport(appState.initialView as ViewSnapshot, fetchAndRender, 'zoom-out');
    }
}

export function resetZoom(fetchAndRender: () => void): void {
    dbgGroup('resetZoom', () => {
        dbg('initialView', appState.initialView);
    });
    if (!appState.initialView) return;
    setZoomHistory([]);
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

export function initResetZoomListener(onResetZoom: () => void): void {
    window.addEventListener('edatime:reset-zoom', () => {
        onResetZoom();
    });
}

/**
 * Listen for the zoom-out toolbar button so `#zoom-out-btn` reuses the
 * same event-driven path as `#zoom-reset-btn`. Without this listener the
 * click was previously wired in `exportControls.ts` with an empty
 * `fetchAndRender` callback, which left the chart visually stuck at
 * the zoomed-in window after a single box zoom + click (−).
 */
export function initZoomOutListener(onZoomOut: () => void): void {
    window.addEventListener('edatime:zoom-out', () => {
        onZoomOut();
    });
}
