/**
 * chartExport — lightweight helpers for exporting analytics charts (FFT, spectrogram, heatmap).
 *
 * Works with ChartGPU canvases, ECharts instances, and plain HTML containers.
 */

import { downloadUrl, downloadBlob } from './dom.js';
import { toast } from './toast.js';

export type ExportElementTarget = string | HTMLElement;

function resolveExportElement(target: ExportElementTarget): HTMLElement | null {
    return typeof target === 'string' ? document.getElementById(target) : target;
}

/* ── Canvas-based export (ChartGPU / generic) ─────────── */

/**
 * Composite all `<canvas>` elements inside a container into one PNG.
 * Canvases are drawn in DOM order so overlay canvases layer correctly.
 */
export function exportContainerCanvasPNG(containerId: string, filename: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    const canvases = Array.from(container.querySelectorAll('canvas'));
    if (canvases.length === 0) {
        toast('No chart canvas found for export.', 'warning');
        return;
    }

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    // Fill background from CSS variable
    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#080a10';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    for (const c of canvases) {
        const cr = c.getBoundingClientRect();
        const dx = (cr.left - rect.left) * dpr;
        const dy = (cr.top - rect.top) * dpr;
        try {
            ctx.drawImage(c, dx, dy, cr.width * dpr, cr.height * dpr);
        } catch {
            // tainted canvas — skip silently
        }
    }

    downloadUrl(out.toDataURL('image/png'), filename);
    toast('PNG exported.', 'success');
}

/* ── HTML element screenshot via foreignObject SVG ────── */

/**
 * Export an HTML element as PNG by serializing to SVG foreignObject.
 * Works for heatmap grids and other styled DOM elements.
 */
export async function exportElementPNG(target: ExportElementTarget, filename: string): Promise<void> {
    const el = resolveExportElement(target);
    if (!el) {
        toast('Chart element unavailable. Wait for the chart to render, then retry or use CSV.', 'warning');
        return;
    }

    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    // Clone the element so we can inline computed styles
    const clone = cloneElementForExport(el);

    // Build SVG with foreignObject
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('xmlns', svgNs);
    svg.setAttribute('xmlns:xhtml', 'http://www.w3.org/1999/xhtml');

    const fo = document.createElementNS(svgNs, 'foreignObject');
    fo.setAttribute('width', '100%');
    fo.setAttribute('height', '100%');
    fo.appendChild(clone);
    svg.appendChild(fo);

    const svgStr = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
        const img = new Image();
        img.width = w;
        img.height = h;
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to load SVG image'));
            img.src = svgUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        if (!ctx) { toast('Canvas not available.', 'error'); return; }

        const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#080a10';
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(dpr, dpr);
        ctx.drawImage(img, 0, 0, w, h);

        downloadUrl(canvas.toDataURL('image/png'), filename);
        toast('PNG exported.', 'success');
    } catch {
        toast('PNG export failed. Try CSV export instead.', 'error');
    } finally {
        URL.revokeObjectURL(svgUrl);
    }
}

/** Recursively inline computed styles onto cloned elements for SVG foreignObject. */
function inlineComputedStyles(original: Element, clone: Element): void {
    if (original instanceof HTMLElement && clone instanceof HTMLElement) {
        const computed = getComputedStyle(original);
        for (const prop of ['color', 'background', 'background-color', 'font-size', 'font-family',
            'font-weight', 'display', 'grid-template-columns', 'grid-template-rows', 'gap',
            'padding', 'margin', 'border', 'border-radius', 'text-align', 'white-space',
            'overflow', 'text-overflow', 'writing-mode', 'text-orientation', 'align-items',
            'justify-content', 'flex-direction', 'font-variant-numeric', 'letter-spacing']) {
            clone.style.setProperty(prop, computed.getPropertyValue(prop));
        }
    }
    const origChildren = original.children;
    const cloneChildren = clone.children;
    for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
        inlineComputedStyles(origChildren[i], cloneChildren[i]);
    }
}

/** Clone DOM content while preserving the pixels painted into nested canvases. */
function cloneElementForExport(element: HTMLElement): HTMLElement {
    const clone = element.cloneNode(true) as HTMLElement;
    inlineComputedStyles(element, clone);
    const sourceCanvases = Array.from(element.querySelectorAll('canvas'));
    const clonedCanvases = Array.from(clone.querySelectorAll('canvas'));
    sourceCanvases.forEach((canvas, index) => {
        const clonedCanvas = clonedCanvases[index];
        if (!clonedCanvas) return;
        try {
            const image = document.createElement('img');
            image.src = canvas.toDataURL('image/png');
            image.alt = canvas.getAttribute('aria-label') || '';
            image.style.cssText = (clonedCanvas as HTMLElement).style.cssText;
            image.style.display = 'block';
            image.style.width = `${canvas.getBoundingClientRect().width || canvas.width}px`;
            image.style.height = `${canvas.getBoundingClientRect().height || canvas.height}px`;
            clonedCanvas.replaceWith(image);
        } catch {
            // Keep the cloned canvas as a harmless fallback if serialization fails.
        }
    });
    return clone;
}

/* ── ECharts export ───────────────────────────────────── */

/**
 * Export an HTML element as SVG using foreignObject (preserves DOM styling).
 * Works for heatmap grids and other styled DOM elements.
 */
export function exportElementSVG(target: ExportElementTarget, filename: string): void {
    const el = resolveExportElement(target);
    if (!el) { toast('Element not found for export.', 'warning'); return; }

    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const clone = cloneElementForExport(el);

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('xmlns', svgNs);
    svg.setAttribute('xmlns:xhtml', 'http://www.w3.org/1999/xhtml');

    const fo = document.createElementNS(svgNs, 'foreignObject');
    fo.setAttribute('width', '100%');
    fo.setAttribute('height', '100%');
    fo.appendChild(clone);
    svg.appendChild(fo);

    const svgStr = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, filename);
    toast('SVG exported.', 'success');
}

export function exportEChartsPNG(chartInstance: any, filename: string): void {
    if (!chartInstance) {
        toast('Chart not available for export.', 'warning');
        return;
    }
    try {
        const url: string = chartInstance.getDataURL({
            type: 'png',
            pixelRatio: 2,
            backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#080a10',
        });
        downloadUrl(url, filename);
        toast('PNG exported.', 'success');
    } catch {
        toast('Failed to export chart.', 'error');
    }
}

/* ── SVG exports (PNG-in-SVG wrapper for canvas charts) ── */

/**
 * Export a canvas-based chart container as SVG by embedding the composited PNG.
 * Produces a valid SVG file with the chart image as a data-URL <image> element.
 */
export function exportContainerCanvasSVG(containerId: string, filename: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    const canvases = Array.from(container.querySelectorAll('canvas'));
    if (canvases.length === 0) { toast('No chart canvas found for export.', 'warning'); return; }

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#080a10';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    for (const c of canvases) {
        const cr = c.getBoundingClientRect();
        const dx = (cr.left - rect.left) * dpr;
        const dy = (cr.top - rect.top) * dpr;
        try { ctx.drawImage(c, dx, dy, cr.width * dpr, cr.height * dpr); } catch { /* tainted */ }
    }

    const pngDataUrl = out.toDataURL('image/png');
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
        `  <image href="${pngDataUrl}" width="${w}" height="${h}" />\n</svg>`;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, filename);
    toast('SVG exported.', 'success');
}

/**
 * Export a canvas-based chart container as a standalone HTML page.
 */
export function exportContainerCanvasHTML(containerId: string, filename: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    const canvases = Array.from(container.querySelectorAll('canvas'));
    if (canvases.length === 0) { toast('No chart canvas found for export.', 'warning'); return; }

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#080a10';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    for (const c of canvases) {
        const cr = c.getBoundingClientRect();
        const dx = (cr.left - rect.left) * dpr;
        const dy = (cr.top - rect.top) * dpr;
        try { ctx.drawImage(c, dx, dy, cr.width * dpr, cr.height * dpr); } catch { /* tainted */ }
    }

    const pngDataUrl = out.toDataURL('image/png');
    const html = buildStandaloneHtml(`<img src="${pngDataUrl}" style="max-width:100%;display:block;">`, filename.replace('.html', ''));
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, filename);
    toast('HTML exported.', 'success');
}

/** Export an ECharts instance as an SVG file (embeds the PNG data URL). */
export function exportEChartsSVG(chartInstance: any, filename: string): void {
    if (!chartInstance) { toast('Chart not available for export.', 'warning'); return; }
    try {
        const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#080a10';
        const pngUrl: string = chartInstance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg });
        // Attempt to get dimensions from the DOM element
        const domEl: HTMLElement | null = chartInstance.getDom?.() ?? null;
        const w = domEl?.offsetWidth ?? 800;
        const h = domEl?.offsetHeight ?? 500;
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
            `  <image href="${pngUrl}" width="${w}" height="${h}" />\n</svg>`;
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(blob, filename);
        toast('SVG exported.', 'success');
    } catch {
        toast('Failed to export SVG.', 'error');
    }
}

/** Export an ECharts instance as a standalone HTML page. */
export function exportEChartsHTML(chartInstance: any, filename: string): void {
    if (!chartInstance) { toast('Chart not available for export.', 'warning'); return; }
    try {
        const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#080a10';
        const pngUrl: string = chartInstance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg });
        const html = buildStandaloneHtml(`<img src="${pngUrl}" style="max-width:100%;display:block;">`, filename.replace('.html', ''));
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, filename);
        toast('HTML exported.', 'success');
    } catch {
        toast('Failed to export HTML.', 'error');
    }
}

/** Export an HTML element (e.g. heatmap grid) as a standalone HTML page. */
export async function exportElementHTML(target: ExportElementTarget, filename: string): Promise<void> {
    const el = resolveExportElement(target);
    if (!el) { toast('Element not found for export.', 'warning'); return; }

    const clone = cloneElementForExport(el);
    const interaction = `<div id="matrix-selection" role="status" aria-live="polite"></div>
<script>document.addEventListener('click',function(event){var cell=event.target.closest('.heatmap-cell');if(!cell)return;document.querySelectorAll('.heatmap-cell.is-selected').forEach(function(item){item.classList.remove('is-selected')});cell.classList.add('is-selected');document.getElementById('matrix-selection').textContent=cell.getAttribute('aria-label')||''});document.addEventListener('keydown',function(event){if((event.key==='Enter'||event.key===' ')&&event.target.closest('.heatmap-cell')){event.preventDefault();event.target.click()}});</script>`;
    const html = buildStandaloneHtml(`${clone.outerHTML}\n${interaction}`, filename.replace('.html', ''));
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, filename);
    toast('HTML exported.', 'success');
}

/* ── Shared helpers ───────────────────────────────────── */

function buildStandaloneHtml(bodyContent: string, title: string): string {
    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#080a10';
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${escapeHtml(title)} — EdaTime</title>\n  <style>body{margin:0;padding:16px;background:${bg};font-family:sans-serif;}</style>\n</head>\n<body>\n${bodyContent}\n</body>\n</html>`;
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── CSV export helpers ───────────────────────────────── */

export function exportTraceCSV(
    traces: { column: string; xs: number[]; ys: number[] }[],
    xLabel: string,
    filename: string,
): void {
    if (traces.length === 0) {
        toast('No data to export.', 'warning');
        return;
    }
    // Use first trace's x-axis as reference
    const ref = traces[0];
    const headers = [xLabel, ...traces.map((t) => t.column)];
    const lines: string[] = [headers.join(',')];
    for (let i = 0; i < ref.xs.length; i++) {
        const vals = [String(ref.xs[i]), ...traces.map((t) => (t.ys[i] != null ? String(t.ys[i]) : ''))];
        lines.push(vals.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, filename);
    toast('CSV exported.', 'success');
}
