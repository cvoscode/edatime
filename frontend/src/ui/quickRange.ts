/**
 * Quick-range controls — "24h", "7d", "30d", "All" buttons on the
 * timeseries toolbar that snap the current view to a fixed window
 * relative to the dataset's end. See `usage_issue.md` §1.6.
 *
 * Buttons stay disabled until a dataset has been loaded, and they
 * enable/disable themselves again when the dataset range changes.
 */

import { applyViewport } from './viewport.js';
import { datasetState } from '../store/datasetState.js';
import { subscribe } from '../store/events.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

const PRESETS: Array<{ id: string; label: string; durationMs: number | null }> = [
    { id: 'quick-range-24h', label: '24h', durationMs: 24 * 60 * 60 * 1000 },
    { id: 'quick-range-7d', label: '7d', durationMs: 7 * 24 * 60 * 60 * 1000 },
    { id: 'quick-range-30d', label: '30d', durationMs: 30 * 24 * 60 * 60 * 1000 },
    { id: 'quick-range-all', label: 'All', durationMs: null },
];

function getDatasetRange(): { min: number; max: number } | null {
    const range = datasetState.metadata?.time_range;
    if (!range) return null;
    const min = Number(range.min);
    const max = Number(range.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    return { min, max };
}

function updateButtonStates(): void {
    const range = getDatasetRange();
    for (const preset of PRESETS) {
        const btn = document.getElementById(preset.id) as HTMLButtonElement | null;
        if (!btn) continue;
        btn.disabled = !range;
        btn.removeAttribute('aria-disabled');
        if (range) {
            btn.title = preset.durationMs === null
                ? `Full dataset range (${new Date(range.min).toISOString()} – ${new Date(range.max).toISOString()} UTC)`
                : `Last ${preset.label} ending at ${new Date(range.max).toISOString()} UTC`;
        }
    }
}

function applyPreset(
    durationMs: number | null,
    fetchAndRender: () => void,
    workspace: Pick<WorkspaceStore, 'setViewport'>,
): void {
    const range = getDatasetRange();
    if (!range) return;
    const endMs = range.max;
    let startMs = range.min;
    if (durationMs !== null) {
        startMs = Math.max(range.min, endMs - durationMs);
    }
    applyViewport(
        { xMin: startMs, xMax: endMs, yMin: null, yMax: null },
        fetchAndRender,
        'quick-range',
        workspace,
    );
}

/**
 * Bind quick-range buttons to the supplied fetch+render callback.
 * Idempotent — repeated calls rebind the same handler without
 * accumulating listeners.
 */
export function initQuickRangeControls(
    fetchAndRender: () => void,
    workspace: Pick<WorkspaceStore, 'setViewport'>,
): void {
    for (const preset of PRESETS) {
        const btn = document.getElementById(preset.id) as HTMLButtonElement | null;
        if (!btn) continue;
        // Replace the previous click listener by re-cloning the element.
        // Easier than tracking + removing individual handlers.
        const clone = btn.cloneNode(true) as HTMLButtonElement;
        btn.parentNode?.replaceChild(clone, btn);
        clone.addEventListener('click', () => applyPreset(preset.durationMs, fetchAndRender, workspace));
    }
    subscribe('dataset:metadata', () => updateButtonStates());
    updateButtonStates();
}

/**
 * Refresh the enabled state of the quick-range buttons. Call this after
 * any metadata refresh so the buttons reflect the new dataset range.
 */
export function refreshQuickRangeControls(): void {
    updateButtonStates();
}

/**
 * Pure helper exposed for tests — given a duration in ms (or `null` for
 * the "All" preset), clamp the resulting window to the dataset range.
 * Returns `{ startMs, endMs }` for the next viewport.
 */
export function __quickRangeForTest(
    durationMs: number | null,
    start: number,
    end: number,
): { startMs: number; endMs: number } {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return { startMs: start, endMs: end };
    }
    if (durationMs === null) {
        return { startMs: start, endMs: end };
    }
    return {
        startMs: Math.max(start, end - durationMs),
        endMs: end,
    };
}
