/**
 * ViewportManager — reactive viewport state with zoom history.
 *
 * Manages a zoom stack with current index, supporting push/zoom-in/zoom-out/reset.
 * Uses SolidJS signals internally so consumers can react to viewport changes
 * without polling.
 */
import { createSignal, Accessor } from 'solid-js';
import type { ChartViewport } from '../../types';

export interface ZoomState {
  zoomStack: ChartViewport[];
  currentIndex: number;
}

const MAX_ZOOM_STACK = 50;

function defaultViewport(): ChartViewport {
  return { xMin: 0, xMax: 100, yMin: 0, yMax: 1 };
}

function isValidViewport(v: ChartViewport): boolean {
  return (
    Number.isFinite(v.xMin) &&
    Number.isFinite(v.xMax) &&
    Number.isFinite(v.yMin) &&
    Number.isFinite(v.yMax) &&
    v.xMax > v.xMin &&
    v.yMax > v.yMin
  );
}

function cloneViewport(v: ChartViewport): ChartViewport {
  return { xMin: v.xMin, xMax: v.xMax, yMin: v.yMin, yMax: v.yMax };
}

/**
 * Creates a ViewportManager with optional initial viewport.
 * The manager maintains a zoom stack and exposes reactive accessors.
 */
export function createViewportManager(initialViewport?: ChartViewport): ViewportManager {
  const [viewport, setViewport] = createSignal<ChartViewport>(initialViewport ?? defaultViewport());
  const [initialView, setInitialView] = createSignal<ChartViewport | null>(
    initialViewport ? cloneViewport(initialViewport) : null
  );
  const [zoomStack, setZoomStack] = createSignal<ChartViewport[]>(
    initialViewport ? [cloneViewport(initialViewport)] : []
  );
  const [currentIndex, setCurrentIndex] = createSignal(0);

  const pushViewport = (newViewport: ChartViewport) => {
    if (!isValidViewport(newViewport)) return;

    const stack = [...zoomStack()];
    const idx = currentIndex();

    // Truncate forward history when pushing a new viewport
    const truncated = stack.slice(0, idx + 1);

    // Add new viewport, respecting max stack size
    const next = [...truncated, cloneViewport(newViewport)];
    if (next.length > MAX_ZOOM_STACK) {
      next.shift();
    }

    setZoomStack(next);
    setCurrentIndex(next.length - 1);
    setViewport(cloneViewport(newViewport));
  };

  const zoomIn = (factor = 0.5) => {
    const vb = viewport();
    const xRange = vb.xMax - vb.xMin;
    const yRange = vb.yMax - vb.yMin;
    if (xRange <= 0 || yRange <= 0) return;

    const xCenter = (vb.xMin + vb.xMax) / 2;
    const yCenter = (vb.yMin + vb.yMax) / 2;
    const halfW = (xRange * factor) / 2;
    const halfH = (yRange * factor) / 2;

    const newViewport: ChartViewport = {
      xMin: xCenter - halfW,
      xMax: xCenter + halfW,
      yMin: yCenter - halfH,
      yMax: yCenter + halfH,
    };

    pushViewport(newViewport);
  };

  const zoomOut = (factor = 0.5) => {
    const vb = viewport();
    // Zoom out = zoom in with inverted factor (expand range)
    zoomIn(1 / factor);
  };

  const resetToInitial = () => {
    const init = initialView();
    if (init) {
      pushViewport(cloneViewport(init));
    }
  };

  const canZoomIn = (): boolean => {
    const vb = viewport();
    // Can zoom in if there's room to zoom (not at max zoom)
    return vb.xMax - vb.xMin > 1e-9;
  };

  const canZoomOut = (): boolean => {
    const idx = currentIndex();
    const stack = zoomStack();
    // Can zoom out if not at the oldest entry
    return idx > 0;
  };

  return {
    viewport,
    initialView,
    zoomHistory: (): ZoomState => ({ zoomStack: zoomStack(), currentIndex: currentIndex() }),
    pushViewport,
    zoomIn,
    zoomOut,
    resetToInitial,
    canZoomIn,
    canZoomOut,
  };
}

/**
 * ViewportManager interface — returned by createViewportManager.
 * All properties are accessors (SolidJS signals) to ensure reactive updates.
 */
export interface ViewportManager {
  /** Current viewport in data coordinates */
  viewport: Accessor<ChartViewport>;

  /** Initial viewport set at creation, or null if not set */
  initialView: Accessor<ChartViewport | null>;

  /** Full zoom state (stack + current index) */
  zoomHistory: Accessor<ZoomState>;

  /** Push a new viewport onto the stack */
  pushViewport(viewport: ChartViewport): void;

  /** Zoom in by factor (default 0.5 = 50% of current range) */
  zoomIn(factor?: number): void;

  /** Zoom out by factor (default 0.5 = expand to 200% of current range) */
  zoomOut(factor?: number): void;

  /** Reset to the initial viewport */
  resetToInitial(): void;

  /** Whether zoom-in is available (not at min zoom level) */
  canZoomIn(): boolean;

  /** Whether zoom-out is available (not at oldest stack entry) */
  canZoomOut(): boolean;
}