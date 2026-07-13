/**
 * Toolbar controls: zoom, draw, labels, export, analysis status.
 * Thin orchestrator that delegates to focused sub-modules.
 */

import { chartState } from '../store/chartState.js';
import { DEBUG, dbg } from '../debug.js';
import {
    updateAnalysisZoom,
    updateAnalysisYRange,
    updateAnalysisCursor,
    updateAnalysisClick,
} from './analysisStatus.js';
import {
    refreshZoomControlsState,
    getCurrentView,
    applyViewport,
    zoomOut,
    resetZoom,
} from './viewport.js';

export {
    updateAnalysisZoom,
    updateAnalysisYRange,
    updateAnalysisCursor,
    updateAnalysisClick,
} from './analysisStatus.js';
export {
    refreshZoomControlsState,
    getCurrentView,
    applyViewport,
    zoomOut,
    resetZoom,
} from './viewport.js';

import { initToolbarModals } from './exportControls.js';
import { initDrawControls } from './drawControls.js';
import { bindInfoPopovers } from './infoPopovers.js';
import { initChartTextControls } from './chartTextControls.js';
import { initAnalyticsControls } from './analyticsControls.js';
import { initQuickRangeControls, refreshQuickRangeControls } from './quickRange.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

// ─── Bind chart events to analysis panel ────────────────────────────────────

let debugLastCrosshairLogTs = 0;
const analysisBoundCharts = new WeakSet<object>();

export function bindAnalysisChartEvents(): void {
    const chart = chartState.chart;
    if (!chart || analysisBoundCharts.has(chart)) return;

    chart.onCrosshairMove?.((payload: any) => {
        let x = Number(payload?.x);
        if (Number.isFinite(x) && x < 100_000_000_000) {
            const dom = chart.getXDomain?.();
            if (dom?.min && Number.isFinite(dom.min)) x = dom.min + x;
        }
        updateAnalysisCursor(x);

        if (DEBUG) {
            const now = Date.now();
            const last = debugLastCrosshairLogTs;
            if (now - last >= 500) {
                debugLastCrosshairLogTs = now;
                dbg('crosshair-debug', { payload, xAbs: x, chartYRange: chart.getYRange?.() });
            }
        }
    });

    chart.onClick?.((payload: any) => {
        if (payload?.value && payload.value.length >= 2) {
            const x0 = Number(payload.value[0]);
            if (Number.isFinite(x0) && x0 < 100_000_000_000) {
                const dom = chart.getXDomain?.();
                if (dom?.min && Number.isFinite(dom.min)) {
                    payload = { ...payload, value: [dom.min + x0, payload.value[1]] };
                }
            }
        }
        updateAnalysisClick(payload);
    });

    analysisBoundCharts.add(chart);
}

// ─── Loading state helper ─────────────────────────────────────────────────────

export function setComputeLoading(btnId: string, overlayId: string, loading: boolean, label = 'Compute'): void {
    const btn = document.getElementById(btnId) as HTMLButtonElement | null;
    const overlay = document.getElementById(overlayId) as HTMLElement | null;
    if (btn) { btn.disabled = loading; btn.textContent = loading ? 'Computing…' : label; }
    if (overlay) overlay.hidden = !loading;
}

// ─── Main init — wires all sub-controls ─────────────────────────────────────

export function initAnalysisControls(
    fetchAndRender: () => void,
    zoomOutAction: (() => void) | undefined = undefined,
    resetZoomAction: (() => void) | undefined = undefined,
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'setViewport' | 'subscribe'>,
): void {
    const runZoomOut = zoomOutAction ?? (() => zoomOut(fetchAndRender, workspace));
    const runResetZoom = resetZoomAction ?? (() => resetZoom(fetchAndRender, workspace));
    bindInfoPopovers();
    initToolbarModals({ onZoomOut: runZoomOut, onResetZoom: runResetZoom });
    initDrawControls(fetchAndRender, workspace);
    initChartTextControls();
    initAnalyticsControls();

    initQuickRangeControls(fetchAndRender, workspace);

    refreshZoomControlsState();
}
