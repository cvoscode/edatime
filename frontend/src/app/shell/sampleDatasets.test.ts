import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    fetchSampleDataset: vi.fn(),
    toast: vi.fn(),
    uploadDataset: vi.fn(),
}));

vi.mock('../../services/api/index.js', () => ({
    fetchSampleDataset: mocks.fetchSampleDataset,
    uploadDataset: mocks.uploadDataset,
}));

vi.mock('../../utils/toast.js', () => ({
    toast: mocks.toast,
}));

describe('wireSampleDatasetCards', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.toast.mockReturnValue(() => { });
        document.body.innerHTML = `
            <section id="page-home"></section>
            <button data-sample-dataset="ettm2" type="button">Load ETTm2 sample dataset</button>
        `;
    });

    it('uploads the selected sample dataset and opens the timeseries page', async () => {
        mocks.fetchSampleDataset.mockResolvedValue(new Blob(['date,value\n2024-01-01T00:00:00Z,1\n'], { type: 'text/csv' }));
        mocks.uploadDataset.mockResolvedValue({
            ok: true,
            json: async () => ({ rows: 1 }),
        });

        const showPage = vi.fn();
        const refreshDatasetAfterMutation = vi.fn().mockResolvedValue(undefined);
        const { wireSampleDatasetCards } = await import('./sampleDatasets.js');
        wireSampleDatasetCards(showPage, refreshDatasetAfterMutation);

        document.querySelector<HTMLElement>('[data-sample-dataset="ettm2"]')?.click();
        for (let attempt = 0; attempt < 10 && mocks.fetchSampleDataset.mock.calls.length === 0; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        expect(mocks.fetchSampleDataset).toHaveBeenCalledWith('ETTm2.csv');
        expect(mocks.uploadDataset).toHaveBeenCalledTimes(1);
        const formData = mocks.uploadDataset.mock.calls[0]?.[0] as FormData;
        expect(formData.get('file')).toBeInstanceOf(File);
        expect((formData.get('file') as File).name).toBe('ETTm2.csv');
        expect(refreshDatasetAfterMutation).toHaveBeenCalledTimes(1);
        expect(showPage).toHaveBeenCalledWith('timeseries');
    });
});
