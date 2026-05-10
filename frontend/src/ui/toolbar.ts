/**
 * Toolbar controls: zoom, draw, labels, export, analysis status.
 * Thin orchestrator that delegates to focused sub-modules.
 */

import {
    appState,
} from '../state.js';
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
    initChartPageFilterGesture,
    initResetZoomListener,
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
    initChartPageFilterGesture,
} from './viewport.js';

import { initToolbarModals } from './exportControls.js';
import { initDrawControls } from './drawControls.js';
import { initChartTextControls } from './chartTextControls.js';
import { initAnalyticsControls } from './analyticsControls.js';
import { initPageNavigation } from './pageNavigation.js';

import { exportChartFilteredData } from './exportControls.js';

// ─── Bind chart events to analysis panel ────────────────────────────────────

export function bindAnalysisChartEvents(): void {
    if (!appState.chart || appState.analysisBound) return;

    appState.chart.onCrosshairMove?.((payload: any) => {
        let x = Number(payload?.x);
        if (Number.isFinite(x) && x < 100_000_000_000) {
            const dom = appState.chart?.getXDomain?.();
            if (dom?.min && Number.isFinite(dom.min)) x = dom.min + x;
        }
        updateAnalysisCursor(x);

        if (DEBUG) {
            const now = Date.now();
            const last = (appState as any)._debugLastCrosshairLogTs ?? 0;
            if (now - last >= 500) {
                (appState as any)._debugLastCrosshairLogTs = now;
                dbg('crosshair-debug', { payload, xAbs: x, chartYRange: appState.chart?.getYRange?.() });
            }
        }
    });

    appState.chart.onClick?.((payload: any) => {
        if (payload?.value && payload.value.length >= 2) {
            const x0 = Number(payload.value[0]);
            if (Number.isFinite(x0) && x0 < 100_000_000_000) {
                const dom = appState.chart?.getXDomain?.();
                if (dom?.min && Number.isFinite(dom.min)) {
                    payload = { ...payload, value: [dom.min + x0, payload.value[1]] };
                }
            }
        }
        updateAnalysisClick(payload);
    });

    appState.analysisBound = true;
}

// ─── Main init — wires all sub-controls ─────────────────────────────────────

export function initAnalysisControls(fetchAndRender: () => void): void {
    window.__edatime = window.__edatime || {};
    window.__edatime.exportChartFilteredData = exportChartFilteredData;

    initToolbarModals();
    initDrawControls(fetchAndRender);
    initChartTextControls();
    initAnalyticsControls();

    initResetZoomListener(fetchAndRender);
    refreshZoomControlsState();
}

export function initPages(): void {
    initPageNavigation();
}