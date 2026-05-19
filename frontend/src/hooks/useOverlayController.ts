/**
 * Hook that manages chart overlays (rolling bands, anomaly regions, drawings)
 * and coordinates rendering between the chart and canvas overlay.
 * Does NOT render anything itself — provides data to canvas overlay via getter methods.
 */
import { createSignal } from 'solid-js';
import type { RollingBandData, AnomalyRegionData } from '../types';
import type { Drawing } from '../stores/chartStore';
import { chartStore } from '../stores/chartStore';

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
    chartStore.addDrawing(drawing);
    setRenderVersion(v => v + 1);
  };

  const removeDrawing = (id: string) => {
    // chartStore.removeDrawing is not directly exposed; drawings are managed via addDrawing/clearDrawings
    // We need to sync with chartStore's drawings array
    const current = chartStore.state.drawings;
    const updated = current.filter(d => d.id !== id);
    // Replace in store by clearing and re-adding remaining
    chartStore.clearDrawings();
    updated.forEach(d => chartStore.addDrawing(d));
    setRenderVersion(v => v + 1);
  };

  const clearDrawings = () => {
    chartStore.clearDrawings();
    setRenderVersion(v => v + 1);
  };

  const getDrawings = (): Drawing[] => {
    return chartStore.state.drawings;
  };

  const invalidate = () => {
    setRenderVersion(v => v + 1);
  };

  const dispose = () => {
    setRollingBands([]);
    setAnomalyRegions([]);
    chartStore.clearDrawings();
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
