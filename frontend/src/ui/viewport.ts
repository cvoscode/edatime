/**
 * viewport — zoom, view-history, and chart-gesture controls.
 * Manages zoom-out, reset-to-initial, and the zoom history stack.
 */

import {
    chartState,
    setViewport,
    setZoomHistory,
} from '../store/chartState.js';
import { subscribe } from '../store/events.js';
import { dbg, dbgGroup } from '../debug.js';
import { updateAnalysisZoom, updateAnalysisYRange } from './analysisStatus.js';
import type { ViewSnapshot } from '../types/chart.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

// Keep the zoom-range badge in sync with the store regardless of which
// path mutates `chartState.currentStart/currentEnd` or `chartState.initialView`.
// Without this, the badge only refreshed when the legacy `applyViewport()`
// path ran; zoom-in interactions (chart callbacks, range controls, dataset
// reloads) bypassed that path and the badge would stay stuck on its
// previous percentage.
let zoomBadgeSubscriptionsInstalled = false;
function installZoomBadgeSubscriptions(): void {
    if (zoomBadgeSubscriptionsInstalled) return;
    zoomBadgeSubscriptionsInstalled = true;
    subscribe('chart:viewport', () => updateZoomRangeBadge());
    subscribe('chart:initialView', () => updateZoomRangeBadge());
}

export function refreshZoomControlsState(): void {
    installZoomBadgeSubscriptions();
    const supportsZoom = !!chartState.chart?.supportsZoomControls?.();
    const resetBtn = document.getElementById('zoom-reset-btn') as HTMLButtonElement | null;
    if (resetBtn) resetBtn.disabled = !supportsZoom;
    updateZoomRangeBadge();
}

export function updateZoomRangeBadge(): void {
    const badge = document.getElementById('zoom-range-badge');
    if (!badge) return;
    const init = chartState.initialView;
    const curr = chartState.currentStart !== null && chartState.currentEnd !== null
        ? chartState.currentEnd - chartState.currentStart
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
    const yr = chartState.chart?.getYRange?.();
    return {
        xMin: chartState.currentStart,
        xMax: chartState.currentEnd,
        yMin: yr?.min ?? null,
        yMax: yr?.max ?? null,
    };
}

/**
 * Legacy toolbar/quick-range adapter. Its state transition is intentionally
 * self-contained: the Timeseries controller owns cached data, request
 * scheduling, and restore policy for chart gestures.
 */
export function applyViewport(
    view: ViewSnapshot,
    fetchAndRender: () => void,
    sourceKind = 'api',
    workspace?: Pick<WorkspaceStore, 'setViewport'>,
): void {
    dbgGroup(`applyViewport (${sourceKind})`, () => dbg('incoming view', view));
    workspace?.setViewport(view);
    setViewport(view.xMin, view.xMax);
    chartState.chart?.setXRange?.(chartState.currentStart as number, chartState.currentEnd as number);
    updateAnalysisZoom(chartState.currentStart as number, chartState.currentEnd as number, sourceKind);

    if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax! > view.yMin!) {
        chartState.chart?.setYRange?.(view.yMin!, view.yMax!);
        updateAnalysisYRange(view.yMin!, view.yMax!, 'restore');
    } else {
        chartState.chart?.resetYRange?.();
    }

    queueMicrotask(fetchAndRender);
    updateZoomRangeBadge();
}

export function zoomOut(fetchAndRender: () => void): void {
    if (chartState.zoomHistory.length > 0) {
        const nextHistory = chartState.zoomHistory.slice(0, -1);
        const nextView = chartState.zoomHistory[chartState.zoomHistory.length - 1] as ViewSnapshot;
        setZoomHistory(nextHistory);
        applyViewport(nextView, fetchAndRender, 'zoom-out');
    } else if (chartState.initialView) {
        applyViewport(chartState.initialView as ViewSnapshot, fetchAndRender, 'zoom-out');
    }
}

export function resetZoom(fetchAndRender: () => void): void {
    if (!chartState.initialView) return;
    setZoomHistory([]);
    applyViewport(chartState.initialView as ViewSnapshot, fetchAndRender, 'reset');
}
