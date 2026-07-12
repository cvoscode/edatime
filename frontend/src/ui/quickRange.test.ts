/**
 * Tests for the quick-range helper exposed by `ui/quickRange.ts`.
 *
 * The toolbar's "24h", "7d", "30d", "All" buttons (added to address
 * `usage_issue.md` §1.6) call this helper. The pure logic for picking
 * the new [start, end] window is exported via `__quickRangeForTest`
 * for unit-testability.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setMetadata } from '../store/datasetState.js';
import {
    __quickRangeForTest,
    initQuickRangeControls,
    refreshQuickRangeControls,
} from './quickRange.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';

function resetDom(): void {
    document.body.innerHTML = `
        <button id="quick-range-24h" disabled></button>
        <button id="quick-range-7d" disabled></button>
        <button id="quick-range-30d" disabled></button>
        <button id="quick-range-all" disabled></button>
    `;
}

describe('quickRange', () => {
    let workspace: ReturnType<typeof createWorkspaceStore>;

    beforeEach(() => {
        resetDom();
        setMetadata(null);
        workspace = createWorkspaceStore();
    });

    it('disables all presets until a dataset with a time range is loaded', () => {
        initQuickRangeControls(() => undefined, workspace);
        refreshQuickRangeControls();
        for (const id of ['quick-range-24h', 'quick-range-7d', 'quick-range-30d', 'quick-range-all']) {
            const btn = document.getElementById(id) as HTMLButtonElement;
            expect(btn.disabled).toBe(true);
        }
    });

    it('enables presets once a metadata range is set', () => {
        initQuickRangeControls(() => undefined, workspace);
        const start = Date.UTC(2024, 0, 1);
        const end = Date.UTC(2024, 6, 1); // ~6 months later
        setMetadata({
            total_rows: 0,
            columns: [],
            numeric_columns: [],
            time_column: 'ts',
            time_range: { min: start, max: end },
            column_profiles: [],
        } as any);
        refreshQuickRangeControls();
        for (const id of ['quick-range-24h', 'quick-range-7d', 'quick-range-30d', 'quick-range-all']) {
            const btn = document.getElementById(id) as HTMLButtonElement;
            expect(btn.disabled).toBe(false);
            expect(btn.title).toContain('UTC');
        }
    });

    it('24h preset anchors at end - 24h', () => {
        const start = Date.UTC(2024, 0, 1);
        const end = Date.UTC(2024, 0, 10); // 9 days later
        const result = __quickRangeForTest(24 * 60 * 60 * 1000, start, end);
        expect(result.endMs).toBe(end);
        expect(result.startMs).toBe(end - 24 * 60 * 60 * 1000);
    });

    it('7d preset clamps to dataset start when the window extends past it', () => {
        const start = Date.UTC(2024, 0, 1);
        const end = Date.UTC(2024, 0, 3); // only 2 days available
        const result = __quickRangeForTest(7 * 24 * 60 * 60 * 1000, start, end);
        // Window would extend before start, so we clamp.
        expect(result.startMs).toBe(start);
        expect(result.endMs).toBe(end);
    });

    it('All preset returns the full dataset range', () => {
        const start = Date.UTC(2024, 0, 1);
        const end = Date.UTC(2024, 11, 31);
        const result = __quickRangeForTest(null, start, end);
        expect(result.startMs).toBe(start);
        expect(result.endMs).toBe(end);
    });

    it('initQuickRangeControls wires click handlers that call applyViewport', () => {
        const fetchAndRender = vi.fn();
        initQuickRangeControls(fetchAndRender, workspace);
        setMetadata({
            total_rows: 0,
            columns: [],
            numeric_columns: [],
            time_column: 'ts',
            time_range: { min: 0, max: 7 * 24 * 60 * 60 * 1000 },
            column_profiles: [],
        } as any);
        refreshQuickRangeControls();
        // The click handlers do not call fetchAndRender directly — they go
        // through `applyViewport` which schedules a debounced fetch — so
        // we just verify the button is enabled and bound.
        const btn = document.getElementById('quick-range-7d') as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        btn.click();
        expect(fetchAndRender).not.toHaveBeenCalled();
    });

    it('publishes the selected quick range to the workspace before refreshing', () => {
        const workspace = createWorkspaceStore();
        const fetchAndRender = vi.fn();
        initQuickRangeControls(fetchAndRender, workspace);
        setMetadata({
            total_rows: 0,
            columns: [],
            numeric_columns: [],
            time_column: 'ts',
            time_range: { min: 0, max: 7 * 24 * 60 * 60 * 1000 },
            column_profiles: [],
        } as any);
        refreshQuickRangeControls();

        (document.getElementById('quick-range-24h') as HTMLButtonElement).click();

        expect(workspace.getSnapshot().viewport).toEqual({
            xMin: 6 * 24 * 60 * 60 * 1000,
            xMax: 7 * 24 * 60 * 60 * 1000,
            yMin: null,
            yMax: null,
        });
    });
});
