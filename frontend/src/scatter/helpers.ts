/**
 * Scatter-page shared utilities: palettes, formatting, helpers.
 */

import { SERIES_COLORS, isTemporalDtype } from '../state.js';
import { formatTwoDecimals, formatTimestamp } from '../formatUtils.js';
import { escapeHtml, downloadUrl, downloadBlob, getEl } from '../utils/dom.js';

export const MATRIX_POINT_LIMIT = 8_000;
export const MATRIX_MAX_COLUMNS = 4;
export const HISTOGRAM_BINS = 24;
const KDE_SAMPLES = 64;
export const LOW_CARDINALITY_LIMIT = 8;
export const DISTRIBUTION_GROUP_COLORS = [
    ...SERIES_COLORS,
    '#5ad8a6', '#ff9d4d', '#7ec8ff', '#f78fb3', '#9bde6d', '#ffd166',
];

export const fmt = new Intl.NumberFormat(undefined);

export { escapeHtml, downloadUrl, downloadBlob, getEl };

export function showError(message: string | null): void {
    const el = getEl('scatter-error');
    if (!el) return;
    if (!message) { el.hidden = true; el.textContent = ''; return; }
    el.textContent = String(message);
    el.hidden = false;
}

export function setPanelStatus(id: string, message: string): void {
    const el = getEl(id);
    if (el) el.textContent = String(message || '');
}

/* ── Color palettes ───────────────────────────────────── */

export function paletteForScale(scale: string): string[] {
    if (scale === 'plasma') return ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'];
    if (scale === 'inferno') return ['#000004', '#420a68', '#932667', '#dd513a', '#fba40a', '#fcffa4'];
    return ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'];
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = String(hex).replace('#', '');
    const v = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    const num = Number.parseInt(v, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(Math.max(0, Math.min(255, Math.round(g))))}${toHex(Math.max(0, Math.min(255, Math.round(b))))}`;
}

export function sampleGradient(stops: string[], t: number): string {
    const n = stops.length;
    if (n === 0) return '#4a9eff';
    if (n === 1) return stops[0];
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * (n - 1);
    const i0 = Math.floor(scaled);
    const i1 = Math.min(n - 1, i0 + 1);
    const frac = scaled - i0;
    const a = hexToRgb(stops[i0]);
    const b = hexToRgb(stops[i1]);
    return rgbToHex({ r: a.r + (b.r - a.r) * frac, g: a.g + (b.g - a.g) * frac, b: a.b + (b.b - a.b) * frac });
}

/* ── Math utilities ────────────────────────────────────── */

export function computeColorExtent(values: number[] | null): { min: number; max: number } | null {
    if (!Array.isArray(values)) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < values.length; i++) {
        const v = Number(values[i]);
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return null;
    return { min, max };
}

export function quantileSorted(sortedValues: number[], ratio: number): number | null {
    if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
    if (sortedValues.length === 1) return sortedValues[0];
    const position = Math.max(0, Math.min(sortedValues.length - 1, ratio * (sortedValues.length - 1)));
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sortedValues[lower];
    const weight = position - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function lowerBoundByX(points: [number, number][], x: number): number {
    let lo = 0; let hi = points.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid][0] < x) lo = mid + 1; else hi = mid; }
    return lo;
}

export function upperBoundByX(points: [number, number][], x: number): number {
    let lo = 0; let hi = points.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid][0] <= x) lo = mid + 1; else hi = mid; }
    return lo;
}

export function normalizeCategoryLabel(label: unknown): string {
    if (label == null) return 'Missing';
    const text = String(label).trim();
    return text || 'Missing';
}

export function getCategoryColor(index: number): string {
    return DISTRIBUTION_GROUP_COLORS[index % DISTRIBUTION_GROUP_COLORS.length];
}

export interface CategoricalColorGroups {
    categories: string[];
    colorByLabel: Map<string, string>;
}

export function buildCategoricalColorGroups(labels?: unknown[] | null): CategoricalColorGroups | null {
    if (!Array.isArray(labels) || labels.length === 0) return null;
    const categories: string[] = [];
    const labelToIndex = new Map<string, number>();
    for (const rawLabel of labels) {
        const label = normalizeCategoryLabel(rawLabel);
        if (labelToIndex.has(label)) continue;
        labelToIndex.set(label, categories.length);
        categories.push(label);
        if (categories.length > LOW_CARDINALITY_LIMIT) return null;
    }
    if (categories.length === 0) return null;
    return { categories, colorByLabel: new Map(categories.map((l, i) => [l, getCategoryColor(i)])) };
}

/* ── Canvas helpers ────────────────────────────────────── */

export function getDevicePixelRatio(): number {
    return Math.max(1, window.devicePixelRatio || 1);
}

export function createMiniCanvas(className: string, heightPx: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = className;
    canvas.dataset.cssHeight = String(heightPx);
    return canvas;
}

interface CanvasFrame {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
}

export function getCanvasFrame(canvas: HTMLCanvasElement, fallbackWidth = 180, fallbackHeight = 92): CanvasFrame | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || fallbackWidth));
    const height = Math.max(1, Math.round(rect.height || Number(canvas.dataset.cssHeight) || fallbackHeight));
    const dpr = getDevicePixelRatio();
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
}

/* ── Column type helpers ──────────────────────────────── */

export function isTemporalColumn(name: string, columnTypes: Map<string, string>): boolean {
    const dtype = columnTypes.get(String(name || '').toLowerCase()) || '';
    return isTemporalDtype(dtype);
}

export function formatValueForColumn(columnName: string, value: number, spanMs: number, columnTypes: Map<string, string>): string {
    return isTemporalColumn(columnName, columnTypes) ? formatTimestamp(value, spanMs) : formatTwoDecimals(value);
}

export function isDistributionCompatibleColumn(column: string, columnTypes: Map<string, string>): boolean {
    if (!column) return false;
    const dtype = columnTypes.get(String(column).toLowerCase()) || '';
    return /date|time|int|float|decimal|f\d+|u\d+|i\d+/i.test(dtype);
}

/* ── Histogram/KDE primitives ─────────────────────────── */

export interface Histogram {
    min: number;
    max: number;
    counts: number[];
    edges: number[];
}

export function buildHistogramFromValues(values: unknown[], binCount = HISTOGRAM_BINS): Histogram | null {
    if (!Array.isArray(values) || values.length === 0) return null;
    const finite = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (finite.length === 0) return null;
    let min = finite[0];
    let max = finite[0];
    for (let i = 1; i < finite.length; i++) {
        if (finite[i] < min) min = finite[i];
        if (finite[i] > max) max = finite[i];
    }
    if (!(max > min)) return { min, max, counts: [finite.length], edges: [min, max] };
    const counts = Array.from({ length: binCount }, () => 0);
    const edges: number[] = [];
    const span = max - min;
    for (let i = 0; i <= binCount; i++) edges.push(min + (span * i) / binCount);
    for (const v of finite) {
        let bucket = Math.floor(((v - min) / span) * binCount);
        if (bucket < 0) bucket = 0;
        if (bucket >= binCount) bucket = binCount - 1;
        counts[bucket] += 1;
    }
    return { min, max, counts, edges };
}

export function buildHistogramForDomain(values: number[], min: number, max: number, binCount = HISTOGRAM_BINS): Histogram | null {
    const finite = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (finite.length === 0 || !Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (!(max > min)) return { min, max, counts: [finite.length], edges: [min, max] };
    const counts = Array.from({ length: binCount }, () => 0);
    const span = max - min;
    const edges = Array.from({ length: binCount + 1 }, (_, i) => min + (span * i) / binCount);
    for (const v of finite) {
        let bucket = Math.floor(((v - min) / span) * binCount);
        if (bucket < 0) bucket = 0;
        if (bucket >= binCount) bucket = binCount - 1;
        counts[bucket] += 1;
    }
    return { min, max, counts, edges };
}

export function estimateBandwidth(values: number[]): number {
    if (!Array.isArray(values) || values.length < 2) return 1;
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = quantileSorted(sorted, 0.25)!;
    const q3 = quantileSorted(sorted, 0.75)!;
    const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sorted.length;
    const std = Math.sqrt(variance);
    const sigma = Math.min(std || 0, ((q3 ?? mean) - (q1 ?? mean)) / 1.34 || std || 1) || 1;
    return Math.max(1e-3, 0.9 * sigma * (sorted.length ** -0.2));
}

export function buildKdeCurve(values: number[], min: number, max: number, sampleCount = KDE_SAMPLES): { x: number; y: number }[] {
    const finite = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (finite.length === 0) return [];
    if (!(max > min)) return [{ x: min, y: 1 }, { x: max, y: 1 }];
    const bandwidth = estimateBandwidth(finite);
    const scale = 1 / (finite.length * bandwidth * Math.sqrt(2 * Math.PI));
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < sampleCount; i++) {
        const x = min + ((max - min) * i) / Math.max(1, sampleCount - 1);
        let sum = 0;
        for (const v of finite) { const z = (x - v) / bandwidth; sum += Math.exp(-0.5 * z * z); }
        points.push({ x, y: sum * scale });
    }
    return points;
}

export function computeBoxStats(values: number[]): { min: number; q1: number | null; median: number | null; q3: number | null; max: number } | null {
    const sorted = values.map((v) => Number(v)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    return { min: sorted[0], q1: quantileSorted(sorted, 0.25), median: quantileSorted(sorted, 0.5), q3: quantileSorted(sorted, 0.75), max: sorted[sorted.length - 1] };
}

export function expandHistogramValues(histogram: { counts?: number[]; edges?: number[] }, maxSamples = 320): number[] {
    const counts = Array.isArray(histogram?.counts) ? histogram.counts : [];
    const edges = Array.isArray(histogram?.edges) ? histogram.edges : [];
    if (counts.length === 0 || edges.length !== counts.length + 1) return [];
    const total = counts.reduce((sum, v) => sum + Math.max(0, Number(v) || 0), 0);
    if (total <= 0) return [];
    const targetSamples = Math.max(Math.min(maxSamples, total), Math.min(counts.length * 4, maxSamples));
    const values: number[] = [];
    for (let i = 0; i < counts.length; i++) {
        const count = Math.max(0, Number(counts[i]) || 0);
        if (count <= 0) continue;
        const left = Number(edges[i]);
        const right = Number(edges[i + 1]);
        const midpoint = Number.isFinite(left) && Number.isFinite(right) ? (left + right) / 2 : Number.isFinite(left) ? left : right;
        if (!Number.isFinite(midpoint)) continue;
        const bucketSamples = Math.max(1, Math.round((count / total) * targetSamples));
        for (let j = 0; j < bucketSamples; j++) values.push(midpoint);
    }
    if (values.length <= maxSamples) return values;
    const reduced: number[] = [];
    const stride = values.length / maxSamples;
    for (let i = 0; i < maxSamples; i++) reduced.push(values[Math.min(values.length - 1, Math.floor(i * stride))]);
    return reduced;
}

export function computeDistributionStats(values: unknown[]): Record<string, number | null> | null {
    if (!Array.isArray(values) || values.length === 0) return null;
    const sorted = values.map((v) => Number(v)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const mean = sorted.reduce((s, v) => s + v, 0) / count;
    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / count;
    const std = Math.sqrt(variance);
    const median = quantileSorted(sorted, 0.5);
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
    let skewness: number | null = null;
    let kurtosis: number | null = null;
    if (std > 0) {
        const m3 = sorted.reduce((s, v) => s + (v - mean) ** 3, 0) / count;
        const m4 = sorted.reduce((s, v) => s + (v - mean) ** 4, 0) / count;
        skewness = m3 / (std ** 3);
        kurtosis = m4 / (std ** 4) - 3;
    }
    return { mean, std, min, max, median, q1, q3, iqr, skewness, kurtosis };
}

export function paddedBounds(minV: number, maxV: number): { min: number; max: number } {
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return { min: 0, max: 1 };
    if (maxV <= minV) {
        const pad = Math.max(1, Math.abs(minV) * 0.02);
        return { min: minV - pad, max: maxV + pad };
    }
    const span = maxV - minV;
    const pad = Math.max(span * 0.02, 1e-9);
    return { min: minV - pad, max: maxV + pad };
}

export function computeDomains(points: [number, number][]): { xMin: number; xMax: number; yMin: number; yMax: number } {
    let xMinRaw = Number.POSITIVE_INFINITY;
    let xMaxRaw = Number.NEGATIVE_INFINITY;
    let yMinRaw = Number.POSITIVE_INFINITY;
    let yMaxRaw = Number.NEGATIVE_INFINITY;
    for (const [x, y] of points) {
        const xn = Number(x); const yn = Number(y);
        if (!Number.isFinite(xn) || !Number.isFinite(yn)) continue;
        if (xn < xMinRaw) xMinRaw = xn; if (xn > xMaxRaw) xMaxRaw = xn;
        if (yn < yMinRaw) yMinRaw = yn; if (yn > yMaxRaw) yMaxRaw = yn;
    }
    const xb = paddedBounds(xMinRaw, xMaxRaw);
    const yb = paddedBounds(yMinRaw, yMaxRaw);
    return { xMin: xb.min, xMax: xb.max, yMin: yb.min, yMax: yb.max };
}

/* ── Canvas drawing helpers ────────────────────────────── */

export interface DistributionSeries {
    label: string;
    color: string;
    values: number[];
}

export function computeValueBounds(seriesList: DistributionSeries[]): { min: number; max: number } | null {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const s of seriesList) {
        for (const v of s.values || []) {
            const n = Number(v);
            if (!Number.isFinite(n)) continue;
            if (n < min) min = n; if (n > max) max = n;
        }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
}

export function drawDistributionCanvas(canvas: HTMLCanvasElement, mode: string, seriesList: DistributionSeries[]): void {
    const frame = getCanvasFrame(canvas, 320, 120);
    if (!frame) return;
    const { ctx, width, height } = frame;
    const usableSeries = (seriesList || []).filter((s) => Array.isArray(s?.values) && s.values.length > 0);
    if (usableSeries.length === 0) {
        ctx.fillStyle = 'rgba(122, 134, 164, 0.7)';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('No distribution', width / 2, height / 2);
        return;
    }
    ctx.strokeStyle = 'rgba(54, 63, 98, 0.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    const padX = 10; const padY = 10;
    const bounds = computeValueBounds(usableSeries);
    if (!bounds) return;
    const { min, max } = bounds;
    const span = Math.max(1e-9, max - min);
    const projectX = (v: number) => padX + ((v - min) / span) * (width - padX * 2);

    if (mode === 'boxplot') {
        const rowHeight = (height - padY * 2) / usableSeries.length;
        usableSeries.forEach((s, i) => {
            const stats = computeBoxStats(s.values);
            if (!stats) return;
            const centerY = padY + rowHeight * i + rowHeight / 2;
            const boxH = Math.max(8, rowHeight * 0.36);
            ctx.strokeStyle = s.color; ctx.fillStyle = `${s.color}33`; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(projectX(stats.min), centerY); ctx.lineTo(projectX(stats.q1!), centerY); ctx.moveTo(projectX(stats.q3!), centerY); ctx.lineTo(projectX(stats.max), centerY); ctx.stroke();
            ctx.fillRect(projectX(stats.q1!), centerY - boxH / 2, Math.max(2, projectX(stats.q3!) - projectX(stats.q1!)), boxH);
            ctx.strokeRect(projectX(stats.q1!), centerY - boxH / 2, Math.max(2, projectX(stats.q3!) - projectX(stats.q1!)), boxH);
            ctx.beginPath(); ctx.moveTo(projectX(stats.median!), centerY - boxH / 2); ctx.lineTo(projectX(stats.median!), centerY + boxH / 2); ctx.stroke();
        });
        return;
    }

    if (mode === 'kde') {
        const curves = usableSeries.map((s) => ({ ...s, curve: buildKdeCurve(s.values, min, max) }));
        const maxDensity = curves.reduce((best, s) => Math.max(best, s.curve.reduce((b, p) => Math.max(b, p.y), 0)), 0);
        const projectY = (v: number) => height - padY - ((v / Math.max(1e-9, maxDensity)) * (height - padY * 2));
        for (const s of curves) {
            if (s.curve.length === 0) continue;
            ctx.beginPath(); ctx.moveTo(projectX(s.curve[0].x), height - padY);
            for (const p of s.curve) ctx.lineTo(projectX(p.x), projectY(p.y));
            ctx.lineTo(projectX(s.curve[s.curve.length - 1].x), height - padY); ctx.closePath();
            ctx.fillStyle = `${s.color}22`; ctx.fill();
            ctx.beginPath();
            s.curve.forEach((p, i) => { const x = projectX(p.x); const y = projectY(p.y); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
            ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.stroke();
        }
        return;
    }

    // Histogram
    const histograms = usableSeries.map((s) => ({ ...s, histogram: buildHistogramForDomain(s.values, min, max) }));
    const maxCount = histograms.reduce((best, s) => Math.max(best, s.histogram?.counts?.reduce((a: number, v: number) => Math.max(a, Number(v) || 0), 0) || 0), 0);
    const binCount = histograms[0]?.histogram?.counts?.length || HISTOGRAM_BINS;
    const barWidth = (width - padX * 2) / Math.max(1, binCount);
    histograms.forEach((s, si) => {
        const counts = s.histogram?.counts || [];
        counts.forEach((count: number, i: number) => {
            const ratio = maxCount > 0 ? (Number(count) || 0) / maxCount : 0;
            const barH = Math.max(2, ratio * (height - padY * 2));
            ctx.fillStyle = s.color;
            ctx.globalAlpha = usableSeries.length > 1 ? 0.18 + si * 0.05 : 0.35 + ratio * 0.45;
            ctx.fillRect(padX + i * barWidth + 1, height - padY - barH, Math.max(1, barWidth - 2), barH);
        });
    });
    ctx.globalAlpha = 1;
}

export function drawMiniScatterCanvas(canvas: HTMLCanvasElement, points: [number, number][], options: any = {}): void {
    const frame = getCanvasFrame(canvas, 180, 92);
    if (!frame) return;
    const { ctx, width, height } = frame;
    const config = typeof options === 'string' ? { color: options } : (options || {});
    const baseColor = config.color || '#4a9eff';
    const colorValues = Array.isArray(config.colorValues) ? config.colorValues : null;
    const colorLabels = Array.isArray(config.colorLabels) ? config.colorLabels : null;
    const colorScale = config.colorScale || 'viridis';
    const categoryColors = config.categoryColors instanceof Map ? config.categoryColors : null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        const x = Number(p?.[0]); const y = Number(p?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        ctx.fillStyle = 'rgba(122, 134, 164, 0.7)'; ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('No points', width / 2, height / 2);
        return;
    }
    const pad = 8;
    const xSpan = Math.max(1e-9, maxX - minX);
    const ySpan = Math.max(1e-9, maxY - minY);
    const stride = Math.max(1, Math.ceil(points.length / 1200));
    ctx.strokeStyle = 'rgba(54, 63, 98, 0.7)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    const palette = paletteForScale(colorScale);
    const colorExtent = computeColorExtent(colorValues);
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < points.length; i += stride) {
        const x = Number(points[i]?.[0]); const y = Number(points[i]?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = pad + ((x - minX) / xSpan) * (width - pad * 2);
        const py = height - pad - ((y - minY) / ySpan) * (height - pad * 2);
        let fill = baseColor;
        if (colorLabels && categoryColors) {
            fill = categoryColors.get(normalizeCategoryLabel(colorLabels[i])) || baseColor;
        } else if (colorValues && colorExtent && colorExtent.max > colorExtent.min) {
            const v = Number(colorValues[i]);
            if (Number.isFinite(v)) fill = sampleGradient(palette, (v - colorExtent.min) / (colorExtent.max - colorExtent.min));
        }
        ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
}

/** 2D density heat-map for mini matrix cells. Uses a simple grid bin count. */
export function drawMiniDensityCanvas(
    canvas: HTMLCanvasElement,
    points: [number, number][],
    options: { colorScale?: string } = {},
): void {
    const frame = getCanvasFrame(canvas, 180, 92);
    if (!frame) return;
    const { ctx, width, height } = frame;

    if (!points.length) {
        ctx.fillStyle = 'rgba(122, 134, 164, 0.7)';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No points', width / 2, height / 2);
        return;
    }

    const BINS = 20;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        const x = Number(p?.[0]); const y = Number(p?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX)) {
        ctx.fillStyle = 'rgba(122, 134, 164, 0.7)';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('No points', width / 2, height / 2);
        return;
    }

    const xSpan = Math.max(1e-9, maxX - minX);
    const ySpan = Math.max(1e-9, maxY - minY);
    const grid = new Float32Array(BINS * BINS);
    let maxCount = 0;

    for (const p of points) {
        const x = Number(p?.[0]); const y = Number(p?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const bx = Math.min(BINS - 1, Math.floor(((x - minX) / xSpan) * BINS));
        const by = Math.min(BINS - 1, Math.floor(((y - minY) / ySpan) * BINS));
        const idx = (BINS - 1 - by) * BINS + bx;
        grid[idx] += 1;
        if (grid[idx] > maxCount) maxCount = grid[idx];
    }

    if (maxCount === 0) return;

    const palette = paletteForScale(options.colorScale || 'viridis');
    const pad = 0;
    const cellW = (width - pad * 2) / BINS;
    const cellH = (height - pad * 2) / BINS;

    for (let row = 0; row < BINS; row++) {
        for (let col = 0; col < BINS; col++) {
            const count = grid[row * BINS + col];
            if (count === 0) continue;
            const t = Math.sqrt(count / maxCount); // sqrt for perceptual scaling
            ctx.fillStyle = sampleGradient(palette, t);
            ctx.fillRect(pad + col * cellW, pad + row * cellH, Math.ceil(cellW), Math.ceil(cellH));
        }
    }
    ctx.strokeStyle = 'rgba(54, 63, 98, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}
