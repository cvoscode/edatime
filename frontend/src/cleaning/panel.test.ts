import { beforeEach, describe, expect, it, vi } from 'vitest';

const { previewMock, downloadBlobMock } = vi.hoisted(() => ({
    previewMock: vi.fn(),
    downloadBlobMock: vi.fn(),
}));

vi.mock('./api.js', () => ({ previewCleaningPlan: previewMock }));
vi.mock('../utils/dom.js', () => ({ downloadBlob: downloadBlobMock }));

import { mountCleaningPlanPanel } from './panel.js';
import { createCleaningPlanStore } from './store.js';

describe('cleaning plan panel', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="open-cleaning-plan-btn"></button>';
        previewMock.mockReset();
        downloadBlobMock.mockReset();
    });

    it('turns the visible viewport into a reversible time stage and exports the full plan JSON', () => {
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        const onPlanChanged = vi.fn();
        mountCleaningPlanPanel({ planStore, getViewport: () => ({ xMin: 40, xMax: 10 }), onPlanChanged });

        document.getElementById('open-cleaning-plan-btn')!.click();
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Add visible time range')!.click();
        const plan = planStore.getSnapshot()!;
        expect(plan.stages).toMatchObject([{ kind: 'timeRange', startMs: 10, endMs: 40, mode: 'keepInside' }]);
        expect(onPlanChanged).toHaveBeenCalledTimes(1);

        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Export plan JSON')!.click();
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
});
