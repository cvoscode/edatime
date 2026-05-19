import { createSignal } from 'solid-js';
import type { GridConfig } from './chartEngine';

export interface ViewportBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface ChartViewportOptions {
  grid: GridConfig;
  initialBounds?: ViewportBounds;
  onZoom?: (start: number, end: number, yMin?: number, yMax?: number) => void;
  onZoomOut?: () => void;
  onCtrlClick?: (dataX: number, dataY: number, clientX: number, clientY: number) => void;
}

/**
 * useChartViewport manages viewport state and data↔CSS coordinate conversion.
 * Encapsulates all viewport math so it can be tested independently and reused
 * across different chart hosts.
 */
export function useChartViewport(
  containerRef: () => HTMLElement | undefined,
  options: ChartViewportOptions
) {
  const [viewportBounds, setViewportBounds] = createSignal<ViewportBounds>(
    options.initialBounds ?? { xMin: 0, xMax: 100, yMin: 0, yMax: 1 }
  );

  const dataToCss = (dataX: number, dataY: number, containerWidth: number, containerHeight: number): { cssX: number; cssY: number } => {
    const vb = viewportBounds();
    const plotLeft = options.grid.left;
    const plotRight = containerWidth - options.grid.right;
    const plotTop = options.grid.top;
    const plotBottom = containerHeight - options.grid.bottom;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);

    const xNorm = (dataX - vb.xMin) / (vb.xMax - vb.xMin);
    const yNorm = (vb.yMax - dataY) / (vb.yMax - vb.yMin);
    const cssX = plotLeft + xNorm * plotWidth;
    const cssY = plotTop + yNorm * plotHeight;
    return { cssX, cssY };
  };

  const cssToData = (cssX: number, cssY: number, containerWidth: number, containerHeight: number): { dataX: number; dataY: number } => {
    const vb = viewportBounds();
    const plotLeft = options.grid.left;
    const plotRight = containerWidth - options.grid.right;
    const plotTop = options.grid.top;
    const plotBottom = containerHeight - options.grid.bottom;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);

    const xNorm = Math.max(0, Math.min(1, (cssX - plotLeft) / plotWidth));
    const yNorm = Math.max(0, Math.min(1, (cssY - plotTop) / plotHeight));
    const dataX = vb.xMin + xNorm * (vb.xMax - vb.xMin);
    const dataY = vb.yMax - yNorm * (vb.yMax - vb.yMin);
    return { dataX, dataY };
  };

  const cssToDataBounds = (
    xMin: number, xMax: number, yMin: number, yMax: number,
    containerWidth: number, containerHeight: number
  ): { xMin: number; xMax: number; yMin: number; yMax: number } => {
    const vb = viewportBounds();
    const plotLeft = options.grid.left;
    const plotRight = containerWidth - options.grid.right;
    const plotTop = options.grid.top;
    const plotBottom = containerHeight - options.grid.bottom;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);

    const dataXMin = vb.xMin + ((xMin - plotLeft) / plotWidth) * (vb.xMax - vb.xMin);
    const dataXMax = vb.xMin + ((xMax - plotLeft) / plotWidth) * (vb.xMax - vb.xMin);
    const dataYMin = vb.yMin + ((yMax - plotTop) / plotHeight) * (vb.yMax - vb.yMin);
    const dataYMax = vb.yMin + ((yMin - plotTop) / plotHeight) * (vb.yMax - vb.yMin);
    return { xMin: dataXMin, xMax: dataXMax, yMin: dataYMin, yMax: dataYMax };
  };

  const handleCtrlClick = (e: MouseEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const rect = containerRef()?.getBoundingClientRect();
    if (!rect) return;
    const { dataX, dataY } = cssToData(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    if (Number.isFinite(dataX) && Number.isFinite(dataY)) {
      options.onCtrlClick?.(dataX, dataY, e.clientX, e.clientY);
    }
  };

  const handleWheelZoom = (e: WheelEvent, factor: number = 0.87) => {
    if (e.shiftKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    const rect = containerRef()?.getBoundingClientRect();
    if (!rect) return;
    const vb = viewportBounds();
    const xRange = vb.xMax - vb.xMin;
    if (xRange <= 0) return;

    const plotLeft = options.grid.left;
    const plotRight = rect.width - options.grid.right;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const relX = (e.clientX - rect.left - plotLeft) / plotWidth;
    const centerDataX = vb.xMin + relX * xRange;
    const deltaFactor = e.deltaY > 0 ? 1.15 : factor;
    const newXMin = centerDataX - (centerDataX - vb.xMin) * deltaFactor;
    const newXMax = centerDataX + (vb.xMax - centerDataX) * deltaFactor;
    if (newXMax > newXMin && Number.isFinite(newXMin) && Number.isFinite(newXMax)) {
      options.onZoom?.(newXMin, newXMax);
    }
  };

  const handleBoxZoom = (
    startX: number, startY: number, endX: number, endY: number,
    containerWidth: number, containerHeight: number
  ) => {
    const bounds = cssToDataBounds(startX, endX, startY, endY, containerWidth, containerHeight);
    if (bounds.xMax > bounds.xMin && bounds.yMax > bounds.yMin) {
      options.onZoom?.(bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax);
    }
  };

  return {
    viewportBounds,
    setViewportBounds,
    dataToCss,
    cssToData,
    cssToDataBounds,
    handleCtrlClick,
    handleWheelZoom,
    handleBoxZoom,
  };
}