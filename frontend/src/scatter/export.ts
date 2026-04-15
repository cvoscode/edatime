/**
 * Scatter export rendering: canvas pipeline, PNG/SVG/HTML/Parquet/CSV/JSON export.
 */

import { formatTwoDecimals } from '../formatUtils.js';
import {
    getEl,
    paletteForScale,
    sampleGradient,
    normalizeCategoryLabel,
    buildCategoricalColorGroups,
    formatValueForColumn,
    downloadUrl,
    downloadBlob,
} from './helpers.js';
import {
    state,
    currentControls,
    type ScatterControls,
} from './state.js';

/* ── Linear tick helper ───────────────────────────────── */

export function buildLinearTicks(min: number, max: number, count = 6): number[] {
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return [];
    const n = Math.max(2, Math.floor(count));
    const step = (max - min) / (n - 1);
    return Array.from({ length: n }, (_, i) => min + step * i);
}

/* ── Viewport ─────────────────────────────────────────── */

export function getScatterExportViewport() {
    const container = getEl('scatter-chart');
    const rect = container?.getBoundingClientRect?.();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.round(rect?.width ?? 1200));
    const cssHeight = Math.max(1, Math.round(rect?.height ?? 720));
    return { cssWidth, cssHeight, width: Math.max(1, Math.round(cssWidth * dpr)), height: Math.max(1, Math.round(cssHeight * dpr)), dpr };
}

/* ── Draw series to canvas (shared by export) ─────────── */

export function drawScatterSeriesToCanvas(
    ctx: CanvasRenderingContext2D,
    plotLeft: number, plotTop: number, plotWidth: number, plotHeight: number,
    controls: ScatterControls, scale: number,
): void {
    const xSpan = Math.max(1e-9, state.view.xMax - state.view.xMin);
    const ySpan = Math.max(1e-9, state.view.yMax - state.view.yMin);
    const points = state.points;
    const categoricalGroups = buildCategoricalColorGroups(state.colorLabels);

    if (controls.renderMode === 'density') {
        const binSize = Math.max(2, (Number(controls.binSize) || 10) * scale);
        const cols = Math.max(1, Math.ceil(plotWidth / binSize));
        const rows = Math.max(1, Math.ceil(plotHeight / binSize));
        const counts = new Uint32Array(cols * rows);
        let maxCount = 0;
        for (const [x, y] of points) {
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const nx = (x - state.view.xMin) / xSpan;
            const ny = (y - state.view.yMin) / ySpan;
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
            const col = Math.max(0, Math.min(cols - 1, Math.floor(nx * cols)));
            const row = Math.max(0, Math.min(rows - 1, Math.floor((1 - ny) * rows)));
            const bucket = row * cols + col;
            counts[bucket] += 1;
            if (counts[bucket] > maxCount) maxCount = counts[bucket];
        }
        const palette = paletteForScale(controls.colormap);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const count = counts[row * cols + col];
                if (count <= 0) continue;
                const ratio = controls.normalization === 'log' ? Math.log1p(count) / Math.log1p(Math.max(1, maxCount)) : count / Math.max(1, maxCount);
                ctx.globalAlpha = 0.18 + ratio * 0.82;
                ctx.fillStyle = sampleGradient(palette, ratio);
                ctx.fillRect(plotLeft + col * binSize, plotTop + row * binSize, Math.ceil(binSize), Math.ceil(binSize));
            }
        }
        ctx.globalAlpha = 1;
        return;
    }

    const maxPoints = 200_000;
    const stride = Math.max(1, Math.ceil(points.length / maxPoints));
    const palette = paletteForScale(controls.colorScale);
    const radius = Math.max(1.8, 2.6 * scale);
    for (let i = 0; i < points.length; i += stride) {
        const [x, y] = points[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = plotLeft + ((x - state.view.xMin) / xSpan) * plotWidth;
        const py = plotTop + (1 - ((y - state.view.yMin) / ySpan)) * plotHeight;
        let fill = '#4a9eff';
        if (controls.selectedColorColumn && categoricalGroups) {
            fill = categoricalGroups.colorByLabel.get(normalizeCategoryLabel(state.colorLabels?.[i])) || fill;
        } else if (controls.selectedColorColumn && Array.isArray(state.colorValues) && Number.isFinite(state.colorMin) && Number.isFinite(state.colorMax) && state.colorMax! > state.colorMin!) {
            const v = Number(state.colorValues[i]);
            if (Number.isFinite(v)) fill = sampleGradient(palette, (v - state.colorMin!) / (state.colorMax! - state.colorMin!));
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

/* ── Full canvas export rendering ─────────────────────── */

export function renderScatterExportToCanvas(canvas: HTMLCanvasElement): boolean {
    const controls = currentControls();
    const viewport = getScatterExportViewport();
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const scale = viewport.width / viewport.cssWidth;
    const styles = getComputedStyle(document.body);
    const bg = styles.getPropertyValue('--bg').trim() || '#080a10';
    const surface = styles.getPropertyValue('--surface-2').trim() || '#181c2a';
    const border = styles.getPropertyValue('--border').trim() || '#272d45';
    const borderHi = styles.getPropertyValue('--border-hi').trim() || '#363f62';
    const text = styles.getPropertyValue('--text').trim() || '#c8d0e4';
    const textDim = styles.getPropertyValue('--text-dim').trim() || '#7a86a4';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    const grid = { left: 72 * scale, right: 200 * scale, top: 24 * scale, bottom: 50 * scale };
    const plotLeft = grid.left;
    const plotTop = grid.top;
    const plotRight = Math.max(plotLeft + 1, viewport.width - grid.right);
    const plotBottom = Math.max(plotTop + 1, viewport.height - grid.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);

    ctx.save();
    ctx.beginPath();
    ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
    ctx.clip();
    drawScatterSeriesToCanvas(ctx, plotLeft, plotTop, plotWidth, plotHeight, controls, scale);
    ctx.restore();

    // Axes
    ctx.strokeStyle = border;
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    const fontSize = Math.max(10, Math.round(12 * scale));
    const tickLen = 6 * scale;
    const labelPad = 4 * scale;
    ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;

    // Y ticks
    const yTicks = buildLinearTicks(state.view.yMin, state.view.yMax, 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textDim;
    for (const tick of yTicks) {
        const py = plotBottom - ((tick - state.view.yMin) / Math.max(1e-9, state.view.yMax - state.view.yMin)) * plotHeight;
        ctx.strokeStyle = borderHi; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.moveTo(plotLeft, py); ctx.lineTo(plotRight, py); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = border;
        ctx.beginPath(); ctx.moveTo(plotLeft - tickLen, py); ctx.lineTo(plotLeft, py); ctx.stroke();
        ctx.fillText(formatValueForColumn(controls.y, tick, Math.max(1, state.view.yMax - state.view.yMin), state.columnTypes), plotLeft - tickLen - labelPad, py);
    }

    // X ticks
    const xTicks = buildLinearTicks(state.view.xMin, state.view.xMax, 6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of xTicks) {
        const px = plotLeft + ((tick - state.view.xMin) / Math.max(1e-9, state.view.xMax - state.view.xMin)) * plotWidth;
        ctx.strokeStyle = borderHi; ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.moveTo(px, plotTop); ctx.lineTo(px, plotBottom); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = border;
        ctx.beginPath(); ctx.moveTo(px, plotBottom); ctx.lineTo(px, plotBottom + tickLen); ctx.stroke();
        ctx.fillText(formatValueForColumn(controls.x, tick, Math.max(1, state.view.xMax - state.view.xMin), state.columnTypes), px, plotBottom + tickLen + labelPad);
    }

    // Title
    ctx.save();
    ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `${Math.max(12, Math.round(14 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText(`${controls.renderMode === 'density' ? 'Density' : 'Scatter'}: ${controls.x || 'x'} vs ${controls.y || 'y'}`, viewport.width / 2, 4 * scale);
    ctx.restore();

    // X axis label
    ctx.save();
    ctx.fillStyle = textDim; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText(controls.x || 'x', viewport.width / 2, viewport.height - fontSize - 4 * scale);
    ctx.restore();

    // Y axis label
    ctx.save();
    ctx.fillStyle = textDim;
    ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.translate(Math.max(10 * scale, fontSize), (plotTop + plotBottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(controls.y || 'y', 0, 0);
    ctx.restore();

    // Correlation box
    const corr = state.correlationsByColumn.get(controls.y || '');
    ctx.save();
    ctx.fillStyle = surface; ctx.strokeStyle = border; ctx.lineWidth = 1 * scale;
    const corrX = viewport.width - 190 * scale;
    const corrY = 10 * scale;
    const corrW = 170 * scale;
    const corrH = 44 * scale;
    ctx.fillRect(corrX, corrY, corrW, corrH);
    ctx.strokeRect(corrX, corrY, corrW, corrH);
    ctx.fillStyle = text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `${Math.max(10, Math.round(11 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText(`Pearson correlation: ${Number.isFinite(corr?.pearson) ? corr!.pearson!.toFixed(3) : '—'}`, corrX + 10 * scale, corrY + 8 * scale);
    ctx.fillText(`Spearman correlation: ${Number.isFinite(corr?.spearman) ? corr!.spearman!.toFixed(3) : '—'}`, corrX + 10 * scale, corrY + 24 * scale);
    ctx.restore();

    // Continuous color legend
    const showContinuousLegend = controls.renderMode === 'density' || (
        controls.selectedColorColumn
        && !buildCategoricalColorGroups(state.colorLabels)
        && Number.isFinite(state.colorMin) && Number.isFinite(state.colorMax)
        && state.colorMax! > state.colorMin!
    );
    if (showContinuousLegend) {
        const palette = paletteForScale(controls.renderMode === 'density' ? controls.colormap : controls.colorScale);
        const legendX = viewport.width - 190 * scale;
        const legendY = 64 * scale;
        const legendW = 220 * scale;
        const legendH = 40 * scale;
        ctx.save();
        ctx.fillStyle = surface; ctx.strokeStyle = border; ctx.lineWidth = 1 * scale;
        ctx.fillRect(legendX, legendY, legendW, legendH);
        ctx.strokeRect(legendX, legendY, legendW, legendH);
        const gradient = ctx.createLinearGradient(legendX + 10 * scale, 0, legendX + legendW - 10 * scale, 0);
        palette.forEach((c, i) => gradient.addColorStop(i / Math.max(1, palette.length - 1), c));
        ctx.fillStyle = text;
        ctx.font = `${Math.max(10, Math.round(11 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(controls.renderMode === 'density' ? `Density (${controls.colormap})` : `${controls.selectedColorColumn} (${controls.colorScale})`, legendX + 10 * scale, legendY + 6 * scale);
        ctx.fillStyle = gradient;
        ctx.fillRect(legendX + 10 * scale, legendY + 22 * scale, legendW - 20 * scale, 8 * scale);
        ctx.fillStyle = textDim; ctx.textBaseline = 'middle';
        ctx.fillText(controls.renderMode === 'density' ? 'Low' : formatTwoDecimals(state.colorMin!), legendX + 10 * scale, legendY + 34 * scale);
        ctx.textAlign = 'right';
        ctx.fillText(controls.renderMode === 'density' ? 'High' : formatTwoDecimals(state.colorMax!), legendX + legendW - 10 * scale, legendY + 34 * scale);
        ctx.restore();
    }

    return true;
}

/* ── Data export (CSV / JSON) ─────────────────────────── */

export function buildVisibleScatterRows() {
    const controls = currentControls();
    const rows: any[] = [];
    const xSpan = Math.max(1, state.view.xMax - state.view.xMin);
    const ySpan = Math.max(1, state.view.yMax - state.view.yMin);

    for (let i = 0; i < state.points.length; i++) {
        const x = Number(state.points[i]?.[0]);
        const y = Number(state.points[i]?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < state.view.xMin || x > state.view.xMax || y < state.view.yMin || y > state.view.yMax) continue;
        const row: any = {
            x, y,
            x_label: formatValueForColumn(controls.x, x, xSpan, state.columnTypes),
            y_label: formatValueForColumn(controls.y, y, ySpan, state.columnTypes),
        };
        if (controls.selectedColorColumn && Array.isArray(state.colorLabels)) {
            row.color = normalizeCategoryLabel(state.colorLabels[i]);
        } else if (controls.selectedColorColumn && Array.isArray(state.colorValues)) {
            const cv = Number(state.colorValues[i]);
            row.color = Number.isFinite(cv) ? cv : null;
        }
        rows.push(row);
    }
    return rows;
}

export function exportScatterData(format = 'csv'): boolean {
    const controls = currentControls();
    const rows = buildVisibleScatterRows();
    if (rows.length === 0) return false;

    if (format === 'json') {
        downloadBlob(
            new Blob([JSON.stringify({ x: controls.x, y: controls.y, color: controls.selectedColorColumn || null, rows }, null, 2)], { type: 'application/json;charset=utf-8' }),
            'edatime_scatter_filtered.json',
        );
        return true;
    }

    const header = ['x', 'y', 'x_label', 'y_label'];
    if (controls.selectedColorColumn) header.push('color');
    const lines = [header.join(',')];
    for (const row of rows) {
        const values = [row.x, row.y, `"${String(row.x_label).replaceAll('"', '""')}"`, `"${String(row.y_label).replaceAll('"', '""')}"`];
        if (controls.selectedColorColumn) values.push(row.color == null ? '' : String(row.color));
        lines.push(values.join(','));
    }
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), 'edatime_scatter_filtered.csv');
    return true;
}

/* ── Image / file exports ─────────────────────────────── */

export async function exportScatterPNG(): Promise<void> {
    const canvas = document.createElement('canvas');
    if (!renderScatterExportToCanvas(canvas)) return;
    downloadUrl(canvas.toDataURL('image/png'), 'edatime_scatter.png');
}

export async function exportScatterSVG(): Promise<void> {
    const canvas = document.createElement('canvas');
    if (!renderScatterExportToCanvas(canvas)) return;
    const pngData = canvas.toDataURL('image/png');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image href="${pngData}" x="0" y="0" width="${canvas.width}" height="${canvas.height}" /></svg>`;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'edatime_scatter.svg');
}

export async function exportScatterHTML(): Promise<void> {
    const canvas = document.createElement('canvas');
    if (!renderScatterExportToCanvas(canvas)) return;
    const dataUrl = canvas.toDataURL('image/png');
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>EdaTime Scatter Export</title>
    <style>body { margin: 0; background: #1a1a1a; display: flex; justify-content: center; align-items: center; min-height: 100vh; } img { max-width: 100%; height: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }</style>
</head>
<body><img src="${dataUrl}" alt="EdaTime Scatter Export" /></body>
</html>`;
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), 'edatime_scatter.html');
}

export async function exportScatterParquet(): Promise<boolean> {
    const controls = currentControls();
    if (!controls.x || !controls.y) return false;
    const payload: any = { x: String(controls.x), y: String(controls.y), color: controls.selectedColorColumn || undefined, limit: 1_000_000 };
    const context = (await import('./state.js')).buildScatterQueryContext();
    if (Number.isFinite(context.start) && Number.isFinite(context.end)) { payload.start = context.start; payload.end = context.end; }
    if (Array.isArray(context.filters) && context.filters.length > 0) payload.filters = JSON.stringify(context.filters);
    if (Array.isArray(context.lineFilters) && context.lineFilters.length > 0) payload.line_filters = JSON.stringify(context.lineFilters);

    const res = await fetch('/api/scatter/export/parquet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { const text = await res.text().catch(() => 'Scatter parquet export failed'); throw new Error(text || 'Scatter parquet export failed'); }
    downloadBlob(await res.blob(), 'edatime_scatter_filtered.parquet');
    return true;
}
