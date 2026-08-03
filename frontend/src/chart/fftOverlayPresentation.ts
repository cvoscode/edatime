import type { GridLayout } from './chartInteractions.js';
import {
    type FrequencyPeak,
    type FrequencyUnit,
    formatFrequency,
    formatFrequencyInUnit,
    frequencyToPeriod,
} from '../utils/spectralPresets.js';
import { getChartPalette } from '../utils/theme.js';

export interface FftOverlayRenderState {
    xMin: number;
    xMax: number;
    unit: FrequencyUnit;
    annotations: readonly number[];
    showPeakLabels: boolean;
    dominantPeaks: readonly FrequencyPeak[];
    primaryTracePoints: ReadonlyArray<readonly [number, number]>;
    yMin: number;
    yMax: number;
}

/** Render FFT annotations and peak labels against the chart's display values. */
export function renderFftOverlay(
    canvas: HTMLCanvasElement,
    grid: GridLayout,
    state: FftOverlayRenderState,
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const palette = getChartPalette();

    const { xMin, xMax } = state;
    if (xMax <= xMin) return;
    const plotL = grid.left;
    const plotT = grid.top;
    const plotW = canvas.width - grid.left - grid.right;
    const plotH = canvas.height - grid.top - grid.bottom;
    if (plotW <= 0 || plotH <= 0) return;

    if (state.showPeakLabels && state.dominantPeaks.length > 0) {
        renderPeakLabels(ctx, state, plotL, plotT, plotW, plotH);
    }

    if (state.annotations.length === 0) return;
    ctx.save();
    ctx.font = '11px Inter, system-ui, sans-serif';
    for (const freqHz of state.annotations) {
        if (freqHz < xMin || freqHz > xMax) continue;
        const ax = plotL + ((freqHz - xMin) / (xMax - xMin)) * plotW;
        ctx.strokeStyle = palette.warning;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(ax, plotT);
        ctx.lineTo(ax, plotT + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        const label = formatFrequencyInUnit(freqHz, state.unit);
        ctx.fillStyle = palette.warning;
        ctx.textAlign = ax > canvas.width / 2 ? 'right' : 'left';
        ctx.fillText(label, ax + (ax > canvas.width / 2 ? -5 : 5), plotT + 14);
    }
    ctx.restore();
}

function renderPeakLabels(
    ctx: CanvasRenderingContext2D,
    state: FftOverlayRenderState,
    plotL: number,
    plotT: number,
    plotW: number,
    plotH: number,
): void {
    const { xMin, xMax, yMin, yMax } = state;
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) return;

    ctx.save();
    const palette = getChartPalette();
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    const candidates: Array<{ peak: FrequencyPeak; ax: number; ay: number }> = [];
    for (const peak of state.dominantPeaks.slice(0, 3)) {
        const freqHz = peak.frequency_hz;
        if (freqHz < xMin || freqHz > xMax) continue;
        const point = state.primaryTracePoints.find(([frequency]) => Math.abs(frequency - freqHz) < 1e-10);
        if (!point) continue;
        const ax = plotL + ((freqHz - xMin) / (xMax - xMin)) * plotW;
        const ay = plotT + plotH - ((point[1] - yMin) / (yMax - yMin)) * plotH;
        candidates.push({ peak, ax, ay });
    }

    const clustered: Array<{ peak: FrequencyPeak; ax: number; ay: number }> = [];
    let previous: { peak: FrequencyPeak; ax: number; ay: number } | null = null;
    for (const candidate of candidates) {
        const overlapsPrevious = previous
            && Math.abs(previous.ax - candidate.ax) < 60
            && Math.abs(previous.ay - candidate.ay) < 40;
        if (!overlapsPrevious) clustered.push(candidate);
        previous = candidate;
    }

    const rowHeight = 18;
    const labelTop = plotT + 12;
    let rowIndex = 0;
    for (const { peak, ax, ay } of clustered.slice(0, 2)) {
        ctx.fillStyle = palette.danger;
        ctx.beginPath();
        ctx.arc(ax, ay, 4, 0, Math.PI * 2);
        ctx.fill();

        const alignRight = ax > plotL + plotW / 2;
        const labelX = ax + (alignRight ? -12 : 12);
        const labelY = labelTop + (rowIndex * rowHeight);
        const periodY = labelY + 10;
        const lineEndX = labelX + (alignRight ? -4 : 4);
        rowIndex += 1;

        ctx.strokeStyle = palette.borderHi;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay - 6);
        ctx.lineTo(lineEndX, labelY);
        ctx.stroke();

        const label = formatFrequency(peak.frequency_hz);
        const period = frequencyToPeriod(peak.frequency_hz);
        const plateWidth = Math.max(ctx.measureText(label).width, ctx.measureText(`(${period})`).width) + 10;
        const plateX = alignRight ? labelX - plateWidth : labelX;
        ctx.fillStyle = palette.surfaceElevated;
        ctx.fillRect(plateX, labelY - 8, plateWidth, 18);

        ctx.fillStyle = palette.text;
        ctx.textAlign = alignRight ? 'right' : 'left';
        ctx.fillText(label, labelX, labelY);
        ctx.fillStyle = palette.textDim;
        ctx.fillText(`(${period})`, labelX, periodY);
    }

    ctx.restore();
}
