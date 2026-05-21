/**
 * useChartViewportSync — composable that keeps chartStore viewport in sync
 * with the feature domain.
 *
 * Reads viewport from chartStore, exposes it as a signal, and provides typed
 * setters that write back to chartStore.
 *
 * This is the single source of truth for timeseries viewport state.
 * Consumers should NOT read chartStore.state.viewport directly.
 */
import { createMemo, Accessor } from 'solid-js';
import { chartStore } from '@/stores/chartStore';
import type { ChartViewport } from '@/types';

export interface ViewportActions {
    setViewport: (vp: Partial<ChartViewport>) => void;
    setYAuto: (auto: boolean) => void;
    stepBackZoom: () => void;
    forceResetZoom: () => void;
    zoomOut: () => void;
    zoomIn: () => void;
}

export interface UseChartViewportSyncReturn {
    /** Signal: current viewport from chartStore */
    viewport: Accessor<ChartViewport>;
    /** Signal: true when viewport has been initialized from dataset metadata */
    initialView: Accessor<ChartViewport | null>;
    /** Viewport mutation actions (write back to chartStore) */
    actions: ViewportActions;
}

export function useChartViewportSync(): UseChartViewportSyncReturn {
    const viewport = createMemo(() => chartStore.state.viewport);
    const initialView = createMemo(() => chartStore.state.initialView ?? null);

    const actions: ViewportActions = {
        setViewport: (vp) => {
            const current = chartStore.state.viewport;
            chartStore.setViewport({ ...current, ...vp });
        },
        setYAuto: (auto) => chartStore.setYAuto(auto),
        stepBackZoom: () => chartStore.stepBackZoom(),
        forceResetZoom: () => chartStore.forceResetZoom(),
        zoomOut: () => chartStore.zoomOut(),
        zoomIn: () => chartStore.zoomIn(),
    };

    return { viewport, initialView, actions };
}