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

    it('edits ordered stages and history through the canonical store', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const first = cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'First', startMs: 1, endMs: 2, mode: 'keepInside',
        });
        const second = cleaningPlanStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Second', startMs: 3, endMs: 4, mode: 'keepInside',
        });
        const onPlanChanged = vi.fn();
        const dispose = initPreparePage({ onPlanChanged });

        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Down')!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([second.id, first.id]);
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Disable')!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages[0].enabled).toBe(false);
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Undo')!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages[0].enabled).toBe(true);
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Remove')!.click();
        expect(cleaningPlanStore.getSnapshot()!.stages).toHaveLength(1);
        expect(onPlanChanged).toHaveBeenCalledTimes(4);

        dispose();
    });

    it('creates a valid missing-value policy without leaving Prepare', () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const onPlanChanged = vi.fn();
        const dispose = initPreparePage({ onPlanChanged });
        const form = document.querySelector('form.prepare-workspace__policy-form') as HTMLFormElement;
        (form.elements.namedItem('column') as HTMLInputElement).value = 'value';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(cleaningPlanStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'missingValue', column: 'value', dropNulls: true, dropNonFinite: true,
        }]);
        expect(onPlanChanged).toHaveBeenCalledTimes(1);
        dispose();
    });
});
