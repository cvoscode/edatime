import type { SeriesConfig } from '../../libs/chartgpu/dist/index.js';
import type { ChartExportDomains } from './chartExportLayout.js';

export interface ExportPlotBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function renderExportLineSeries(
    ctx: CanvasRenderingContext2D,
    series: readonly SeriesConfig[],
    domains: ChartExportDomains,
    plot: ExportPlotBounds,
    scale: number,
    fallbackColor: string,
): void {
    const xSpan = domains.xMax - domains.xMin;
    const ySpan = domains.yMax - domains.yMin;
    if (!(xSpan > 0) || !(ySpan > 0)) return;
    for (const item of series) {
        if (!item || item.type !== 'line' || item.visible === false) continue;
        const points = Array.isArray(item.data) ? item.data : [];
        if (points.length === 0) continue;
        ctx.beginPath();
        ctx.strokeStyle = item.color || fallbackColor;
        ctx.lineWidth = 1.5 * scale;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        let started = false;
        for (const point of points) {
            const x = Number(point?.[0]);
            const y = Number(point?.[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const px = plot.left + ((x - domains.xMin) / xSpan) * plot.width;
            const py = plot.top + plot.height - ((y - domains.yMin) / ySpan) * plot.height;
            if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        if (started) ctx.stroke();
    }
}
