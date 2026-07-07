/**
 * scatter/runtime.ts — Scatter page runtime and loading/status seams.
 *
 * Exports:
 *   - initScatterPageRuntime() — bootstraps the analysis page runtime
 *   - syncScatterEmptyState() — updates empty state visibility and reason
 *   - syncScatterFilterBadge() — updates the active filter badge
 *   - refreshCorrelationsAndSuggestions() — fetches and renders correlation data
 *   - refreshActiveScatterView() — re-renders the active view (plot or matrix)
 */

import { createAnalysisPageRuntime } from '../pages/shared/analysisPageRuntime.js';
import {
    exportScatterPNG,
    exportScatterSVG,
    exportScatterHTML,
    exportScatterData,
} from './rendering.js';
import { getEl } from './helpers.js';
import { appState } from '../store/index.js';
import { createEmptyStateController, isRangeOutsideDataset } from '../ui/emptyState.js';
import { isLinkedBrushEnabled, currentControls, getActiveScatterFilterColumns } from './state.js';
import { defaultGpuPowerPreference, requestGpuAdapter } from '../utils/platform.js';
import { getDropdownValue } from '../ui/primitives/Dropdown.js';

/** Module-level runtime handle for the scatter page lifecycle. */
let scatterRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;

let scatterEmptyStateController: ReturnType<typeof createEmptyStateController> | null = null;

function syncScatterFilterBanner(): void {
    const banner = document.getElementById('scatter-filter-banner') as HTMLElement | null;
    const text = document.getElementById('scatter-filter-banner-text') as HTMLElement | null;
    const clearButton = document.getElementById('scatter-filter-banner-clear') as HTMLButtonElement | null;
    if (!banner || !text || !clearButton) return;

    const controls = currentControls();
    const activeColumns = Array.from(new Set(getActiveScatterFilterColumns({
        x: controls.x,
        y: controls.y,
        colorColumn: controls.selectedColorColumn,
    })));
    const columnCount = activeColumns.length;
    const adaptiveCount = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters.length : 0;
    const hasZoomRange = Number.isFinite(appState.currentStart) && Number.isFinite(appState.currentEnd);
    const hasFilters = hasZoomRange || columnCount > 0 || adaptiveCount > 0;

    banner.hidden = !hasFilters;
    if (!hasFilters) {
        text.textContent = '';
        return;
    }

    const parts: string[] = [];
    if (hasZoomRange) parts.push('zoom range');
    if (columnCount > 0) parts.push(`${columnCount} column filter${columnCount === 1 ? '' : 's'}`);
    if (adaptiveCount >= 0) parts.push(`${adaptiveCount} adaptive filter${adaptiveCount === 1 ? '' : 's'}`);
    text.textContent = `Timeseries filters carry over here: ${parts.join(', ')}`;

    if (!clearButton.dataset.bound) {
        clearButton.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('edatime:clear-all-filters'));
        });
        clearButton.dataset.bound = '1';
    }
}

export function getScatterEmptyStateController() {
    if (!scatterEmptyStateController) {
        scatterEmptyStateController = createEmptyStateController({
            rootId: 'scatter-empty-state',
            titleId: 'scatter-empty-title',
            messageId: 'scatter-empty-message',
            resetButtonId: 'scatter-reset-range-btn',
            clearButtonId: 'scatter-clear-filters-btn',
            resetEventName: 'edatime:request-chart-range-reset',
            clearEventName: 'edatime:clear-all-filters',
            eventSource: 'scatter-empty-state',
        });
    }
    return scatterEmptyStateController;
}

/** Probes WebGPU once; caches result. */
let _gpuUnavailable: boolean | null = null;

export async function isGPUAvailable(): Promise<boolean> {
    if (_gpuUnavailable !== null) return !_gpuUnavailable;
    if (!navigator.gpu) { _gpuUnavailable = true; return false; }
    try {
        const adapter = await Promise.race([
            requestGpuAdapter(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        _gpuUnavailable = !adapter;
    } catch {
        _gpuUnavailable = true;
    }
    return !_gpuUnavailable;
}

export function getGpuUnavailable(): boolean | null {
    return _gpuUnavailable;
}

export function setGpuUnavailable(val: boolean): void {
    _gpuUnavailable = val;
}

/**
 * Updates the scatter empty state based on current page conditions.
 */
export function syncScatterEmptyState(message?: string): void {
    const emptyState = getScatterEmptyStateController();
    const hasAxes = !!getDropdownValue('scatter-x-col') && !!getDropdownValue('scatter-y-col');
    const isLoading = appState.scatter.loading && hasAxes && !(_gpuUnavailable && !appState.scatter.chart);
    syncScatterFilterBadge();
    syncScatterFilterBanner();

    const linkedRangeOutside = isLinkedBrushEnabled()
        && isRangeOutsideDataset(appState.metadata?.time_range, appState.currentStart, appState.currentEnd);

    let reason: string;
    if (_gpuUnavailable && !appState.scatter.chart) {
        reason = 'gpu-unavailable';
    } else if (!hasAxes) {
        reason = 'no-columns-selected';
    } else if (isLoading) {
        reason = 'loading';
    } else if (appState.scatter.totalPoints === 0) {
        reason = linkedRangeOutside ? 'linked-range-outside-dataset' : 'no-data-after-filters';
    } else {
        reason = '';
    }

    const controls = currentControls();
    const activeColumns = getActiveScatterFilterColumns({
        x: controls.x,
        y: controls.y,
        colorColumn: controls.selectedColorColumn,
    });
    const scopedFilterCount = new Set(activeColumns).size;
    const adaptiveFilterCount = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters.length : 0;

    const text = message
        || (_gpuUnavailable && !appState.scatter.chart
            ? 'WebGPU is not available. Scatter rendering requires a WebGPU-capable browser (Chrome 113+, Edge 113+, Safari 18+).'
            : !hasAxes
                ? 'Choose X and Y numeric columns to render the scatter plot.'
                : isLoading
                    ? 'Loading scatter points…'
                    : linkedRangeOutside
                        ? 'Linked time range is outside the current dataset. Reset range to recover points.'
                        : (scopedFilterCount > 0 || adaptiveFilterCount > 0)
                            ? `No points match active filters (${scopedFilterCount} column, ${adaptiveFilterCount} adaptive).`
                            : 'No points match the current query.');

    emptyState.update({
        visible: !isLoading && !(hasAxes && appState.scatter.totalPoints > 0 && !(_gpuUnavailable && !appState.scatter.chart)),
        reason,
        title: _gpuUnavailable && !appState.scatter.chart
            ? 'WebGPU unavailable'
            : !hasAxes
                ? 'Choose scatter axes'
                : isLoading
                    ? 'Loading scatter plot'
                    : linkedRangeOutside
                        ? 'Linked range outside dataset'
                        : 'No scatter points found',
        message: text,
        showResetAction: reason === 'linked-range-outside-dataset',
        showClearAction: reason === 'no-data-after-filters',
        fallbackText: text,
    });
}

export function syncScatterFilterBadge(): void {
    const badge = document.getElementById('scatter-active-filter-badge');
    if (!badge) return;
    const controls = currentControls();
    const columns = Array.from(new Set(getActiveScatterFilterColumns({
        x: controls.x,
        y: controls.y,
        colorColumn: controls.selectedColorColumn,
    })));
    if (columns.length === 0) {
        badge.hidden = true;
        badge.textContent = '';
        badge.removeAttribute('title');
        return;
    }
    badge.hidden = false;
    badge.textContent = `${columns.length} filter${columns.length === 1 ? '' : 's'} active`;
    badge.setAttribute('title', `Active scatter filters: ${columns.join(', ')}`);
}

/**
 * Bootstraps the scatter page runtime — must be called BEFORE the first
 * edatime:page-change 'scatter' event so event listeners are registered first.
 */
export function initScatterPageRuntime(): void {
    scatterRuntime = createAnalysisPageRuntime({
        page: 'scatter',
        emptyStateRootId: 'scatter-empty-state',
        statusElId: 'scatter-status',
        bindExportsOnInit: false,
        exportConfig: {
            key: 'scatter',
            png: { fn: exportScatterPNG, filename: 'edatime_scatter.png' },
            svg: { fn: exportScatterSVG, filename: 'edatime_scatter.svg' },
            html: { fn: exportScatterHTML, filename: 'edatime_scatter.html' },
            csv: { fn: exportScatterData, filename: 'edatime_scatter.csv', dataCheck: () => appState.scatter.totalPoints > 0 },
        },
        init() {
            syncScatterEmptyState();
            syncScatterFilterBadge();
            syncScatterFilterBanner();
            scatterRuntime?.bindExports();
        },
        onEveryPageChange() {
            syncScatterEmptyState();
        },
    });
}

/** Returns the active scatter runtime handle. */
export function getScatterRuntime() {
    return scatterRuntime;
}
