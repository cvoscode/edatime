import type { ChartExportDomains } from './chartExportLayout.js';
import type { ExportPlotBounds } from './chartExportSeriesRenderer.js';
import { formatTwoDecimals } from '../formatUtils.js';
import { formatTimeTick, niceLinearTicks, niceTimeTicks } from './ticks.js';

export interface ExportAxisPalette {
    border: string;
    borderHi: string;
    textDim: string;
}

export function renderExportAxes(
    ctx: CanvasRenderingContext2D,
    domains: ChartExportDomains,
    plot: ExportPlotBounds,
    scale: number,
    palette: ExportAxisPalette,
): number {
    const fontSize = Math.max(10, Math.round(12 * scale));
    const plotRight = plot.left + plot.width;
    const plotBottom = plot.top + plot.height;
    const xSpan = domains.xMax - domains.xMin;
    const ySpan = domains.yMax - domains.yMin;
    ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = scale;
    ctx.beginPath();
    ctx.moveTo(plot.left, plot.top);
    ctx.lineTo(plot.left, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    const tickLength = 6 * scale;
    const labelPadding = 4 * scale;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.textDim;
    for (const y of niceLinearTicks(domains.yMin, domains.yMax, 6)) {
        const py = plotBottom - ((y - domains.yMin) / ySpan) * plot.height;
        ctx.strokeStyle = palette.borderHi; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.moveTo(plot.left, py); ctx.lineTo(plotRight, py); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = palette.border;
        ctx.beginPath(); ctx.moveTo(plot.left - tickLength, py); ctx.lineTo(plot.left, py); ctx.stroke();
        ctx.fillText(formatTwoDecimals(y), plot.left - tickLength - labelPadding, py);
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = palette.textDim;
    for (const x of niceTimeTicks(domains.xMin, domains.xMax, 6)) {
        const px = plot.left + ((x - domains.xMin) / xSpan) * plot.width;
        ctx.strokeStyle = palette.borderHi; ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.moveTo(px, plot.top); ctx.lineTo(px, plotBottom); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = palette.border;
        ctx.beginPath(); ctx.moveTo(px, plotBottom); ctx.lineTo(px, plotBottom + tickLength); ctx.stroke();
        ctx.fillText(formatTimeTick(x, xSpan), px, plotBottom + tickLength + labelPadding);
    }
    return fontSize;
}
