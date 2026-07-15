import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initPreparePage } from './index.js';
import { cleaningPlanStore } from '../../cleaning/store.js';

describe('Prepare page', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="open-cleaning-plan-btn"></button><div id="prepare-workspace"></div>';
        cleaningPlanStore.clear();
    });

    afterEach(() => cleaningPlanStore.clear());

    it('renders the canonical graph and opens the shared workbench for editing', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Window', startMs: 1, endMs: 2, mode: 'keepInside',
        });
        const opened = vi.fn();
        document.getElementById('open-cleaning-plan-btn')!.addEventListener('click', opened);
        const dispose = initPreparePage();

        expect(document.querySelector('.pipeline-graph')).not.toBeNull();
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('source-1');
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Open Pipeline Workbench')!.click();
        expect(opened).toHaveBeenCalledTimes(1);

        dispose();
    });

    it('stays source-first until a dataset establishes a plan', () => {
        const dispose = initPreparePage();
        const open = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Open Pipeline Workbench')!;

        expect(open.disabled).toBe(true);
        expect(document.getElementById('prepare-workspace')?.textContent).toContain('Load a dataset');

        dispose();
    });
});
