/**
 * Hook that manages chart overlays (rolling bands, anomaly regions, drawings)
 * and coordinates rendering between the chart and canvas overlay.
 * Does NOT render anything itself — provides data to canvas overlay via getter methods.
 */
import { createSignal } from 'solid-js';
import type { RollingBandData, AnomalyRegionData } from '../types';
import type { Drawing } from '../types/domains';
import { timeseriesStore } from '../domain/timeseries/store';

interface OverlayController {
    setRollingBands: (bands: RollingBandData[]) => void;
    setAnomalyRegions: (regions: AnomalyRegionData[]) => void;
    addDrawing: (drawing: Drawing) => void;
    removeDrawing: (id: string) => void;
    clearDrawings: () => void;
    getDrawings: () => Drawing[];
    invalidate: () => void;
    dispose: () => void;
}

export function useOverlayController(): OverlayController {
    const [rollingBands, setRollingBands] = createSignal<RollingBandData[]>([]);
    const [anomalyRegions, setAnomalyRegions] = createSignal<AnomalyRegionData[]>([]);
    const [renderVersion, setRenderVersion] = createSignal(0);

    const addDrawing = (drawing: Drawing) => {
        timeseriesStore.addDrawing(drawing);
        setRenderVersion(v => v + 1);
    };

    const removeDrawing = (id: string) => {
        timeseriesStore.removeDrawing(id);
        setRenderVersion(v => v + 1);
    };

    const clearDrawings = () => {
        timeseriesStore.clearDrawings();
        setRenderVersion(v => v + 1);
    };

    const getDrawings = (): Drawing[] => {
        return timeseriesStore.state.drawings;
    };

    const invalidate = () => {
        setRenderVersion(v => v + 1);
    };

    const dispose = () => {
        setRollingBands([]);
        setAnomalyRegions([]);
        timeseriesStore.clearDrawings();
    };

    return {
        setRollingBands,
        setAnomalyRegions,
        addDrawing,
        removeDrawing,
        clearDrawings,
        getDrawings,
        invalidate,
        dispose,
    };
}
