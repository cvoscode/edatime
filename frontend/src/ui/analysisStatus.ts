/**
 * analysisStatus — live status text displayed in the analysis toolbar panel.
 * Updated on zoom, Y-range, cursor, and click events from the chart.
 */

import { formatAnalysisTime, formatAnalysisNumber } from '../state.js';

function setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

export function updateAnalysisZoom(startMs: number, endMs: number, sourceKind = 'user'): void {
    setText('analysis-zoom', `Range: ${formatAnalysisTime(startMs)} → ${formatAnalysisTime(endMs)} (${sourceKind})`);
}

export function updateAnalysisYRange(min: number, max: number, sourceKind = 'user'): void {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        setText('analysis-y', 'Y: —');
        return;
    }
    setText('analysis-y', `Y: ${formatAnalysisNumber(min)} → ${formatAnalysisNumber(max)} (${sourceKind})`);
}

export function updateAnalysisCursor(tsMs: number): void {
    if (!Number.isFinite(tsMs)) {
        setText('analysis-cursor', 'Cursor: —');
        return;
    }
    setText('analysis-cursor', `Cursor: ${formatAnalysisTime(tsMs)}`);
}

export function updateAnalysisClick(payload: { value?: number[]; seriesName?: string } | null): void {
    if (!payload?.value || payload.value.length < 2) {
        setText('analysis-click', 'Click: —');
        return;
    }
    const x = Number(payload.value[0]);
    const y = Number(payload.value[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        setText('analysis-click', 'Click: —');
        return;
    }
    const xStr = formatAnalysisTime(x);
    const yStr = formatAnalysisNumber(y);
    const seriesStr = payload.seriesName ? ` [${payload.seriesName}]` : '';
    setText('analysis-click', `Click: ${xStr}, ${yStr}${seriesStr}`);
}