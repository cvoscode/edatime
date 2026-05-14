import { Component, createEffect, onMount, onCleanup } from 'solid-js';
import type { RollingBandData, AnomalyRegionData, DragState, Annotation } from '../../types';
import { chartStore } from '../../stores';

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
}

const CHART_GRID = { left: 120, right: 30, top: 16, bottom: 36 };

const CanvasOverlay: Component<CanvasOverlayProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let resizeObserver: ResizeObserver | null = null;

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

  const toCanvasX = (dataX: number, containerWidth: number): number => {
    const plotLeft = CHART_GRID.left;
    const plotRight = containerWidth - CHART_GRID.right;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    return plotLeft + ((dataX - props.xMin) / (props.xMax - props.xMin)) * plotWidth;
  };

  const toCanvasY = (dataY: number, containerHeight: number): number => {
    const plotTop = CHART_GRID.top;
    const plotBottom = containerHeight - CHART_GRID.bottom;
    const plotHeight = Math.max(1, plotBottom - plotTop);
    return plotBottom - ((dataY - props.yMin) / (props.yMax - props.yMin)) * plotHeight;
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

    ctx.restore();
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
        'pointer-events': props.drawMode === 'zoom' ? 'auto' : 'none',
        'z-index': 6,
      }}
    />
  );
};

export default CanvasOverlay;