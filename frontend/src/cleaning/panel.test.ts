import { beforeEach, describe, expect, it, vi } from 'vitest';

const { previewMock, applyMock, exportPlanMock, listVersionsMock, selectVersionMock, storageUsageMock, downloadBlobMock } = vi.hoisted(() => ({
    previewMock: vi.fn(),
    applyMock: vi.fn(),
    exportPlanMock: vi.fn(),
    listVersionsMock: vi.fn(),
    selectVersionMock: vi.fn(),
    storageUsageMock: vi.fn(),
    downloadBlobMock: vi.fn(),
}));

vi.mock('./api.js', () => ({
    previewCleaningPlan: previewMock,
    applyCleaningPlan: applyMock,
    exportCleaningPlan: exportPlanMock,
    listDatasetVersions: listVersionsMock,
    selectDatasetVersion: selectVersionMock,
    getArtifactStorageUsage: storageUsageMock,
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
        storageUsageMock.mockReset();
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

    it('describes row, value, schema, and ordering semantics in the graph legend', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });
        document.getElementById('open-cleaning-plan-btn')!.click();
        expect(document.querySelector('.pipeline-workbench__legend')?.textContent).toContain('alter values or schema');
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
        previewMock.mockResolvedValue({
            rowsBefore: 100, rowsAfter: 61, rowsRemoved: 39,
            columnsBefore: 2, columnsAfter: 2, stageImpacts: [], warnings: [],
        });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Preview')!.click();
        await Promise.resolve();

        expect(previewMock).toHaveBeenCalledWith(planStore.getSnapshot());
        expect(document.querySelector('[data-plan-preview]')?.textContent).toContain('61 of 100 rows remain');
    });

    it('shows an explicit preview\'s marginal row impact beside each stage', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const stage = planStore.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Keep reviewed values', column: 'value', from: 1, to: 9, mode: 'keepInside',
        });
        previewMock.mockResolvedValue({
            rowsBefore: 100, rowsAfter: 61, rowsRemoved: 39,
            columnsBefore: 2, columnsAfter: 2, warnings: [],
            stageImpacts: [{ stageId: stage.id, executed: true, rowsBefore: 100, rowsAfter: 61, rowsRemoved: 39 }],
        });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Preview')!.click();
        await Promise.resolve();
        await Promise.resolve();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Stages')!.click();

        expect(document.querySelector('.cleaning-plan-stage__impact')?.textContent)
            .toContain('61 of 100 rows after this stage · 39 removed.');
    });

    it('describes non-membership stage effects without implying row removal', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const stage = planStore.addStage({ kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'Order time', columns: ['ts'], descending: false, nullsLast: true });
        previewMock.mockResolvedValue({ rowsBefore: 3, rowsAfter: 3, rowsRemoved: 0, columnsBefore: 2, columnsAfter: 2, warnings: [], stageImpacts: [{ stageId: stage.id, executed: true, rowsBefore: 3, rowsAfter: 3, rowsRemoved: 0 }] });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });
        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Preview')!.click();
        await Promise.resolve(); await Promise.resolve();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Stages')!.click();
        expect(document.querySelector('.cleaning-plan-stage__impact')?.textContent).toContain('stable row order changed');
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

    it('shows managed artifact storage usage in the export tab', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        storageUsageMock.mockResolvedValue({ enabled: true, artifactCount: 2, usedBytes: 1_572_864, maxBytes: 10_485_760 });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Refresh storage usage')!.click();
        await Promise.resolve();

        expect(storageUsageMock).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.pipeline-workbench__hint:last-child')?.textContent).toContain('2 retained artifacts · 1.5 MiB used · 10 MiB quota');
    });

    it('imports a saved plan only when it is anchored to the active dataset baseline', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const imported = { ...planStore.getSnapshot()!, id: 'imported-plan', stages: [] };
        const onPlanChanged = vi.fn();
        mountCleaningPlanPanel({ planStore, getViewport: () => null, onPlanChanged });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export')!.click();
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        const file = new File([JSON.stringify(imported)], 'saved-plan.json', { type: 'application/json' });
        Object.defineProperty(input, 'files', { value: [file] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();

        expect(planStore.getSnapshot()!.id).toBe('imported-plan');
        expect(onPlanChanged).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-plan-preview]')?.textContent).toContain('Imported saved-plan.json');
    });

    it('rejects an imported plan with a different baseline without replacing the current plan', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const imported = { ...planStore.getSnapshot()!, sourceVersionId: 'source-other' };
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export')!.click();
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        Object.defineProperty(input, 'files', { value: [new File([JSON.stringify(imported)], 'wrong-source.json')] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();

        expect(planStore.getSnapshot()!.sourceVersionId).toBe('source-1');
        expect(document.querySelector('[data-plan-preview]')?.textContent).toContain('different dataset baseline');
    });

    it('rejects imported ordered null fill without a preceding time sort', async () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const imported = { ...planStore.getSnapshot()!, stages: [{ id: 'fill', kind: 'fillNull', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: 'Fill', createdAt: 'now', updatedAt: 'now', columns: ['value'], strategy: 'forward', limit: null }] };
        mountCleaningPlanPanel({ planStore, getViewport: () => null });
        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export')!.click();
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        Object.defineProperty(input, 'files', { value: [new File([JSON.stringify(imported)], 'unordered-fill.json')] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve(); await Promise.resolve();
        expect(document.querySelector('[data-plan-preview]')?.textContent).toContain('requires an earlier enabled stable sort');
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

    it('creates a valid missing-value policy from the Stages tab', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Stages')!.click();
        const form = document.querySelector('form.pipeline-workbench__add-stage') as HTMLFormElement;
        (form.elements.namedItem('missingValueColumn') as HTMLInputElement).value = 'value';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(planStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'missingValue', column: 'value', dropNulls: true, dropNonFinite: true,
        }]);
    });

    it('requires a time sort before authoring ordered null fill', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });
        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Stages')!.click();
        const form = document.querySelectorAll<HTMLFormElement>('form.pipeline-workbench__add-stage')[4];
        (form.elements.namedItem('fillColumns') as HTMLInputElement).value = 'value';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(planStore.getSnapshot()!.stages).toHaveLength(0);
        expect(document.querySelector('[data-plan-preview]')?.textContent).toContain('stable sort on the time column');
    });

    it('creates and edits an explicit schema column-selection stage', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        mountCleaningPlanPanel({ planStore, getViewport: () => null });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Stages')!.click();
        const form = document.querySelectorAll<HTMLFormElement>('form.pipeline-workbench__add-stage')[2];
        (form.elements.namedItem('columnSelectColumns') as HTMLInputElement).value = 'ts, target';
        (form.elements.namedItem('columnSelectMode') as HTMLSelectElement).value = 'keep';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        const stage = planStore.getSnapshot()!.stages[0];
        expect(stage).toMatchObject({ kind: 'columnSelect', columns: ['ts', 'target'], mode: 'keep', scope: 'schema' });
        Array.from(document.querySelectorAll('.cleaning-plan-stage__summary'))[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const editor = document.querySelector<HTMLFormElement>('form.pipeline-workbench__editor')!;
        (editor.elements.namedItem('mode') as HTMLSelectElement).value = 'drop';
        editor.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(planStore.getSnapshot()!.stages[0]).toMatchObject({ kind: 'columnSelect', mode: 'drop' });
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
