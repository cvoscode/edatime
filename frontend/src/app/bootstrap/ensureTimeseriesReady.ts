/**
 * ensureTimeseriesReady — coordinate chart bootstrap and timeseries page init.
 *
 * Extracted from app.ts so the orchestrator stays thin.
 * The `ensureReady()` call is idempotent: safe to call multiple times.
 */

import type { ChartInstance } from '../../types.js';

export interface TimeseriesBootstrapDeps {
    appState: any;
    createChart: () => Promise<ChartInstance>;
    bindAnalysisChartEvents: () => void;
    fetchAndRender: () => Promise<void>;
    renderCurrentData: () => void;
}

export function createTimeseriesBootstrap(deps: TimeseriesBootstrapDeps) {
    let ready = false;
    let pending: Promise<void> | null = null;

    return {
        ensureReady: async (): Promise<void> => {
            if (ready) return;
            if (pending) return pending;
            pending = (async () => {
                await deps.createChart();
                deps.bindAnalysisChartEvents();
                await deps.fetchAndRender();
                deps.renderCurrentData();
                ready = true;
            })();
            await pending;
        },
        isReady: () => ready,
    };
}