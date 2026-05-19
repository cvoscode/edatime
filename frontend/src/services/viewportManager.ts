/**
 * ViewportManager — pure viewport math extracted from useChartViewport.
 * No signals, no side effects. Float comparison epsilon = 1e-9.
 */

export interface ViewportBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const FLOAT_EPSILON = 1e-9;

class ViewportManager {
  /**
   * Zoom in by factor (0 < factor < 1), centered on the viewport center.
   * factor defaults to 0.5 (zooms to 50% of current range).
   */
  zoomIn(viewport: ViewportBounds, factor = 0.5): ViewportBounds {
    const { xMin, xMax, yMin, yMax } = viewport;
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    if (xRange <= 0 || yRange <= 0) return { ...viewport };

    const xCenter = (xMin + xMax) / 2;
    const yCenter = (yMin + yMax) / 2;
    const halfW = (xRange * factor) / 2;
    const halfH = (yRange * factor) / 2;

    return {
      xMin: xCenter - halfW,
      xMax: xCenter + halfW,
      yMin: yCenter - halfH,
      yMax: yCenter + halfH,
    };
  }

  /**
   * Zoom out by factor (0 < factor < 1).
   * Delegates to zoomIn with the inverse factor.
   */
  zoomOut(viewport: ViewportBounds, factor = 0.5): ViewportBounds {
    // zoomIn with factor > 1 gives zoom-out behavior
    const expanded: ViewportBounds = {
      xMin: viewport.xMin,
      xMax: viewport.xMax,
      yMin: viewport.yMin,
      yMax: viewport.yMax,
    };
    return this.zoomIn(expanded, 1 / factor);
  }

  /**
   * Fit viewport to the data range with optional padding (0–1 fraction).
   */
  fitToData(
    xValues: Float64Array,
    series: Record<string, Float64Array>,
    padding = 0.05
  ): ViewportBounds {
    if (xValues.length === 0) {
      return { xMin: 0, xMax: 100, yMin: 0, yMax: 1 };
    }

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (let i = 0; i < xValues.length; i++) {
      const x = xValues[i];
      if (Number.isFinite(x)) {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
      }
      for (const col of Object.keys(series)) {
        const y = series[col]?.[i];
        if (Number.isFinite(y)) {
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
    }

    if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
      xMin = 0;
      xMax = 100;
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      yMin = 0;
      yMax = 1;
    }

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const xPad = xRange * padding;
    const yPad = yRange * padding;

    return {
      xMin: xMin - xPad,
      xMax: xMax + xPad,
      yMin: yMin - yPad,
      yMax: yMax + yPad,
    };
  }

  /** Clamp viewport to min/max bounds */
  clamp(viewport: ViewportBounds, bounds: ViewportBounds): ViewportBounds {
    return {
      xMin: Math.max(bounds.xMin, Math.min(bounds.xMax, viewport.xMin)),
      xMax: Math.max(bounds.xMin, Math.min(bounds.xMax, viewport.xMax)),
      yMin: Math.max(bounds.yMin, Math.min(bounds.yMax, viewport.yMin)),
      yMax: Math.max(bounds.yMin, Math.min(bounds.yMax, viewport.yMax)),
    };
  }

  /** Expand viewport to include a point */
  expandToInclude(
    viewport: ViewportBounds,
    x: number,
    y: number,
    padding = 0.05
  ): ViewportBounds {
    const xRange = viewport.xMax - viewport.xMin;
    const yRange = viewport.yMax - viewport.yMin;
    const xPad = xRange * padding;
    const yPad = yRange * padding;

    return {
      xMin: Math.min(viewport.xMin - xPad, x),
      xMax: Math.max(viewport.xMax + xPad, x),
      yMin: Math.min(viewport.yMin - yPad, y),
      yMax: Math.max(viewport.yMax + yPad, y),
    };
  }

  /** Check if two viewports are equal within epsilon */
  equals(a: ViewportBounds, b: ViewportBounds, epsilon = FLOAT_EPSILON): boolean {
    return (
      Math.abs(a.xMin - b.xMin) < epsilon &&
      Math.abs(a.xMax - b.xMax) < epsilon &&
      Math.abs(a.yMin - b.yMin) < epsilon &&
      Math.abs(a.yMax - b.yMax) < epsilon
    );
  }

  /** Merge viewport with a filtered range — returns intersection */
  intersect(viewport: ViewportBounds, filterRange: ViewportBounds): ViewportBounds {
    return {
      xMin: Math.max(viewport.xMin, filterRange.xMin),
      xMax: Math.min(viewport.xMax, filterRange.xMax),
      yMin: Math.max(viewport.yMin, filterRange.yMin),
      yMax: Math.min(viewport.yMax, filterRange.yMax),
    };
  }
}

const viewportManager = new ViewportManager();
export { viewportManager, ViewportManager };