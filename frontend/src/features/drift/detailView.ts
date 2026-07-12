/**
 * drift/detailView.ts — Detail chart, stats, and window list rendering.
 *
 * Responsibilities:
 *   - Detail chart initialisation and resize
 *   - Detail option context building (delegates to viewModels.ts)
 *   - Detail stats HTML rendering
 *   - Window list HTML rendering with DOM diffing
 *
 * This module is page-local (drift-specific policy), NOT promoted to ui/*.
 */

import type { EChartLike } from './types.js';
import {
    buildDetailOption,
    buildDetailStatRows,
    buildWindowListHtml,
    sortedWindowIndices,
} from './viewModels.js';
import {
    getActiveDetailColumn,
    getSelectedWindowIdx,
    getActiveResponse,
    getResponsesByColumn,
    getWindowSort,
    setSelectedWindowIdx,
} from './selection.js';

// ── Chart instance (owned by this module) ────────────────────────────────────

let _detailChart: EChartLike | null = null;
let _detailEl: HTMLElement | null = null;

/** Returns the current detail chart instance. */
export function getDetailChart(): EChartLike | null {
    return _detailChart;
}

/** Disposes the detail chart (for use in tests). */
export function _setDetailChart(chart: EChartLike | null): void {
    _detailChart = chart;
}

/** Initialize the detail chart on the given DOM element. */
export function initDetailChart(
    echarts: typeof import('echarts'),
    el: HTMLElement,
): EChartLike {
    _detailEl = el;
    echarts.getInstanceByDom?.(el)?.dispose?.();
    const chart = echarts.init(el, undefined, { renderer: 'canvas' }) as unknown as EChartLike;
    _detailChart = chart;
    return chart;
}

/** Resize the detail chart to fit its container. */
export function resizeDetailChart(): void {
    _detailChart?.resize();
}

/** Dispose the detail chart. */
export function disposeDetailChart(): void {
    _detailChart?.dispose();
    _detailChart = null;
}

// ── Context builder ──────────────────────────────────────────────────────────

/** Build the context object for buildDetailOption. */
export function buildDetailContext(plotType: string): {
    responsesByColumn: Map<string, import('./viewModels.js').DriftResponse>;
    activeDetailColumn: string | null;
    selectedWindowIdx: number | null;
    plotType: string;
} {
    return {
        responsesByColumn: getResponsesByColumn(),
        activeDetailColumn: getActiveDetailColumn(),
        selectedWindowIdx: getSelectedWindowIdx(),
        plotType,
    };
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** Render the detail chart with the current selection state. */
export function renderDetail(plotType = 'boxplot'): void {
    if (!_detailChart) return;
    const ctx = buildDetailContext(plotType);
    _detailChart.setOption(buildDetailOption(ctx), { notMerge: false, lazyUpdate: true });
}

/**
 * Render the detail chart with a full reset (new data).
 * Use when active column or selected window changes structurally.
 */
export function renderDetailFull(plotType = 'boxplot'): void {
    if (!_detailChart) return;
    const ctx = buildDetailContext(plotType);
    _detailChart.setOption(buildDetailOption(ctx), { notMerge: true, lazyUpdate: true });
}

// ── Detail stats ─────────────────────────────────────────────────────────────

/** Build and render detail stats into the given element. Returns the header text. */
export function updateDetailStats(
    detailStatsEl: HTMLElement | null,
    detailHeader: HTMLElement | null,
): void {
    if (!detailStatsEl) return;
    const response = getActiveResponse();
    const win = response && getSelectedWindowIdx() !== null
        ? response.windows[getSelectedWindowIdx()!]
        : null;

    if (!response || !win) {
        detailStatsEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem;">Select a window to see stats</span>';
        if (detailHeader) detailHeader.textContent = 'Window Detail';
        return;
    }

    if (detailHeader) {
        detailHeader.textContent = `${response.column} - ${win.label}${win.low_sample_warning ? ' (Low N)' : ''}`;
    }

    const rows = buildDetailStatRows(win);
    detailStatsEl.innerHTML = rows.map((r) => `
        <div class="drift-detail-stat-row">
            <span class="drift-detail-stat-label">${r.label}</span>
            <span class="drift-detail-stat-value${r.className ? ' ' + r.className : ''}">${r.value}</span>
        </div>
    `).join('');
}

// ── Window list ──────────────────────────────────────────────────────────────

/**
 * Render the window list into windowListEl.
 * Uses DOM diffing to avoid full rebuilds when sort order hasn't changed.
 */
export function renderWindowList(windowListEl: HTMLElement | null): void {
    if (!windowListEl) return;
    const response = getActiveResponse();
    if (!response) {
        windowListEl.innerHTML = '';
        return;
    }

    const orderedIdxs = sortedWindowIndices(response, getWindowSort());

    // DOM diffing: if the item count and order match, only update selected state
    // instead of rebuilding all DOM nodes (issue #6).
    const existingItems = windowListEl.querySelectorAll<HTMLElement>('.drift-window-item');
    const existingIdxs = Array.from(existingItems).map((el) => Number(el.dataset.windowIdx));
    const sameLayout =
        existingItems.length === orderedIdxs.length &&
        orderedIdxs.every((idx, i) => existingIdxs[i] === idx);

    if (sameLayout) {
        existingItems.forEach((el, i) => {
            const isSelected = orderedIdxs[i] === getSelectedWindowIdx();
            el.classList.toggle('selected', isSelected);
            el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
        return;
    }

    // Full rebuild (sort changed or list length changed).
    const scrollTop = windowListEl.scrollTop;

    // Build new HTML using viewModels helper
    const { html } = buildWindowListHtml(response, getSelectedWindowIdx(), orderedIdxs);
    windowListEl.innerHTML = html;

    // Attach click/keydown handlers to each item
    windowListEl.querySelectorAll<HTMLElement>('.drift-window-item').forEach((item) => {
        const idx = Number(item.dataset.windowIdx);
        const selectWindow = () => {
            setSelectedWindowIdx(idx);
            // Dispatch custom event so driftPage can handle the full re-render.
            windowListEl!.dispatchEvent(new CustomEvent('drift:window-select', { bubbles: true, detail: { windowIdx: idx } }));
        };
        item.addEventListener('click', selectWindow);
        item.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            selectWindow();
        });
    });

    // Restore scroll position after rebuild to avoid jarring jumps.
    windowListEl.scrollTop = scrollTop;
}