import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    proposeOutliersMock,
    openMock,
    closeMock,
} = vi.hoisted(() => ({
    proposeOutliersMock: vi.fn(),
    openMock: vi.fn(),
    closeMock: vi.fn(),
}));

vi.mock('./feature.js', () => ({
    createDataMutationFeature: () => ({
        proposeOutliers: proposeOutliersMock,
    }),
}));

vi.mock('../../ui/shell/createModalController.js', () => ({
    createModalController: () => ({
        open: openMock,
        close: closeMock,
    }),
}));

vi.mock('../../ui/primitives/Dropdown.js', () => ({
    getDropdownValue: (id: string) => (id === 'outlier-method' ? 'zscore' : ''),
}));

import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { createCleaningPlanStore } from '../../cleaning/store.js';
import { initOutlierModal, initTransformModal } from './modals.js';

describe('dataMutationModals', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="outlier-open-btn"></button>
            <button id="outlier-apply-btn"></button>
            <select id="outlier-method"></select>
            <input id="outlier-threshold" value="3" />
            <div id="outlier-error"></div>
            <div id="outlier-result"></div>
        `;
        proposeOutliersMock.mockReset();
        proposeOutliersMock.mockResolvedValue({
            method: 'zscore',
            ranges: [{ column: 'a', from: -2, to: 2, retainNulls: true }],
        });
        openMock.mockClear();
        closeMock.mockClear();
    });

    it('adds a plan-aware, non-destructive outlier proposal from canonical workspace selection', async () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['a', 'b']);
        const refreshDataset = vi.fn().mockResolvedValue(undefined);
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({
            sourceVersionId: 'source-0', datasetRevision: 0, datasetFingerprint: 'frame', schemaFingerprint: 'schema', timeColumn: 'ts',
        });
        const onPlanChanged = vi.fn();
        initOutlierModal({ refreshDataset, workspace, planStore, onPlanChanged });

        (document.getElementById('outlier-apply-btn') as HTMLButtonElement).click();
        await Promise.resolve();
        await Promise.resolve();

        expect(proposeOutliersMock).toHaveBeenCalledWith(expect.objectContaining({ sourceVersionId: 'source-0' }), {
            columns: ['a', 'b'],
            method: 'zscore',
            threshold: 3,
        });
        expect(planStore.getSnapshot()?.stages).toMatchObject([{
            kind: 'columnRange', column: 'a', from: -2, to: 2, mode: 'keepInside', retainNulls: true,
        }]);
        expect(onPlanChanged).toHaveBeenCalledOnce();
        expect(refreshDataset).not.toHaveBeenCalled();
    });

    it('adds a derived-column stage instead of invoking the destructive transform endpoint', async () => {
        document.body.innerHTML = `
            <button id="transform-apply-btn"></button>
            <input id="transform-expression" value="sqrt(value) + 1" />
            <input id="transform-output-name" value="score" />
            <div id="transform-error"></div>
        `;
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({
            sourceVersionId: 'source-0', datasetRevision: 0, datasetFingerprint: 'frame', schemaFingerprint: 'schema', timeColumn: 'ts',
        });
        const refreshDataset = vi.fn().mockResolvedValue(undefined);
        const onPlanChanged = vi.fn();
        initTransformModal({ refreshDataset, planStore, onPlanChanged });

        (document.getElementById('transform-apply-btn') as HTMLButtonElement).click();

        expect(planStore.getSnapshot()?.stages).toMatchObject([{
            kind: 'derivedColumn', expression: 'sqrt(value) + 1', outputColumn: 'score', scope: 'schema',
        }]);
        expect(onPlanChanged).toHaveBeenCalledOnce();
        expect(refreshDataset).not.toHaveBeenCalled();
    });
});
