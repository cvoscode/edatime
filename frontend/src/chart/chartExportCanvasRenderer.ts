import type { SeriesConfig } from 'chartgpu';
import { getChartPalette } from '../utils/theme.js';
import { scaleGridLayout } from './gridLayout.js';
import type { GridLayout } from './chartInteractions.js';
import type { ChartExportDomains, ChartExportViewport } from './chartExportLayout.js';
import { renderExportLineSeries } from './chartExportSeriesRenderer.js';
import { renderExportAxes } from './chartExportAxesRenderer.js';
import { renderExportDecorations } from './chartExportDecorationsRenderer.js';
import type { LegendEntry } from './legendInteraction.js';

export interface ChartExportCanvasInput {
    canvas: HTMLCanvasElement;
    viewport: ChartExportViewport;
    domains: ChartExportDomains;
    grid: GridLayout;
    series: readonly SeriesConfig[];
    labels: { title: string; xAxis: string; yAxis: string };
    legendEntries: readonly LegendEntry[];
    renderDrawings?: (ctx: CanvasRenderingContext2D, scale: { x: number; y: number }) => void;
}

export function renderChartExportCanvas(input: ChartExportCanvasInput): void {
    const ctx = input.canvas.getContext('2d');
    if (!ctx) return;
    const { cssWidth, cssHeight, width, height } = input.viewport;
    const scale = width / cssWidth;
    const palette = getChartPalette();
    ctx.save();
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);

    const grid = scaleGridLayout(input.grid, scale);
    const plot = {
        left: grid.left,
        top: grid.top,
        width: Math.max(1, width - grid.right - grid.left),
        height: Math.max(1, height - grid.bottom - grid.top),
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(plot.left, plot.top, plot.width, plot.height); ctx.clip();
    renderExportLineSeries(ctx, input.series, input.domains, plot, scale, palette.accent);
    ctx.restore();

    const fontSize = renderExportAxes(ctx, input.domains, plot, scale, {
        border: palette.border, borderHi: palette.borderHi, textDim: palette.textDim,
    });
    renderExportDecorations(ctx, { width, height }, plot, scale, fontSize, {
        surface: palette.surfaceElevated, border: palette.border, text: palette.text, textDim: palette.textDim,
    }, input.labels, input.legendEntries);
    input.renderDrawings?.(ctx, { x: width / cssWidth, y: height / cssHeight });
    ctx.restore();
}
