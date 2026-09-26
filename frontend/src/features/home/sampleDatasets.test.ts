import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    fetchSampleDataset: vi.fn(),
    toast: vi.fn(),
    uploadDataset: vi.fn(),
    readApiError: vi.fn(async (response: Response, label: string) => {
        const status = response.status;
        const text = await response.text().catch(() => '');
        return new Error(`${label} failed (${status}) ${text}`);
    }),
}));

vi.mock('../../services/api/index.js', () => ({
    fetchSampleDataset: mocks.fetchSampleDataset,
    uploadDataset: mocks.uploadDataset,
}));

vi.mock('../../services/api/http.js', () => ({
    readApiError: mocks.readApiError,
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
            <button data-sample-dataset="sinusoidal" type="button">
                <span data-sample-row-count>672 rows</span><span data-sample-column-count>4 columns</span>
            </button>
            <button data-sample-dataset="weather" type="button">
                <span data-sample-row-count>1,008 rows</span><span data-sample-column-count>5 columns</span>
            </button>
        `;
    });

    it('derives generated-card labels and CSV dimensions from the same sample metadata', async () => {
        mocks.uploadDataset.mockResolvedValue({ ok: true, json: async () => ({ rows: 0 }) });
        const { GENERATED_SAMPLE_DATASETS, wireSampleDatasetCards } = await import('./sampleDatasets.js');
        const showPage = vi.fn();
        const cleanup = wireSampleDatasetCards(showPage);
        const generatedContents: string[] = [];

        for (const spec of Object.values(GENERATED_SAMPLE_DATASETS)) {
            const card = document.querySelector<HTMLElement>(`[data-sample-dataset="${spec.id}"]`)!;
            expect(card.querySelector('[data-sample-row-count]')?.textContent)
                .toBe(`${Math.ceil(spec.durationMs / spec.intervalMs).toLocaleString()} rows`);
            expect(card.querySelector('[data-sample-column-count]')?.textContent)
                .toBe(`${spec.columns.length} columns`);

            card.click();
            await vi.waitFor(() => expect(mocks.uploadDataset).toHaveBeenCalledTimes(generatedContents.length + 1));
            const formData = mocks.uploadDataset.mock.calls.at(-1)?.[0] as FormData;
            const file = formData.get('file') as File;
            const csv = await file.text();
            const lines = csv.split('\n');
            expect(lines).toHaveLength(Math.ceil(spec.durationMs / spec.intervalMs) + 1);
            expect(lines[0]?.split(',')).toEqual(spec.columns);
            generatedContents.push(csv);
        }

        const sinusoidalCard = document.querySelector<HTMLElement>('[data-sample-dataset="sinusoidal"]')!;
        sinusoidalCard.click();
        await vi.waitFor(() => expect(mocks.uploadDataset).toHaveBeenCalledTimes(3));
        const repeatedFile = (mocks.uploadDataset.mock.calls.at(-1)?.[0] as FormData).get('file') as File;
        expect(await repeatedFile.text()).toBe(generatedContents[0]);
        expect(showPage).toHaveBeenCalledTimes(3);
        cleanup();
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
