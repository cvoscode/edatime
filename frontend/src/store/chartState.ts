/**
 * chartState — time-series chart viewport and chart instance management.
 *
 * Exported as part of the central store; imported by app.ts, toolbar.ts,
 * DataChart.ts, timeseriesPage.ts.
 */

import type { ChartInstance, ViewSnapshot } from '../types/chart.js';
import { emitStoreEvent } from './events.js';

/* ── State shape ──────────────────────────────────────── */

export interface ChartState {
    chart: ChartInstance | null;
    currentStart: number | null;
    currentEnd: number | null;
    initialView: ViewSnapshot | null;
    zoomHistory: ViewSnapshot[];
    chartText: { title: string; xLabel: string; yLabel: string };
    /**
     * When true, the chart's y-axis lower bound is clamped at 0 so the
     * series render against a clean baseline. Persists across reloads
     * via `localStorage` under `edatime_chart_stack_from_zero`.
     */
    stackFromZero: boolean;
}

export const chartState: ChartState = {
    chart: null,
    currentStart: null,
    currentEnd: null,
    initialView: null,
    zoomHistory: [],
    chartText: { title: '', xLabel: '', yLabel: '' },
    stackFromZero: false,
};

const STACK_FROM_ZERO_STORAGE_KEY = 'edatime_chart_stack_from_zero';

function readStackFromZeroPref(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(STACK_FROM_ZERO_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function writeStackFromZeroPref(value: boolean): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STACK_FROM_ZERO_STORAGE_KEY, value ? '1' : '0');
    } catch {
        // Best-effort persistence.
    }
}

/**
 * Initialise the chart-state from persisted user preferences. Called
 * once at startup from `app.ts` so the toolbar picks up the right
 * default.
 */
export function initChartStatePrefs(): void {
    chartState.stackFromZero = readStackFromZeroPref();
}

/* ── Mutations ──────────────────────────────────────────── */

function disposeChartInstance(chart: ChartInstance): void {
    const disposable = chart as ChartInstance & {
        deepDispose?: () => void;
        dispose?: () => void;
    };

    try {
        if (typeof disposable.deepDispose === 'function') {
            disposable.deepDispose();
        } else if (typeof disposable.destroy === 'function') {
            disposable.destroy();
        } else if (typeof disposable.dispose === 'function') {
            disposable.dispose();
        }
    } catch (err) {
        console.warn('[edatime:chart] failed to dispose previous chart instance:', err);
    }
}

export function setChartInstance(chart: ChartInstance | null): void {
    const previous = chartState.chart;
    if (previous && previous !== chart) {
        disposeChartInstance(previous);
    }
    chartState.chart = chart;
    emitStoreEvent('chart:chart', { previous, next: chart });
}

export function setViewport(start: number | null, end: number | null): void {
    const previousViewport = { start: chartState.currentStart, end: chartState.currentEnd };
    const previousStart = chartState.currentStart;
    const previousEnd = chartState.currentEnd;
    chartState.currentStart = start;
    chartState.currentEnd = end;
    emitStoreEvent('chart:currentStart', { previous: previousStart, next: start });
    emitStoreEvent('chart:currentEnd', { previous: previousEnd, next: end });
    emitStoreEvent('chart:viewport', {
        previous: previousViewport,
        next: { start, end },
    });
}

export function pushZoomHistory(entry: ViewSnapshot): void {
    const previous = chartState.zoomHistory;
    chartState.zoomHistory = [...chartState.zoomHistory, { ...entry }];
    if (chartState.zoomHistory.length > 20) {
        chartState.zoomHistory = chartState.zoomHistory.slice(-20);
    }
    emitStoreEvent('chart:zoomHistory', { previous, next: chartState.zoomHistory });
}

export function clearZoomHistory(): void {
    const previous = chartState.zoomHistory;
    chartState.zoomHistory = [];
    emitStoreEvent('chart:zoomHistory', { previous, next: chartState.zoomHistory });
}

export function setInitialView(view: ViewSnapshot | null): void {
    const previous = chartState.initialView;
    chartState.initialView = view ? { ...view } : null;
    emitStoreEvent('chart:initialView', { previous, next: chartState.initialView });
}

export function setZoomHistory(history: ViewSnapshot[]): void {
    const previous = chartState.zoomHistory;
    chartState.zoomHistory = history.map((entry) => ({ ...entry }));
    emitStoreEvent('chart:zoomHistory', { previous, next: chartState.zoomHistory });
}

export function setChartText(text: ChartState['chartText']): void {
    const previous = chartState.chartText;
    chartState.chartText = { ...text };
    emitStoreEvent('chart:chartText', { previous, next: chartState.chartText });
}

export function setStackFromZero(on: boolean): void {
    const previous = chartState.stackFromZero;
    chartState.stackFromZero = !!on;
    writeStackFromZeroPref(chartState.stackFromZero);
    emitStoreEvent('chart:stackFromZero', { previous, next: chartState.stackFromZero });
}
