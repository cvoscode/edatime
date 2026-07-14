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
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export plan JSON')!.click();
        await Promise.resolve();
        expect(exportPlanMock).toHaveBeenCalledWith(planStore.getSnapshot());
        expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'edatime_cleaning_plan.json');
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
});
