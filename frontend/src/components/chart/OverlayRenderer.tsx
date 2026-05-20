/**
 * OverlayRenderer — SolidJS canvas overlay for chart annotations.
 *
 * Renders on top of the chart canvas:
 *  - Drawing overlays (arrows, boxes) from drag interactions
 *  - Rolling bands as semi-transparent fill regions
 *  - Anomaly regions as highlighted rectangles
 *  - Adaptive filter points as crosshairs
 *  - Chart title and axis labels
 *
 * This component is chart-engine agnostic — it receives raw data coordinates
 * and converts them to CSS pixels internally using viewport bounds.
 */
import { Component, createEffect, onMount, onCleanup } from 'solid-js';
import { DEFAULT_GRID } from './chartEngine';
import type { RollingBandData, AnomalyRegionData } from '../../types';
import type { DragState } from '../../types/api';
import type { AdaptiveLineFilterPoints } from '../../types';
import type { PendingAdaptivePoint } from '../../types';
import type { Drawing } from '../../types/domains';
import type { ChartViewport } from '../../types';

interface OverlayRendererProps {
  /** Rolling band overlays */
  rollingBands?: RollingBandData[];
  /** Anomaly region overlays */
  anomalyRegions?: AnomalyRegionData[];
  /** Active drawings from user annotations */
  drawings?: Drawing[];
  /** Viewport bounds in data coordinates */
  viewport: ChartViewport;
  /** Drag selection state (when drawing a zoom box) */
  drag: DragState | null;
  /** Current draw mode */
  drawMode?: 'pan' | 'zoom' | 'arrow' | 'box';
  /** Drawing color */
  drawColor?: string;
  /** Drawing line width */
  drawWidth?: number;
  /** Container dimensions */
  containerWidth: number;
  containerHeight: number;
  /** Chart title */
  chartTitle?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** Pending adaptive filter point */
  pendingAdaptivePoint?: PendingAdaptivePoint | null;
  /** Active adaptive line filters */
  adaptiveLineFilters?: AdaptiveLineFilterPoints[];
  /** Series data for drawing labels */
  seriesData?: Array<{ name: string; color?: string; data: [number, number][] }>;
}

const CHART_GRID = DEFAULT_GRID;

const toCssX = (dataX: number, cssW: number, vb: ChartViewport): number => {
  const plotLeft = CHART_GRID.left;
  const plotRight = cssW - CHART_GRID.right;
  const plotWidth = Math.max(1, plotRight - plotLeft);
  const xNorm = Math.max(0, Math.min(1, (dataX - vb.xMin) / (vb.xMax - vb.xMin)));
  return plotLeft + xNorm * plotWidth;
};

const toCssY = (dataY: number, cssH: number, vb: ChartViewport): number => {
  const plotTop = CHART_GRID.top;
  const plotBottom = cssH - CHART_GRID.bottom;
  const plotHeight = Math.max(1, plotBottom - plotTop);
  const yNorm = Math.max(0, Math.min(1, (vb.yMax - dataY) / (vb.yMax - vb.yMin)));
  return plotTop + yNorm * plotHeight;
};

const OverlayRenderer: Component<OverlayRendererProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let resizeObserver: ResizeObserver | null = null;
  let isPointerDown = false;
  let drawStartX = 0;
  let drawStartY = 0;
  let drawCurrentX = 0;
  let drawCurrentY = 0;

  const isDrawingMode = () => props.drawMode === 'arrow' || props.drawMode === 'box';

  const render = () => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    renderRollingBands(ctx, cssW, cssH);
    renderAnomalyRegions(ctx, cssW, cssH);
    renderDrawings(ctx, cssW, cssH);
    renderDragBox(ctx, cssW, cssH);
    renderAdaptiveFilterLines(ctx, cssW, cssH);
    renderPendingPoint(ctx, cssW, cssH);
    renderLabels(ctx, cssW, cssH);

    ctx.restore();
  };

  const renderRollingBands = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const bands = props.rollingBands ?? [];
    const vb = props.viewport;
    for (const band of bands) {
      if (!band.ts || band.ts.length < 2) continue;
      const xStart = toCssX(band.ts[0], cssW, vb);
      const xEnd = toCssX(band.ts[band.ts.length - 1], cssW, vb);

      if (xEnd <= CHART_GRID.left || xStart >= cssW - CHART_GRID.right) continue;

      // Render as filled band between lower1 and upper1
      const renderBandPath = (ys: (number | null)[], alpha: number, color: string) => {
        const pts: [number, number][] = [];
        for (let i = 0; i < band.ts.length; i++) {
          const y = ys[i];
          if (y !== null && Number.isFinite(y)) {
            pts.push([toCssX(band.ts[i], cssW, vb), toCssY(y, cssH, vb)]);
          }
        }
        if (pts.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        for (let i = pts.length - 1; i >= 0; i--) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      };

      // Upper band (mean + 1σ)
      renderBandPath(band.upper1, 0.15, '#5b8dd9');
      // Lower band (mean - 1σ)
      renderBandPath(band.lower1, 0.1, '#5b8dd9');
    }
  };

  const renderAnomalyRegions = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const regions = props.anomalyRegions ?? [];
    const vb = props.viewport;
    for (const region of regions) {
      const xStart = toCssX(region.start_ms, cssW, vb);
      const xEnd = toCssX(region.end_ms, cssW, vb);
      if (xEnd <= CHART_GRID.left || xStart >= cssW - CHART_GRID.right) continue;

      const yTop = CHART_GRID.top;
      const yBottom = cssH - CHART_GRID.bottom;

      ctx.fillStyle = region.method === 'std' ? 'rgba(255,80,80,0.2)' : 'rgba(255,160,0,0.2)';
      ctx.fillRect(xStart, yTop, xEnd - xStart, yBottom - yTop);
    }
  };

  const renderDrawings = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const drawings = props.drawings ?? [];
    const vb = props.viewport;
    const color = props.drawColor ?? '#00d4ff';
    const width = props.drawWidth ?? 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const drawing of drawings) {
      if (drawing.kind === 'arrow' && drawing.points.length >= 2) {
        const [x1, y1] = drawing.points[0];
        const [x2, y2] = drawing.points[1];
        const cssX1 = toCssX(x1, cssW, vb);
        const cssY1 = toCssY(y1, cssH, vb);
        const cssX2 = toCssX(x2, cssW, vb);
        const cssY2 = toCssY(y2, cssH, vb);

        // Draw line
        ctx.beginPath();
        ctx.moveTo(cssX1, cssY1);
        ctx.lineTo(cssX2, cssY2);
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(cssY2 - cssY1, cssX2 - cssX1);
        const headLen = 10;
        ctx.beginPath();
        ctx.moveTo(cssX2, cssY2);
        ctx.lineTo(
          cssX2 - headLen * Math.cos(angle - Math.PI / 6),
          cssY2 - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(cssX2, cssY2);
        ctx.lineTo(
          cssX2 - headLen * Math.cos(angle + Math.PI / 6),
          cssY2 - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      } else if (drawing.kind === 'box' && drawing.points.length >= 2) {
        const [x1, y1] = drawing.points[0];
        const [x2, y2] = drawing.points[1];
        const cssX1 = toCssX(x1, cssW, vb);
        const cssY1 = toCssY(y1, cssH, vb);
        const cssX2 = toCssX(x2, cssW, vb);
        const cssY2 = toCssY(y2, cssH, vb);

        ctx.strokeRect(
          Math.min(cssX1, cssX2),
          Math.min(cssY1, cssY2),
          Math.abs(cssX2 - cssX1),
          Math.abs(cssY2 - cssY1)
        );
      }
    }
  };

  const renderDragBox = (ctx: CanvasRenderingContext2D, cssW: number, _cssH: number) => {
    const drag = props.drag;
    if (!drag) return;

    const vb = props.viewport;
    const { startX, startY, endX, endY } = drag;

    // Convert drag pixel coords to data coords then back to CSS for display
    // The drag box is already positioned in CSS by ChartView; here we just
    // render a highlight if needed
    const cssX1 = toCssX(
      vb.xMin + ((startX - CHART_GRID.left) / (cssW - CHART_GRID.left - CHART_GRID.right)) * (vb.xMax - vb.xMin),
      cssW,
      vb
    );
    // We render the drag selection box directly as CSS on the ChartView div,
    // so this render pass just needs a subtle overlay if the user wants one
  };

  const renderAdaptiveFilterLines = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const filters = props.adaptiveLineFilters ?? [];
    const vb = props.viewport;

    ctx.strokeStyle = '#ff9040';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    for (const filter of filters) {
      if (filter.points.length < 2) continue;
      ctx.beginPath();
      const [x0, y0] = filter.points[0];
      ctx.moveTo(toCssX(x0, cssW, vb), toCssY(y0, cssH, vb));
      for (let i = 1; i < filter.points.length; i++) {
        const [x, y] = filter.points[i];
        ctx.lineTo(toCssX(x, cssW, vb), toCssY(y, cssH, vb));
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);
  };

  const renderPendingPoint = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const point = props.pendingAdaptivePoint;
    if (!point || point.x2 === null) return;

    const cssX1 = toCssX(point.x1, cssW, props.viewport);
    const cssY1 = toCssY(point.y1, cssH, props.viewport);
    const cssX2 = toCssX(point.x2 ?? 0, cssW, props.viewport);
    const cssY2 = toCssY(point.y2 ?? 0, cssH, props.viewport);

    // Draw crosshair at both points
    const drawCrosshair = (cx: number, cy: number) => {
      const size = 8;
      ctx.strokeStyle = '#ff9040';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - size, cy);
      ctx.lineTo(cx + size, cy);
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx, cy + size);
      ctx.stroke();
    };

    drawCrosshair(cssX1, cssY1);
    if (point.x2 !== null) drawCrosshair(cssX2, cssY2);

    // Draw connecting line
    ctx.strokeStyle = '#ff9040';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cssX1, cssY1);
    ctx.lineTo(cssX2, cssY2);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const renderLabels = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    if (props.chartTitle) {
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(props.chartTitle, cssW / 2, CHART_GRID.top / 2 + 6);
    }

    if (props.xAxisLabel) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText(props.xAxisLabel, cssW / 2, cssH - 8);
    }

    if (props.yAxisLabel) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(12, cssH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(props.yAxisLabel, 0, 0);
      ctx.restore();
    }
  };

  onMount(() => {
    if (!canvasRef) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvasRef.clientWidth || 1;
    const cssH = canvasRef.clientHeight || 1;
    canvasRef.width = cssW * dpr;
    canvasRef.height = cssH * dpr;

    render();

    resizeObserver = new ResizeObserver(() => {
      if (!canvasRef) return;
      const w = canvasRef.clientWidth;
      const h = canvasRef.clientHeight;
      const dpr2 = window.devicePixelRatio || 1;
      canvasRef.width = w * dpr2;
      canvasRef.height = h * dpr2;
      render();
    });
    resizeObserver.observe(canvasRef);
  });

  createEffect(() => {
    // Re-render when any prop changes
    void props.viewport;
    void props.drag;
    void props.drawMode;
    void props.drawings;
    void props.rollingBands;
    void props.anomalyRegions;
    void props.adaptiveLineFilters;
    void props.pendingAdaptivePoint;
    void props.chartTitle;
    void props.xAxisLabel;
    void props.yAxisLabel;
    void props.containerWidth;
    void props.containerHeight;
    render();
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        'pointer-events': 'none',
        'z-index': 4,
      }}
    />
  );
}

export default OverlayRenderer;