import { describe, expect, it } from 'vitest';

import { createTimeseriesPlanFilterSync } from './planFilterSync.js';
import { createCleaningPlanStore } from '../../cleaning/store.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';

describe('Timeseries plan filter sync', () => {
    it('restores plan-backed Signals ranges and removes them when their stages are removed', () => {
        const workspace = createWorkspaceStore();
        workspace.setFilters({ columnRanges: { external: { from: 2, to: 3 } }, adaptiveLines: [] });
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({
            sourceVersionId: 'source-1', datasetRevision: 1, datasetFingerprint: 'frame',
            schemaFingerprint: 'schema', timeColumn: 'ts',
        });
        const range = planStore.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Keep HUFL in selected range', column: 'HUFL',
            from: 0.8, to: 0.2, mode: 'keepInside',
        });
        const sync = createTimeseriesPlanFilterSync(workspace);

        sync(planStore.getSnapshot());
        expect(workspace.getSnapshot().filters.columnRanges).toEqual({
            external: { from: 2, to: 3 }, HUFL: { from: 0.2, to: 0.8 },
        });

        planStore.removeStage(range.id);
        sync(planStore.getSnapshot());
        expect(workspace.getSnapshot().filters.columnRanges).toEqual({ external: { from: 2, to: 3 } });
    });
});
