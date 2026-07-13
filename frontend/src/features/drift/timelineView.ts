/**
 * drift/timelineView.ts — Timeline boxplot chart rendering and interaction.
 *
 * Responsibilities:
 *   - Timeline chart initialisation and resize
 *   - Timeline option context building
 *   - Timeline chart click handling → delegates to selection.ts
 *   - renderTimeline() — applies buildTimelineOption to the chart
 *
 * This module is page-local (drift-specific policy), NOT promoted to ui/*.
 */

import type { EChartLike } from './types.js';
import type { DriftResponse } from './viewModels.js';
import { buildTimelineOption } from './viewModels.js';
import {
    getActiveDetailColumn,
    getSelectedWindowIdx,
    setActiveDetailColumn,
    setSelectedWindowIdx,
    getResponsesByColumn,
} from './selection.js';

// ── Chart instance (owned by this module) ────────────────────────────────────

let _timelineChart: EChartLike | null = null;
let _timelineEl: HTMLElement | null = null;

/** Returns the current timeline chart instance. */
export function getTimelineChart(): EChartLike | null {
    return _timelineChart;
}

/** Disposes the timeline chart (for use in tests). */
export function _setTimelineChart(chart: EChartLike | null): void {
    _timelineChart = chart;
}

/** Initialize the timeline chart on the given DOM element. */
export function initTimelineChart(
    echarts: typeof import('echarts'),
    el: HTMLElement,
    onClick: (col: string, windowIdx: number) => void,
): EChartLike {
    _timelineEl = el;
    echarts.getInstanceByDom?.(el)?.dispose?.();
    const chart = echarts.init(el, undefined, { renderer: 'canvas' }) as unknown as EChartLike;
    chart.on('click', (params: any) => {
        if (params?.seriesType !== 'boxplot') return;
        const clickedCol = String(params?.seriesName || '');
        const clickedIndex = Number(params?.dataIndex);
        if (!clickedCol || !Number.isFinite(clickedIndex)) return;
        if (clickedIndex <= 0) return; // reference box (index 0) not a window
        setActiveDetailColumn(clickedCol);
        setSelectedWindowIdx(clickedIndex - 1);
        onClick(clickedCol, clickedIndex - 1);
    });
    _timelineChart = chart;
    return chart;
}

/** Resize the timeline chart to fit its container. */
export function resizeTimelineChart(): void {
    _timelineChart?.resize();
}

/** Dispose the timeline chart and release its former DOM root. */
export function disposeTimelineChart(): void {
    _timelineChart?.dispose();
    _timelineChart = null;
    _timelineEl = null;
}

// ── Context builder ──────────────────────────────────────────────────────────

/** Build the context object for buildTimelineOption. */
export function buildTimelineContext(): {
    responsesByColumn: Map<string, DriftResponse>;
    activeDetailColumn: string | null;
    selectedWindowIdx: number | null;
} {
    return {
        responsesByColumn: getResponsesByColumn(),
        activeDetailColumn: getActiveDetailColumn(),
        selectedWindowIdx: getSelectedWindowIdx(),
    };
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** Render the timeline chart with the current selection state. */
export function renderTimeline(): void {
    if (!_timelineChart) return;
    const ctx = buildTimelineContext();
    _timelineChart.setOption(buildTimelineOption(ctx), { notMerge: false, lazyUpdate: true });
}

/**
 * Render the timeline chart with a full reset (new series data).
 * Use when responsesByColumn has changed structurally.
 */
export function renderTimelineFull(): void {
    if (!_timelineChart) return;
    const ctx = buildTimelineContext();
    _timelineChart.setOption(buildTimelineOption(ctx), { notMerge: true, lazyUpdate: true });
}
