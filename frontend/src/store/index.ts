/**
 * store — central pub/sub state container.
 *
 * Exposes sub-states and provides a simple event emitter so UI modules
 * can react to state changes without polling.
 *
 * Usage:
 *   import { store, chartState, uiState, datasetState } from './store/index.js';
 *   store.subscribe('chart:viewport', ({ start, end }) => { ... });
 */

import { datasetState, type DatasetState } from './datasetState.js';
import { uiState, type UiState } from './uiState.js';
import { analyticsState, type AnalyticsState } from './analyticsState.js';
import { chartState, type ChartState } from './chartState.js';
import { scatterState, type ScatterState } from './scatterState.js';
import { runtimeState, type RuntimeState } from './runtimeState.js';
import { clearSubscribers, subscribe, unsubscribe } from './events.js';

export { chartState, analyticsState, uiState, datasetState, scatterState, runtimeState, subscribe, unsubscribe };
export type { ChartState, AnalyticsState, UiState, DatasetState, ScatterState, RuntimeState };
export * from './analyticsState.js';
export * from './chartState.js';
export * from './datasetState.js';
export * from './runtimeState.js';
export * from './scatterState.js';
export * from './uiState.js';

/* ── Store ────────────────────────────────────────────────────────────────── */

export const store = {
    subscribe,
    unsubscribe,
    clearSubscribers,

    get<K extends keyof ChartState>(key: K): ChartState[K] {
        switch (key) {
            case 'chart': return chartState[key];
            default: return chartState[key] as ChartState[K];
        }
    },

    set<K extends keyof ChartState>(key: K, value: ChartState[K]): void {
        chartState[key] = value;
    },
};
