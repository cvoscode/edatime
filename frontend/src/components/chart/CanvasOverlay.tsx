import { Component, createEffect, onMount, onCleanup } from 'solid-js';
import type { RollingBandData, AnomalyRegionData, DragState, Annotation } from '../../types';
import { chartStore } from '../../stores';
import type { Drawing } from '../../stores/chartStore';

interface CanvasOverlayProps {
  rollingBands: RollingBandData[];
  anomalyRegions: AnomalyRegionData[];
  annotations?: Annotation[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  drawMode: string;
  drag: DragState | null;
  containerWidth: number;
  containerHeight: number;
  drawColor?: string;
  drawWidth?: number;
  drawings?: Drawing[];
  chartTitle?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

const CHART_GRID = { left: 120, right: 30, top: 16, bottom: 36 };

const CanvasOverlay: Component<CanvasOverlayProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let resizeObserver: ResizeObserver | null = null;
  let isPointerDown = false;
  let drawStartX = 0;
  let drawStartY = 0;
  let drawCurrentX = 0;
  let drawCurrentY = 0;

  const isDrawingMode = () => props.drawMode === 'arrow' || props.drawMode === 'box';

  const toDataX = (cssX: number, containerWidth: number): number => {
    const plotLeft = CHART_GRID.left;
    const plotRight = containerWidth - CHART_GRID.right;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const xNorm = Math.max(0, Math.min(1, (cssX - plotLeft) / plotWidth));
    return props.xMin + xNorm * (props.xMax - props.xMin);
  };

  const toDataY = (cssY: number, containerHeight: number): number => {
    const plotTop = CHART_GRID.top;
    const plotBottom = containerHeight - CHART_GRID.bottom;
    const plotHeight = Math.max(1, plotBottom - plotTop);
    const yNorm = Math.max(0, Math.min(1, (cssY - plotTop) / plotHeight));
    return props.yMax - yNorm * (props.yMax - props.yMin);
  };

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
    renderAnnotations(ctx, cssW, cssH);
    renderDrawings(ctx, cssW, cssH);
    renderLiveDrawing(ctx, cssW, cssH);
    renderLabels(ctx, cssW, cssH);

    ctx.restore();
  };

  const renderDrawings = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const drawings = props.drawings ?? chartStore.state.drawings;
    if (!drawings || drawings.length === 0) return;
    if (!Number.isFinite(props.xMin) || !Number.isFinite(props.xMax) || props.xMax <= props.xMin) return;
    if (!Number.isFinite(props.yMin) || !Number.isFinite(props.yMax) || props.yMax <= props.yMin) return;

    const plotLeft = CHART_GRID.left;
    const plotTop = CHART_GRID.top;
    const plotRight = Math.max(plotLeft + 1, cssW - CHART_GRID.right);
    const plotBottom = Math.max(plotTop + 1, cssH - CHART_GRID.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);

    for (const d of drawings) {
      if (d.points.length < 2) continue;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.lineWidth;
      ctx.setLineDash([]);

      if (d.kind === 'box') {
        const x1 = plotLeft + ((d.points[0][0] - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
        const y1 = plotBottom - ((d.points[0][1] - props.yMin) / (props.yMax - props.yMin)) * plotHeight;
        const x2 = plotLeft + ((d.points[1][0] - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
        const y2 = plotBottom - ((d.points[1][1] - props.yMin) / (props.yMax - props.yMin)) * plotHeight;
        const bx = Math.min(x1, x2);
        const by = Math.min(y1, y2);
        const bw = Math.abs(x2 - x1);
        const bh = Math.abs(y2 - y1);
        ctx.strokeRect(bx, by, bw, bh);
      } else {
        // arrow
        const x1 = plotLeft + ((d.points[0][0] - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
        const y1 = plotBottom - ((d.points[0][1] - props.yMin) / (props.yMax - props.yMin)) * plotHeight;
        const x2 = plotLeft + ((d.points[1][0] - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
        const y2 = plotBottom - ((d.points[1][1] - props.yMin) / (props.yMax - props.yMin)) * plotHeight;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // arrowhead
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 14;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }
  };

  const renderLiveDrawing = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    if (!isPointerDown || !isDrawingMode()) return;
    if (!Number.isFinite(props.xMin) || !Number.isFinite(props.xMax) || props.xMax <= props.xMin) return;
    if (!Number.isFinite(props.yMin) || !Number.isFinite(props.yMax) || props.yMax <= props.yMin) return;

    const plotLeft = CHART_GRID.left;
    const plotTop = CHART_GRID.top;
    const plotRight = Math.max(plotLeft + 1, cssW - CHART_GRID.right);
    const plotBottom = Math.max(plotTop + 1, cssH - CHART_GRID.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);

    const color = props.drawColor ?? '#ff0055';
    const lineWidth = props.drawWidth ?? 2;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([6, 3]);

    const startDataX = toDataX(drawStartX, cssW);
    const startDataY = toDataY(drawStartY, cssH);
    const endDataX = toDataX(drawCurrentX, cssW);
    const endDataY = toDataY(drawCurrentY, cssH);

    const x1 = plotLeft + ((startDataX - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
    const y1 = plotBottom - ((startDataY - props.yMin) / (props.yMax - props.yMin)) * plotHeight;
    const x2 = plotLeft + ((endDataX - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
    const y2 = plotBottom - ((endDataY - props.yMin) / (props.yMax - props.yMin)) * plotHeight;

    if (props.drawMode === 'box') {
      const bx = Math.min(x1, x2);
      const by = Math.min(y1, y2);
      const bw = Math.abs(x2 - x1);
      const bh = Math.abs(y2 - y1);
      ctx.strokeRect(bx, by, bw, bh);
    } else {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 14;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }

    ctx.setLineDash([]);
  };

  const renderLabels = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const title = props.chartTitle;
    const xLabel = props.xAxisLabel;
    const yLabel = props.yAxisLabel;
    if (!title && !xLabel && !yLabel) return;

    ctx.save();
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';

    if (title) {
      ctx.fillText(title, cssW / 2, 20);
    }
    if (xLabel) {
      ctx.fillText(xLabel, cssW / 2, cssH - 8);
    }
    if (yLabel) {
      ctx.save();
      ctx.translate(14, cssH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (!isDrawingMode()) return;
    if (e.button !== 0) return;
    e.preventDefault();
    isPointerDown = true;
    drawStartX = e.offsetX;
    drawStartY = e.offsetY;
    drawCurrentX = e.offsetX;
    drawCurrentY = e.offsetY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isPointerDown) return;
    drawCurrentX = e.offsetX;
    drawCurrentY = e.offsetY;
    render();
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    const endDataX = toDataX(drawCurrentX, canvasRef?.clientWidth ?? 1);
    const endDataY = toDataY(drawCurrentY, canvasRef?.clientHeight ?? 1);
    const startDataX = toDataX(drawStartX, canvasRef?.clientWidth ?? 1);
    const startDataY = toDataY(drawStartY, canvasRef?.clientHeight ?? 1);

    // Require minimum drag distance
    const dx = Math.abs(endDataX - startDataX);
    const dy = Math.abs(endDataY - startDataY);
    if (dx < 2 && dy < 2) return;

    chartStore.addDrawing({
      id: `drawing_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      kind: props.drawMode as 'arrow' | 'box',
      color: props.drawColor ?? '#ff0055',
      lineWidth: props.drawWidth ?? 2,
      points: [[startDataX, startDataY], [endDataX, endDataY]],
    });
    render();
  };

  const renderRollingBands = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const bands = props.rollingBands;
    if (!bands || bands.length === 0) return;
    if (!Number.isFinite(props.xMin) || !Number.isFinite(props.xMax) || props.xMax <= props.xMin) return;
    if (!Number.isFinite(props.yMin) || !Number.isFinite(props.yMax) || props.yMax <= props.yMin) return;

    const plotLeft = CHART_GRID.left;
    const plotTop = CHART_GRID.top;
    const plotRight = Math.max(plotLeft + 1, cssW - CHART_GRID.right);
    const plotBottom = Math.max(plotTop + 1, cssH - CHART_GRID.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);
    const ySpan = Math.max(1e-9, props.yMax - props.yMin);

    const toX = (ms: number) => plotLeft + ((ms - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
    const toY = (v: number) => plotBottom - ((v - props.yMin) / ySpan) * plotHeight;

    for (const band of bands) {
      const n = band.ts.length;
      if (n < 2) continue;

      // 2-sigma band (outer, lighter)
      ctx.fillStyle = 'rgba(100, 180, 255, 0.22)';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = band.upper2[i];
        if (v == null) continue;
        const px = toX(band.ts[i]);
        const py = toY(v);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      for (let i = n - 1; i >= 0; i--) {
        const v = band.lower2[i];
        if (v == null) continue;
        ctx.lineTo(toX(band.ts[i]), toY(v));
      }
      ctx.closePath();
      ctx.fill();

      // 1-sigma band (inner, darker)
      ctx.fillStyle = 'rgba(100, 180, 255, 0.38)';
      ctx.beginPath();
      started = false;
      for (let i = 0; i < n; i++) {
        const v = band.upper1[i];
        if (v == null) continue;
        const px = toX(band.ts[i]);
        const py = toY(v);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      for (let i = n - 1; i >= 0; i--) {
        const v = band.lower1[i];
        if (v == null) continue;
        ctx.lineTo(toX(band.ts[i]), toY(v));
      }
      ctx.closePath();
      ctx.fill();

      // Mean line (dashed)
      ctx.strokeStyle = 'rgba(180, 220, 255, 0.90)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      started = false;
      for (let i = 0; i < n; i++) {
        const v = band.mean[i];
        if (v == null) continue;
        const px = toX(band.ts[i]);
        const py = toY(v);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const renderAnomalyRegions = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const regions = props.anomalyRegions;
    if (!regions || regions.length === 0) return;
    if (!Number.isFinite(props.xMin) || !Number.isFinite(props.xMax) || props.xMax <= props.xMin) return;

    const plotLeft = CHART_GRID.left;
    const plotTop = CHART_GRID.top;
    const plotRight = Math.max(plotLeft + 1, cssW - CHART_GRID.right);
    const plotBottom = Math.max(plotTop + 1, cssH - CHART_GRID.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = plotBottom - plotTop;

    ctx.fillStyle = 'rgba(255, 74, 110, 0.15)';
    ctx.strokeStyle = 'rgba(255, 74, 110, 0.5)';
    ctx.lineWidth = 1;

    for (const region of regions) {
      const rStart = Math.max(props.xMin, region.start_ms);
      const rEnd = Math.min(props.xMax, region.end_ms);
      if (rStart >= rEnd) continue;

      const sx = plotLeft + ((rStart - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
      const ex = plotLeft + ((rEnd - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
      const w = Math.max(2, ex - sx);

      ctx.fillRect(sx, plotTop, w, plotHeight);
      ctx.strokeRect(sx, plotTop, w, plotHeight);
    }
  };

  const renderAnnotations = (ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    const annotations = props.annotations ?? chartStore.state.annotations;
    if (!annotations || annotations.length === 0) return;
    if (!Number.isFinite(props.xMin) || !Number.isFinite(props.xMax) || props.xMax <= props.xMin) return;

    const plotLeft = CHART_GRID.left;
    const plotTop = CHART_GRID.top;
    const plotRight = Math.max(plotLeft + 1, cssW - CHART_GRID.right);
    const plotBottom = Math.max(plotTop + 1, cssH - CHART_GRID.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = plotBottom - plotTop;

    ctx.font = '11px Inter, system-ui, sans-serif';

    for (const ann of annotations) {
      if (!ann.timeRange) continue;
      const start = ann.timeRange.start;
      const end = ann.timeRange.end;

      if (end < props.xMin || start > props.xMax) continue;

      const visStart = Math.max(props.xMin, start);
      const visEnd = Math.min(props.xMax, end);
      const sx = plotLeft + ((visStart - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
      const ex = plotLeft + ((visEnd - props.xMin) / (props.xMax - props.xMin)) * plotWidth;

      const color = ann.color || '#ffc041';

      if (ann.type === 'bookmark' || start === end) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sx, plotTop);
        ctx.lineTo(sx, plotBottom);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(sx, plotTop);
        ctx.lineTo(sx - 6, plotTop - 10);
        ctx.lineTo(sx + 6, plotTop - 10);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.textAlign = 'left';
        ctx.fillText(ann.title, sx + 4, plotTop + 14);
      } else {
        ctx.fillStyle = `${color}26`;
        ctx.fillRect(sx, plotTop, ex - sx, plotHeight);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(sx, plotTop, ex - sx, plotHeight);
        ctx.setLineDash([]);

        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(ann.title, sx + 4, plotTop + 14);
      }
    }
  };

  createEffect(() => {
    // Re-render when any dependency changes
    props.rollingBands;
    props.anomalyRegions;
    props.annotations;
    props.xMin;
    props.xMax;
    props.yMin;
    props.yMax;
    props.drag;
    props.drawings;
    props.drawMode;
    props.drawColor;
    props.drawWidth;
    props.chartTitle;
    props.xAxisLabel;
    props.yAxisLabel;
    void render();
  });

  onMount(() => {
    if (!canvasRef) return;

    resizeObserver = new ResizeObserver(() => {
      if (!canvasRef) return;
      canvasRef.width = canvasRef.clientWidth * (window.devicePixelRatio || 1);
      canvasRef.height = canvasRef.clientHeight * (window.devicePixelRatio || 1);
      render();
    });
    resizeObserver.observe(canvasRef);
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        'pointer-events': isDrawingMode() || props.drawMode === 'zoom' ? 'auto' : 'none',
        'z-index': 6,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
};

export default CanvasOverlay;