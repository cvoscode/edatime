/**
 * chartExporter — standalone export helpers extracted from DataChart.
 * Encapsulates PNG / SVG / HTML export and SVG drawing serialization.
 * The export canvas is created off-DOM so it does not interfere with
 * the live ChartGPU instance.
 *
 * NOTE: This module is newly created and not yet integrated into DataChart.ts.
 * It is included here as reference infrastructure; integration requires
 * moving the export methods in DataChart.ts to call these helpers.
 */

/**
 * chartExporter — standalone export helpers extracted from DataChart.
 * Encapsulates PNG / SVG / HTML export and SVG drawing serialization.
 * The export canvas is created off-DOM so it does not interfere with
 * the live ChartGPU instance.
 *
 * NOTE: This module is newly created and not yet integrated into DataChart.ts.
 * It provides the reference implementation; integration requires updating
 * DataChart.ts to call these helpers and (optionally) export DrawItem.
 */

import type { DrawItem } from '../chart/DataChart.js';

// ── Download helpers ─────────────────────────────────────────────────────────

function downloadUrl(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Chart constants (mirrored from DataChart) ──────────────────────────────────

const _CHART_GRID = {
    left: 72, right: 24, top: 24, bottom: 40,
};

// ── Viewport / domain helpers ─────────────────────────────────────────────────

export interface ExportViewport {
    cssWidth: number;
    cssHeight: number;
    width: number;
    height: number;
    dpr: number;
}

export interface ExportDomains {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

export function getExportViewport(
    container: HTMLElement | null,
    overlayCanvas: HTMLCanvasElement | null,
): ExportViewport {
    const dpr = window.devicePixelRatio || 1;
    const rect = container?.getBoundingClientRect?.();
    const cssWidth = Math.max(1, Math.round(rect?.width ?? overlayCanvas?.width ?? 1));
    const cssHeight = Math.max(1, Math.round(rect?.height ?? overlayCanvas?.height ?? 1));
    return {
        cssWidth,
        cssHeight,
        width: Math.max(1, Math.round(cssWidth * dpr)),
        height: Math.max(1, Math.round(cssHeight * dpr)),
        dpr,
    };
}

export function getExportDomains(
    xMin: number | null,
    xMax: number | null,
    lastXDomainMin: number | null,
    lastXDomainMax: number | null,
    getYRange: () => { min: number; max: number } | null,
): ExportDomains | null {
    const xMinVal = Number.isFinite(xMin) ? xMin! : lastXDomainMin;
    const xMaxVal = Number.isFinite(xMax) ? xMax! : lastXDomainMax;
    const yRange = getYRange();
    const yMin = yRange?.min;
    const yMax = yRange?.max;
    if (!Number.isFinite(xMinVal!) || !Number.isFinite(xMaxVal!) || xMaxVal! <= xMinVal!) return null;
    if (!Number.isFinite(yMin!) || !Number.isFinite(yMax!) || yMax! <= yMin!) return null;
    const ySpan = yMax! - yMin!;
    const pad = ySpan * 0.04;
    return { xMin: xMinVal!, xMax: xMaxVal!, yMin: yMin! - pad, yMax: yMax! + pad };
}

// ── Render chart to canvas ────────────────────────────────────────────────────

export function renderChartToCanvas(
    canvas: HTMLCanvasElement,
    viewport: ExportViewport,
    domains: ExportDomains,
    seriesList: unknown[],
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { cssWidth, cssHeight, width, height } = viewport;
    const scale = width / cssWidth;
    const styles = getComputedStyle(document.body);
    const bg = styles.getPropertyValue('--bg').trim() || '#080a10';
    const grid = {
        left: _CHART_GRID.left * scale,
        right: _CHART_GRID.right * scale,
        top: _CHART_GRID.top * scale,
        bottom: _CHART_GRID.bottom * scale,
    };
    const plotLeft = grid.left;
    const plotTop = grid.top;
    const plotRight = Math.max(plotLeft + 1, width - grid.right);
    const plotBottom = Math.max(plotTop + 1, height - grid.bottom);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);
    const xSpan = domains.xMax - domains.xMin;
    const ySpan = domains.yMax - domains.yMin;

    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
    ctx.clip();

    const safeXSpan = xSpan || 1;
    const safeYSpan = ySpan || 1;

    for (const s of Array.isArray(seriesList) ? seriesList : []) {
        if (!s || (s as { type?: string }).type !== 'line') continue;
        const pts = Array.isArray((s as { data?: unknown[] }).data) ? (s as { data: unknown[] }).data : [];
        if (pts.length === 0) continue;
        ctx.beginPath();
        ctx.strokeStyle = (s as { color?: string }).color || '#00E5FF';
        ctx.lineWidth = Math.max(1, ((s as { lineWidth?: number }).lineWidth ?? 1.5) * scale);
        ctx.lineJoin = 'round';
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i] as [number, number];
            if (!p || p.length < 2) continue;
            const px = plotLeft + ((Number(p[0]) - domains.xMin) / safeXSpan) * plotWidth;
            const py = plotBottom - ((Number(p[1]) - domains.yMin) / safeYSpan) * plotHeight;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }
    ctx.restore();

    // Axis labels
    ctx.fillStyle = styles.getPropertyValue('--text-dim').trim() || '#7a86a4';
    ctx.font = `${Math.max(10, Math.round(11 * scale))}px monospace`;
    ctx.textAlign = 'center';
    const midX = plotLeft + plotWidth / 2;
    const midY = plotTop + plotHeight / 2;

    // X axis ticks
    const numXTicks = Math.max(2, Math.floor(plotWidth / (80 * scale)));
    for (let i = 0; i <= numXTicks; i++) {
        const x = plotLeft + (i / numXTicks) * plotWidth;
        const val = domains.xMin + (i / numXTicks) * xSpan;
        const label = _formatAxisDate(val);
        ctx.fillText(label, x, Math.min(height - 8 * scale, plotBottom + 18 * scale));
    }

    // Y axis ticks
    const numYTicks = Math.max(2, Math.floor(plotHeight / (40 * scale)));
    ctx.textAlign = 'right';
    for (let i = 0; i <= numYTicks; i++) {
        const y = plotBottom - (i / numYTicks) * plotHeight;
        const val = domains.yMin + (i / numYTicks) * ySpan;
        ctx.fillText(_formatAxisValue(val), Math.max(8 * scale, plotLeft - 4 * scale), y + 4 * scale);
    }

    ctx.restore();
}

function _formatAxisDate(ms: number): string {
    const d = new Date(ms);
    const year = d.getFullYear();
    const mon = d.getMonth() + 1;
    const day = d.getDate();
    if (year < 0 || year > 9999) return String(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    if (mon > 1 || day > 1 || hh !== '00') {
        return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hh}:${mm}:${ss}`;
    }
    return `${hh}:${mm}:${ss}`;
}

function _formatAxisValue(v: number): string {
    if (!Number.isFinite(v)) return 'NaN';
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    if (abs < 0.001 && abs !== 0) return `${v.toExponential(1)}`;
    return v.toFixed(2);
}

// ── SVG drawings export ───────────────────────────────────────────────────────

export function exportSVGDrawings(
    drawings: DrawItem[],
    currentDraw: DrawItem | null,
    overlayCanvas: HTMLCanvasElement | null,
    container: HTMLElement | null,
    viewWidth: number,
    viewHeight: number,
): string {
    const allDraws = [...drawings];
    if (currentDraw) allDraws.push(currentDraw);
    if (allDraws.length === 0) return '';

    const baseW = overlayCanvas?.width || container?.getBoundingClientRect?.().width || viewWidth || 1;
    const baseH = overlayCanvas?.height || container?.getBoundingClientRect?.().height || viewHeight || 1;
    const scaleX = viewWidth / (baseW || 1);
    const scaleY = viewHeight / (baseH || 1);
    const strokeScale = Math.min(scaleX, scaleY);

    let body = '';
    for (const item of allDraws) {
        if (!item) continue;
        const color = item.color || '#ff0055';
        const alpha = item.alpha ?? 1;
        const sx = item.x1 * scaleX;
        const sy = item.y1 * scaleY;
        const ex = item.x2 * scaleX;
        const ey = item.y2 * scaleY;

        if (item.type === 'line') {
            body += `  <line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${color}" stroke-opacity="${alpha}" stroke-width="${(item.width ?? 2) * strokeScale}" stroke-linecap="round"/>\n`;
        } else if (item.type === 'rect') {
            const rx = Math.min(sx, ex);
            const ry = Math.min(sy, ey);
            const rw = Math.abs(ex - sx);
            const rh = Math.abs(ey - sy);
            body += `  <rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="${color}" fill-opacity="${alpha * 0.15}" stroke="${color}" stroke-opacity="${alpha}" stroke-width="${(item.width ?? 1) * strokeScale}"/>\n`;
        }
    }
    return body;
}

// ── Combined export canvas ────────────────────────────────────────────────────

export async function getCombinedExportCanvas(
    container: HTMLElement | null,
    overlayCanvas: HTMLCanvasElement | null,
    getXRange: () => { min: number; max: number },
    lastSeriesList: unknown[],
    getYRange: () => { min: number; max: number } | null,
    lastXDomainMin: number | null,
    lastXDomainMax: number | null,
    renderFn: typeof renderChartToCanvas,
    includeDrawings: boolean,
): Promise<HTMLCanvasElement | null> {
    if (!container) return null;

    const xMin = getXRange().min;
    const xMax = getXRange().max;
    const domains = getExportDomains(xMin, xMax, lastXDomainMin, lastXDomainMax, getYRange);
    if (!domains) return null;

    const viewport = getExportViewport(container, overlayCanvas);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = viewport.width;
    outCanvas.height = viewport.height;

    renderFn(outCanvas, viewport, domains, lastSeriesList);

    if (includeDrawings) {
        // Draw annotations on top of chart
        // (handled separately in the DataChart context via _renderDrawingsToCanvas)
    }

    return outCanvas;
}

// ── Public export API ─────────────────────────────────────────────────────────

export async function exportChartPNG(
    container: HTMLElement | null,
    overlayCanvas: HTMLCanvasElement | null,
    getXRange: () => { min: number; max: number },
    lastSeriesList: unknown[],
    getYRange: () => { min: number; max: number } | null,
    lastXDomainMin: number | null,
    lastXDomainMax: number | null,
    renderFn: typeof renderChartToCanvas,
): Promise<void> {
    const canvas = await getCombinedExportCanvas(
        container, overlayCanvas, getXRange, lastSeriesList,
        getYRange, lastXDomainMin, lastXDomainMax, renderFn, false,
    );
    if (!canvas) return;
    downloadUrl(canvas.toDataURL('image/png'), 'edatime_chart.png');
}

export async function exportChartSVG(
    container: HTMLElement | null,
    overlayCanvas: HTMLCanvasElement | null,
    getXRange: () => { min: number; max: number },
    lastSeriesList: unknown[],
    getYRange: () => { min: number; max: number } | null,
    lastXDomainMin: number | null,
    lastXDomainMax: number | null,
    renderFn: typeof renderChartToCanvas,
    drawings: DrawItem[],
    currentDraw: DrawItem | null,
    viewWidth: number,
    viewHeight: number,
): Promise<void> {
    const canvas = await getCombinedExportCanvas(
        container, overlayCanvas, getXRange, lastSeriesList,
        getYRange, lastXDomainMin, lastXDomainMax, renderFn, false,
    );
    if (!canvas) return;
    const pngData = canvas.toDataURL('image/png');
    const w = canvas.width || 1;
    const h = canvas.height || 1;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n`;
    svg += `  <image href="${pngData}" x="0" y="0" width="${w}" height="${h}" />\n`;
    svg += exportSVGDrawings(drawings, currentDraw, overlayCanvas, container, viewWidth, viewHeight);
    svg += '</svg>';
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'edatime_chart.svg');
}

export async function exportChartHTML(
    container: HTMLElement | null,
    overlayCanvas: HTMLCanvasElement | null,
    getXRange: () => { min: number; max: number },
    lastSeriesList: unknown[],
    getYRange: () => { min: number; max: number } | null,
    lastXDomainMin: number | null,
    lastXDomainMax: number | null,
    renderFn: typeof renderChartToCanvas,
): Promise<void> {
    const canvas = await getCombinedExportCanvas(
        container, overlayCanvas, getXRange, lastSeriesList,
        getYRange, lastXDomainMin, lastXDomainMax, renderFn, false,
    );
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const html = `<!DOCTYPE html><html><head><title>EdaTime Export</title><style>body{margin:0;background:#1a1a1a;display:flex;justify-content:center;align-items:center;min-height:100vh}img{max-width:100%;height:auto;box-shadow:0 4px 12px rgba(0,0,0,0.5)}</style></head><body><img src="${dataUrl}" alt="EdaTime Chart"/></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, 'edatime_chart.html');
}