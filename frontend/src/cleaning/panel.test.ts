import { beforeEach, describe, expect, it, vi } from 'vitest';

const { previewMock, applyMock, exportPlanMock, listVersionsMock, selectVersionMock, downloadBlobMock } = vi.hoisted(() => ({
    previewMock: vi.fn(),
    applyMock: vi.fn(),
    exportPlanMock: vi.fn(),
    listVersionsMock: vi.fn(),
    selectVersionMock: vi.fn(),
    downloadBlobMock: vi.fn(),
}));

vi.mock('./api.js', () => ({
    previewCleaningPlan: previewMock,
    applyCleaningPlan: applyMock,
    exportCleaningPlan: exportPlanMock,
    listDatasetVersions: listVersionsMock,
    selectDatasetVersion: selectVersionMock,
}));
vi.mock('../utils/dom.js', () => ({ downloadBlob: downloadBlobMock }));

import { mountCleaningPlanPanel } from './panel.js';
import { createCleaningPlanStore } from './store.js';

describe('cleaning plan panel', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="open-cleaning-plan-btn"></button>';
        previewMock.mockReset();
        applyMock.mockReset();
        exportPlanMock.mockReset();
        listVersionsMock.mockReset();
        selectVersionMock.mockReset();
        downloadBlobMock.mockReset();
    });

    it('turns the visible viewport into a reversible time stage and exports the full plan JSON', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const onPlanChanged = vi.fn();
        mountCleaningPlanPanel({ planStore, getViewport: () => ({ xMin: 40, xMax: 10 }), onPlanChanged });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Add visible time range')!.click();
        const plan = planStore.getSnapshot()!;
        expect(plan.stages).toMatchObject([{ kind: 'timeRange', startMs: 10, endMs: 40, mode: 'keepInside' }]);
        expect(onPlanChanged).toHaveBeenCalledTimes(1);

        exportPlanMock.mockResolvedValue(new Blob(['canonical-plan']));
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export plan JSON')!.click();
        await Promise.resolve();
        expect(exportPlanMock).toHaveBeenCalledWith(planStore.getSnapshot());
        expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'edatime_cleaning_plan.json');
    });

    it('appends each explicit visible-range action instead of rewriting prior pipeline history', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        mountCleaningPlanPanel({ planStore, getViewport: () => ({ xMin: 10, xMax: 40 }) });

        document.getElementById('open-cleaning-plan-btn')!.click();
        const addVisibleRange = () => Array.from(document.querySelectorAll('button'))
            .find((button) => button.textContent === 'Add visible time range')!;
        addVisibleRange().click();
        addVisibleRange().click();

        const stages = planStore.getSnapshot()!.stages;
        expect(stages).toHaveLength(2);
        expect(stages.map((stage) => stage.kind)).toEqual(['timeRange', 'timeRange']);
        expect(stages[0].id).not.toBe(stages[1].id);
    });

    it('previews the current accumulated plan and reports its row impact', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        previewMock.mockResolvedValue({ rowsBefore: 100, rowsAfter: 61, rowsRemoved: 39 });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Preview')!.click();
        await Promise.resolve();

        expect(previewMock).toHaveBeenCalledWith(planStore.getSnapshot());
        expect(document.querySelector('[data-plan-preview]')?.textContent).toContain('61 of 100 rows remain');
    });

    it('only materializes when the user explicitly requests a new dataset version', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const onPlanApplied = vi.fn();
        applyMock.mockResolvedValue({ sourceVersion: { id: 'source-2' } });
        mountCleaningPlanPanel({ planStore, getViewport: () => null, onPlanApplied });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Apply as new dataset')!.click();
        await Promise.resolve();

        expect(applyMock).toHaveBeenCalledWith(planStore.getSnapshot());
        expect(onPlanApplied).toHaveBeenCalledTimes(1);
    });

    it('restores the retained original source through an explicit control', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-2', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        listVersionsMock.mockResolvedValue([{ id: 'source-1', rootId: 'source-1' }, { id: 'source-2', rootId: 'source-1' }]);
        selectVersionMock.mockResolvedValue({ id: 'source-1' });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Use original dataset')!.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(selectVersionMock).toHaveBeenCalledWith('source-1');
    });

    it('renders the current plan as a selectable graph and edits the selected stage through the plan store', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const stage = planStore.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Keep values', column: 'value', from: 1, to: 9, mode: 'keepInside',
        });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        expect(document.querySelector('.pipeline-graph')).not.toBeNull();
        (document.querySelector('[data-stage-id]') as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const form = document.querySelector('form.pipeline-workbench__editor') as HTMLFormElement;
        expect(form).not.toBeNull();
        (form.elements.namedItem('label') as HTMLInputElement).value = 'Keep reviewed values';
        (form.elements.namedItem('from') as HTMLInputElement).value = '2';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(planStore.getSnapshot()!.stages.find((item) => item.id === stage.id)).toMatchObject({
            label: 'Keep reviewed values', from: 2,
        });
    });

    it('exports deterministic graph JSON and SVG from the Export tab', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export graph JSON')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export graph SVG')!.click();

        expect(downloadBlobMock).toHaveBeenNthCalledWith(1, expect.any(Blob), 'edatime_pipeline_graph.json');
        expect(downloadBlobMock).toHaveBeenNthCalledWith(2, expect.any(Blob), 'edatime_pipeline_graph.svg');
    });

    it('supports keyboard-accessible stage reordering from the Stages tab', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const first = planStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'First', startMs: 1, endMs: 2, mode: 'keepInside',
        });
        const second = planStore.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Second', startMs: 3, endMs: 4, mode: 'keepInside',
        });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Stages')!.click();
        const moveDown = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Move down')!;
        moveDown.click();

        expect(planStore.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([second.id, first.id]);
    });

    it('keeps keyboard focus inside the workbench overlay and restores the trigger on close', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        const trigger = document.getElementById('open-cleaning-plan-btn') as HTMLButtonElement;
        trigger.click();
        const close = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Close')!;
        const lastAction = Array.from(document.querySelectorAll('.cleaning-plan-actions button')).at(-1) as HTMLButtonElement;
        lastAction.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        expect(document.activeElement).toBe(close);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.activeElement).toBe(trigger);
        expect(close.isConnected).toBe(true);
    });
});
