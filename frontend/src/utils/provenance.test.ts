import { beforeEach, describe, expect, it } from 'vitest';

import { setAnomalyEnabled, setAnomalyMethod, setAnomalyThreshold, setRollingEnabled, setRollingWindow } from '../store/analyticsState.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';
import { __resetProvenanceForTests, initProvenance, toggleProvenance } from './provenance.js';

describe('provenance', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div class="app-content"></div>';
        __resetProvenanceForTests();
        setRollingEnabled(false);
        setRollingWindow(50);
        setAnomalyEnabled(false);
        setAnomalyMethod('zscore');
        setAnomalyThreshold(3);
    });

    it('renders provenance content from canonical workspace intent', () => {
        const workspace = createWorkspaceStore();
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 1234,
            columns: [{ name: 'ts' }, { name: 'value' }],
            time_column: 'ts',
        } as any, 1);
        workspace.setViewport({ xMin: 10, xMax: 20, yMin: null, yMax: null });
        workspace.setSelection(['value'], 'group');
        workspace.setFilters({
            columnRanges: { value: { from: 1, to: 9 } },
            adaptiveLines: [{ id: 'a', column: 'value', x1: 0, y1: 1, x2: 10, y2: 2, keepAbove: true }],
        });
        setRollingEnabled(true);
        setRollingWindow(25);
        setAnomalyEnabled(true);
        setAnomalyMethod('mad');
        setAnomalyThreshold(2.5);

        initProvenance(workspace);
        toggleProvenance();

        const panel = document.getElementById('provenance-panel');
        expect(panel?.hidden).toBe(false);
        expect(panel?.textContent).toContain('Analysis context');
        expect(panel?.textContent).toContain('1,234');
        expect(panel?.textContent).toContain('Selected Series (1)');
        expect(panel?.textContent).toContain('group');
        expect(panel?.textContent).toContain('Rolling mean (window 25)');
        expect(panel?.textContent).toContain('Anomaly detection (mad, σ=2.5)');
    });

    it('refreshes an open panel from WorkspaceStore changes', () => {
        const workspace = createWorkspaceStore();
        initProvenance(workspace);
        toggleProvenance();
        workspace.setFilters({ columnRanges: { value: { from: 1, to: 9 } }, adaptiveLines: [] });

        expect(document.getElementById('provenance-panel')?.textContent).toContain('value1.00 → 9.00');
    });

    it('supports removing series, clearing context, and closing with Escape', () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['temperature', 'pressure']);
        workspace.setViewport({ xMin: 1, xMax: 2, yMin: null, yMax: null });
        initProvenance(workspace);
        toggleProvenance();

        document.querySelector<HTMLButtonElement>('[data-remove-series="temperature"]')?.click();
        expect(workspace.getSnapshot().selection.columns).toEqual(['pressure']);

        document.querySelector<HTMLButtonElement>('[data-clear-context]')?.click();
        expect(workspace.getSnapshot().selection.columns).toEqual([]);
        expect(workspace.getSnapshot().viewport).toBeNull();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.getElementById('provenance-panel')?.hidden).toBe(true);
    });
});
