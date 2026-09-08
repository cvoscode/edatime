/**
 * Quick-range controls — "24h", "7d", "30d", "All" buttons on the
 * timeseries toolbar that snap the current view to a fixed window
 * relative to the dataset's end. See `usage_issue.md` §1.6.
 *
 * Buttons stay disabled until a dataset has been loaded, and they
 * enable/disable themselves again when the dataset range changes.
 */

import { applyViewport } from './viewport.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

const PRESETS: Array<{ id: string; label: string; durationMs: number | null }> = [
    { id: 'quick-range-24h', label: '24h', durationMs: 24 * 60 * 60 * 1000 },
    { id: 'quick-range-7d', label: '7d', durationMs: 7 * 24 * 60 * 60 * 1000 },
    { id: 'quick-range-30d', label: '30d', durationMs: 30 * 24 * 60 * 60 * 1000 },
    { id: 'quick-range-all', label: 'All', durationMs: null },
];

type RangeWorkspace = Pick<WorkspaceStore, 'getSnapshot' | 'setViewport' | 'subscribe'>;

function getDatasetRange(workspace: RangeWorkspace): { min: number; max: number } | null {
    const range = workspace.getSnapshot().dataset.metadata?.time_range;
    if (!range) return null;
    const min = Number(range.min);
    const max = Number(range.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    return { min, max };
}

function updateButtonStates(workspace: RangeWorkspace): void {
    const range = getDatasetRange(workspace);
    const totalRows = Number(workspace.getSnapshot().dataset.metadata?.total_rows ?? 0);
    for (const preset of PRESETS) {
        const btn = document.getElementById(preset.id) as HTMLButtonElement | null;
        if (!btn) continue;
        const estimatedPoints = range && preset.durationMs !== null && totalRows > 0
            ? Math.round(totalRows * Math.min(1, preset.durationMs / (range.max - range.min)))
            : null;
        const tooSparse = estimatedPoints !== null && estimatedPoints < 50;
        btn.disabled = !range || tooSparse;
        btn.removeAttribute('aria-disabled');
        if (range) {
            btn.title = preset.durationMs === null
                ? `Full dataset range (${new Date(range.min).toISOString()} – ${new Date(range.max).toISOString()} UTC)`
                : tooSparse
                    ? `Last ${preset.label} would contain about ${estimatedPoints} points; use Custom or a longer range.`
                    : `Last ${preset.label} ending at ${new Date(range.max).toISOString()} UTC (about ${estimatedPoints ?? 'unknown'} points)`;
        }
    }
    const custom = document.getElementById('quick-range-custom') as HTMLDetailsElement | null;
    if (custom) {
        custom.toggleAttribute('data-disabled', !range);
        const start = document.getElementById('quick-range-custom-start') as HTMLInputElement | null;
        const end = document.getElementById('quick-range-custom-end') as HTMLInputElement | null;
        const toLocalValue = (value: number) => {
            const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
            return date.toISOString().slice(0, 16);
        };
        if (range && start && end) {
            const min = toLocalValue(range.min);
            const max = toLocalValue(range.max);
            start.min = min;
            start.max = max;
            end.min = min;
            end.max = max;
            const currentStart = start.value ? new Date(start.value).getTime() : Number.NaN;
            const currentEnd = end.value ? new Date(end.value).getTime() : Number.NaN;
            if (!Number.isFinite(currentStart) || currentStart < range.min || currentStart >= range.max) start.value = min;
            if (!Number.isFinite(currentEnd) || currentEnd > range.max || currentEnd <= range.min) end.value = max;
        }
    }
}

function applyPreset(
    durationMs: number | null,
    fetchAndRender: () => void,
    workspace: RangeWorkspace,
): void {
    const range = getDatasetRange(workspace);
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
    workspace: RangeWorkspace,
): () => void {
    const lifetime = new AbortController();
    for (const preset of PRESETS) {
        const btn = document.getElementById(preset.id) as HTMLButtonElement | null;
        if (!btn) continue;
        // Replace the previous click listener by re-cloning the element.
        // Easier than tracking + removing individual handlers.
        const clone = btn.cloneNode(true) as HTMLButtonElement;
        btn.parentNode?.replaceChild(clone, btn);
        clone.addEventListener('click', () => applyPreset(preset.durationMs, fetchAndRender, workspace), { signal: lifetime.signal });
    }
    const custom = document.getElementById('quick-range-custom') as HTMLDetailsElement | null;
    const customApply = document.getElementById('quick-range-custom-apply') as HTMLButtonElement | null;
    custom?.addEventListener('toggle', () => {
        if (custom.hasAttribute('data-disabled')) custom.open = false;
    }, { signal: lifetime.signal });
    customApply?.addEventListener('click', () => {
        const range = getDatasetRange(workspace);
        const startInput = document.getElementById('quick-range-custom-start') as HTMLInputElement | null;
        const endInput = document.getElementById('quick-range-custom-end') as HTMLInputElement | null;
        const error = document.getElementById('quick-range-custom-error');
        const startMs = startInput?.value ? new Date(startInput.value).getTime() : Number.NaN;
        const endMs = endInput?.value ? new Date(endInput.value).getTime() : Number.NaN;
        if (!range || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs
            || startMs < range.min || endMs > range.max) {
            if (error) error.textContent = 'Choose a valid range within the dataset extent.';
            return;
        }
        if (error) error.textContent = '';
        applyViewport({ xMin: startMs, xMax: endMs, yMin: null, yMax: null }, fetchAndRender, 'custom-range', workspace);
        if (custom) custom.open = false;
    }, { signal: lifetime.signal });
    const unsubscribe = workspace.subscribe(() => updateButtonStates(workspace));
    updateButtonStates(workspace);
    return () => { lifetime.abort(); unsubscribe(); };
}

/**
 * Refresh the enabled state of the quick-range buttons. Call this after
 * any metadata refresh so the buttons reflect the new dataset range.
 */
export function refreshQuickRangeControls(workspace: RangeWorkspace): void {
    updateButtonStates(workspace);
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
