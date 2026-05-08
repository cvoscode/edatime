/**
 * chartState — time-series chart viewport and chart instance management.
 *
 * Exported as part of the central store; imported by app.ts, toolbar.ts,
 * DataChart.ts, timeseriesPage.ts.
 */

import type { ChartInstance, ViewSnapshot } from '../types.js';

/* ── State shape ──────────────────────────────────────── */

export interface ChartState {
    chart: ChartInstance | null;
    currentStart: number | null;
    currentEnd: number | null;
    initialView: ViewSnapshot | null;
    zoomHistory: ViewSnapshot[];
    chartText: { title: string; xLabel: string; yLabel: string };
    fetchDebounceId: ReturnType<typeof setTimeout> | null;
}

export const chartState: ChartState = {
    chart: null,
    currentStart: null,
    currentEnd: null,
    initialView: null,
    zoomHistory: [],
    chartText: { title: '', xLabel: '', yLabel: '' },
    fetchDebounceId: null,
};

/* ── Mutations ──────────────────────────────────────────── */

export function setChartInstance(chart: ChartInstance | null): void {
    chartState.chart = chart;
}

export function setViewport(start: number | null, end: number | null): void {
    chartState.currentStart = start;
    chartState.currentEnd = end;
}

export function pushZoomHistory(entry: ViewSnapshot): void {
    chartState.zoomHistory.push(entry);
    if (chartState.zoomHistory.length > 20) {
        chartState.zoomHistory = chartState.zoomHistory.slice(-20);
    }
}

export function clearZoomHistory(): void {
    chartState.zoomHistory = [];
}

export function setInitialView(view: ViewSnapshot | null): void {
    chartState.initialView = view;
}

export function setChartText(title: string, xLabel: string, yLabel: string): void {
    chartState.chartText = { title, xLabel, yLabel };
}

export function setFetchDebounceId(id: ReturnType<typeof setTimeout> | null): void {
    chartState.fetchDebounceId = id;
}