import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPipelineExportControls } from './exportControls.js';
import { createCleaningPlanStore } from './store.js';
import { exportCleaningCode, exportCleaningData } from './api.js';
import { downloadBlob } from '../utils/dom.js';

vi.mock('./api.js', () => ({ exportCleaningData: vi.fn(), exportCleaningPlan: vi.fn(), exportCleaningCode: vi.fn(), exportCleaningBundle: vi.fn() }));
vi.mock('../utils/dom.js', () => ({ downloadBlob: vi.fn() }));

describe('working dataset exports', () => {
    beforeEach(() => { vi.clearAllMocks(); document.body.replaceChildren(); });

    it('exports the current full plan even when controls were created before the last edit', async () => {
        const store = createCleaningPlanStore();
        store.resetForDataset({ sourceVersionId: 'source', datasetRevision: 1, datasetFingerprint: null, schemaFingerprint: 'schema', timeColumn: 'ts' });
        const controls = createPipelineExportControls(() => store.getSnapshot());
        document.body.append(controls);
        store.addStage({ kind: 'derivedColumn', executionClass: 'polarsExpression', scope: 'schema', enabled: true, sourcePage: 'timeseries', label: 'Total', expression: 'a + b', outputColumn: 'total' });
        const data = new Blob(['PAR1']);
        vi.mocked(exportCleaningData).mockResolvedValue(data);
        controls.querySelector('button')!.click();
        await vi.waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(data, 'edatime_prepared.parquet'));
        expect(exportCleaningData).toHaveBeenCalledWith(store.getSnapshot());
        vi.mocked(exportCleaningCode).mockResolvedValue(new Blob(['code']));
        Array.from(controls.querySelectorAll('button')).find((button) => button.textContent === 'Export Python')!.click();
        await vi.waitFor(() => expect(exportCleaningCode).toHaveBeenCalledWith(store.getSnapshot(), 'python'));
    });

    it('reports an export failure and allows a retry without downloading an empty file', async () => {
        const store = createCleaningPlanStore();
        store.resetForDataset({ sourceVersionId: 'source', datasetRevision: 1, datasetFingerprint: null, schemaFingerprint: 'schema', timeColumn: 'ts' });
        const controls = createPipelineExportControls(() => store.getSnapshot());
        document.body.append(controls);
        vi.mocked(exportCleaningData).mockRejectedValue(new Error('Export unavailable'));
        const button = controls.querySelector('button')!;
        button.click();
        await vi.waitFor(() => expect(controls.textContent).toContain('Export unavailable'));
        expect(button.disabled).toBe(false);
        expect(downloadBlob).not.toHaveBeenCalled();
    });
});
