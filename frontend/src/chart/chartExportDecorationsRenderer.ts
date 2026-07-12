import type { ExportPlotBounds } from './chartExportSeriesRenderer.js';
import type { LegendEntry } from './legendInteraction.js';

export interface ExportDecorationPalette {
    surface: string;
    border: string;
    text: string;
    textDim: string;
}

export interface ExportTextLabels {
    title: string;
    xAxis: string;
    yAxis: string;
}

export function renderExportDecorations(
    ctx: CanvasRenderingContext2D,
    viewport: { width: number; height: number },
    plot: ExportPlotBounds,
    scale: number,
    axisFontSize: number,
    palette: ExportDecorationPalette,
    labels: ExportTextLabels,
    legendEntries: readonly LegendEntry[],
): void {
    const plotRight = plot.left + plot.width;
    const plotBottom = plot.top + plot.height;
    const title = labels.title.trim();
    if (title) {
        const titleFontSize = Math.max(12, Math.round(14 * scale));
        ctx.save(); ctx.fillStyle = palette.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = `${titleFontSize}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.fillText(title, viewport.width / 2, Math.max(2 * scale, (plot.top - (titleFontSize + 2 * scale)) / 2));
        ctx.restore();
    }
    const xAxis = labels.xAxis.trim();
    if (xAxis) {
        ctx.save(); ctx.fillStyle = palette.textDim; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(xAxis, viewport.width / 2, viewport.height - axisFontSize - 2 * scale); ctx.restore();
    }
    const yAxis = labels.yAxis.trim();
    if (yAxis) {
        ctx.save(); ctx.fillStyle = palette.textDim;
        ctx.translate(Math.max(10 * scale, axisFontSize), (plot.top + plotBottom) / 2);
        ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(yAxis, 0, 0); ctx.restore();
    }

    const visible = legendEntries.filter((entry) => entry.visible);
    if (visible.length === 0) return;
    const padding = 8 * scale;
    const gap = 6 * scale;
    const swatchWidth = 18 * scale;
    const lineHeight = Math.max(14 * scale, axisFontSize + 2 * scale);
    let maxTextWidth = 0;
    for (const entry of visible) maxTextWidth = Math.max(maxTextWidth, ctx.measureText(entry.name).width);
    const boxWidth = padding * 2 + swatchWidth + gap + maxTextWidth;
    const boxHeight = padding * 2 + visible.length * lineHeight;
    const left = Math.max(plot.left, plotRight - boxWidth - 6 * scale);
    const top = plot.top + 6 * scale;
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = palette.surface; ctx.fillRect(left, top, boxWidth, boxHeight);
    ctx.globalAlpha = 1; ctx.strokeStyle = palette.border; ctx.lineWidth = scale; ctx.strokeRect(left, top, boxWidth, boxHeight);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = palette.text;
    for (let index = 0; index < visible.length; index++) {
        const entry = visible[index];
        const centerY = top + padding + index * lineHeight + lineHeight / 2;
        ctx.strokeStyle = entry.color; ctx.lineWidth = 2 * scale;
        ctx.beginPath(); ctx.moveTo(left + padding, centerY); ctx.lineTo(left + padding + swatchWidth, centerY); ctx.stroke();
        ctx.fillText(entry.name, left + padding + swatchWidth + gap, centerY);
    }
    ctx.restore();
}
