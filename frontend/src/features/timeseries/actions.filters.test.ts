import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initTimeseriesActions } from './actions.js';
import {
    getScatterViewSnapshot,
    setScatterViewSnapshot,
} from '../../store/scatterState.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { emitFeatureEvent } from '../../platform/featureEvents.js';

function buildDom(): void {
    document.body.innerHTML = '';
    (window as any).__edatime = {};
}

describe('initTimeseriesActions clear-all-filters', () => {
    beforeEach(() => {
        buildDom();
        setScatterViewSnapshot('plot', {
            columnRanges: { HUFL: { from: 1, to: 9 } },
            lineFilters: [{ column: 'HUFL', x1: 1, y1: 2, x2: 3, y2: 4, keepAbove: true }],
        });
        setScatterViewSnapshot('matrix', {
            columnRanges: { HULL: { from: 2, to: 8 } },
            lineFilters: [{ column: 'HULL', x1: 5, y1: 6, x2: 7, y2: 8, keepAbove: false }],
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('clears both plot and matrix scatter filter snapshots when the typed clear command fires', async () => {
        const workspace = createWorkspaceStore();
        workspace.setFilters({
            columnRanges: { HUFL: { from: 1, to: 9 } },
            adaptiveLines: [{ id: 'line-1', column: 'HUFL', x1: 1, y1: 2, x2: 3, y2: 4, keepAbove: true }],
        });
        const deps = {
            rebuildColumnToggles: vi.fn(),
            renderColumnProfilesGrid: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            fetchAndRender: vi.fn(async () => { }),
            updateAnalysisZoom: vi.fn(),
            registerCleanup: vi.fn(),
            workspace,
        };

        initTimeseriesActions(deps);
        expect((window as any).__edatime.clearAllFilters).toBeUndefined();
        expect((window as any).__edatime.resetChartRangeToDataset).toBeUndefined();

        emitFeatureEvent('filters:clear', { source: 'test' });
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(getScatterViewSnapshot('plot')).toEqual({
            columnRanges: {},
            lineFilters: [],
        });
        expect(getScatterViewSnapshot('matrix')).toEqual({
            columnRanges: {},
            lineFilters: [],
        });
        expect(workspace.getSnapshot().filters).toEqual({ columnRanges: {}, adaptiveLines: [] });
    });
});
