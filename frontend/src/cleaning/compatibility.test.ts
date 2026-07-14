import { describe, expect, it } from 'vitest';

import { bindCleaningPlanCompatibility } from './compatibility.js';
import { createCleaningPlanStore } from './store.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';

describe('cleaning compatibility bridge', () => {
    it('derives legacy filter display state from the canonical plan without reverse writes', () => {
        const workspace = createWorkspaceStore();
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({
            sourceVersionId: 'source-1', datasetRevision: 1, datasetFingerprint: 'frame', schemaFingerprint: 'schema', timeColumn: 'ts',
        });
        const dispose = bindCleaningPlanCompatibility(planStore, workspace);

        planStore.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'First', column: 'value', from: 0, to: 10, mode: 'keepInside',
        });
        planStore.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'scatter', label: 'Second', column: 'value', from: 2, to: 8, mode: 'keepInside',
        });

        expect(workspace.getSnapshot().filters.columnRanges).toEqual({ value: { from: 2, to: 8 } });
        workspace.setFilters({ columnRanges: { value: { from: 3, to: 4 } }, adaptiveLines: [] });
        expect(planStore.getSnapshot()!.stages).toHaveLength(2);
        dispose();
    });
});
