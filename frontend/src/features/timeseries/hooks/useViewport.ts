/**
 * useViewport - viewport signal + zoom history for timeseries.
 *
 * Thin wrapper over timeseriesStore that exposes viewport as a signal
 * and zoom history navigation (zoom in/out/reset).
 */
import { createMemo, type Accessor } from 'solid-js';
import {
    timeseriesStore,
    setViewport,
    setInitialView,
    pushViewport,
    stepBackZoom,
    resetZoom,
} from '../domain/store';
import type { ChartViewport } from '../domain/types';

export interface UseViewportResult {
    viewport: Accessor<ChartViewport>;
    setViewport: (vp: ChartViewport) => void;
    setInitialView: (vp: ChartViewport) => void;
    pushViewport: (vp: ChartViewport) => void;
    zoomIn: (factor?: number) => void;
    zoomOut: () => void;
    resetZoom: () => void;
}

export function useViewport(): UseViewportResult {
    const viewport = createMemo(() => timeseriesStore.state.viewport);

    const zoomIn = (factor = 0.5) => {
        const current = viewport();
        const xRange = current.xMax - current.xMin;
        const yRange = current.yMax - current.yMin;
        setViewport({
            xMin: current.xMin + xRange * factor,
            xMax: current.xMax - xRange * factor,
            yMin: current.yMin + yRange * factor,
            yMax: current.yMax - yRange * factor,
        });
    };

    return {
        viewport,
        setViewport: (vp) => { pushViewport(vp); },
        setInitialView,
        pushViewport,
        zoomIn,
        zoomOut: stepBackZoom,
        resetZoom,
    };
}
