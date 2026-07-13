import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    removeOutliersMock,
    runTransformMock,
    openMock,
    closeMock,
} = vi.hoisted(() => ({
    removeOutliersMock: vi.fn(),
    runTransformMock: vi.fn(),
    openMock: vi.fn(),
    closeMock: vi.fn(),
}));

vi.mock('./feature.js', () => ({
    createDataMutationFeature: () => ({
        runTransform: runTransformMock,
        removeOutliers: removeOutliersMock,
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
import { initOutlierModal } from './modals.js';

describe('dataMutationModals', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="outlier-open-btn"></button>
            <button id="outlier-apply-btn"></button>
            <select id="outlier-method"></select>
            <input id="outlier-threshold" value="3" />
            <input id="outlier-window" value="0" />
            <div id="outlier-error"></div>
            <div id="outlier-result"></div>
        `;
        removeOutliersMock.mockReset();
        removeOutliersMock.mockResolvedValue({ rows_removed: 1, rows_before: 10, rows_after: 9 });
        openMock.mockClear();
        closeMock.mockClear();
    });

    it('builds the outlier-removal payload from canonical workspace selection', async () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['a', 'b']);
        const refreshDataset = vi.fn().mockResolvedValue(undefined);
        initOutlierModal({ refreshDataset, workspace });

        (document.getElementById('outlier-apply-btn') as HTMLButtonElement).click();
        await Promise.resolve();
        await Promise.resolve();

        expect(removeOutliersMock).toHaveBeenCalledWith({
            columns: ['a', 'b'],
            method: 'zscore',
            threshold: 3,
            window: undefined,
        });
    });
});
