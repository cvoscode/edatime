import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setAdaptiveLineFilters, setPendingAdaptivePoint } from '../store/uiState.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';
import { initDrawControls } from './drawControls.js';

describe('draw controls', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="adaptive-clear-btn" type="button"></button>';
        setAdaptiveLineFilters([]);
        setPendingAdaptivePoint(null);
    });

    it('clears adaptive filters from workspace intent', () => {
        const workspace = createWorkspaceStore();
        const filter = { id: 'line-1', column: 'value', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true };
        workspace.setFilters({ columnRanges: {}, adaptiveLines: [filter] });
        setAdaptiveLineFilters([filter]);

        initDrawControls(vi.fn(), workspace);
        (document.getElementById('adaptive-clear-btn') as HTMLButtonElement).click();

        expect(workspace.getSnapshot().filters.adaptiveLines).toEqual([]);
    });
});
