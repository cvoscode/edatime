import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCurrentDatasetProfile } from './currentProfile.js';
import { startDatasetProfile, fetchDatasetProfile } from '../../services/api/profile.js';
import type { DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';

vi.mock('../../services/api/profile.js', () => ({
    startDatasetProfile: vi.fn(), fetchDatasetProfile: vi.fn(),
}));

const ui = {
    hydrateColumnProfiles: vi.fn(), renderColumnProfilesGrid: vi.fn(), setUploadPreviewStatus: vi.fn(),
};
const response = (status: DatasetProfileResponse['status']): DatasetProfileResponse => ({
    algorithmVersion: 'exact-v1', sourceVersion: { id: 'sample', revision: 1, datasetFingerprint: 'sample' },
    status, job: null, metadata: status === 'ready' ? {
        total_rows: 1, columns: [], numeric_columns: [], time_column: null, time_range: null, column_profiles: [],
    } : null,
});

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    document.body.innerHTML = '<span id="profile-mode-badge" data-mode="dataset"></span>';
});
afterEach(() => vi.useRealTimers());

it('polls a running profile and hydrates its completed metadata', async () => {
    vi.mocked(startDatasetProfile).mockResolvedValue(response('queued'));
    vi.mocked(fetchDatasetProfile).mockResolvedValueOnce(response('running')).mockResolvedValueOnce(response('ready'));
    const work = loadCurrentDatasetProfile(new AbortController().signal, () => true, ui);
    await vi.runAllTimersAsync();
    await work;
    expect(fetchDatasetProfile).toHaveBeenCalledTimes(2);
    expect(ui.hydrateColumnProfiles).toHaveBeenCalledWith(response('ready').metadata);
    expect(ui.setUploadPreviewStatus).not.toHaveBeenCalledWith(expect.stringContaining('did not complete'));
});

it('recovers a not_started response with one idempotent start', async () => {
    vi.mocked(startDatasetProfile).mockResolvedValueOnce(response('not_started')).mockResolvedValueOnce(response('ready'));
    await loadCurrentDatasetProfile(new AbortController().signal, () => true, ui);
    expect(startDatasetProfile).toHaveBeenCalledTimes(2);
    expect(ui.hydrateColumnProfiles).toHaveBeenCalledOnce();
});

it('does not retry a repeatedly missing job forever', async () => {
    vi.mocked(startDatasetProfile).mockResolvedValue(response('not_started'));
    await loadCurrentDatasetProfile(new AbortController().signal, () => true, ui);
    expect(startDatasetProfile).toHaveBeenCalledTimes(2);
    expect(ui.setUploadPreviewStatus).toHaveBeenCalledWith(expect.stringContaining('did not complete'));
});

it('reports the actual job failure without restarting it', async () => {
    vi.mocked(startDatasetProfile).mockResolvedValue({ ...response('failed'), job: {
        id: 'job-1', status: 'failed', progressPercent: 5, message: 'Background queue timed out',
    } });
    await loadCurrentDatasetProfile(new AbortController().signal, () => true, ui);
    expect(startDatasetProfile).toHaveBeenCalledOnce();
    expect(ui.setUploadPreviewStatus).toHaveBeenCalledWith(expect.stringContaining('Background queue timed out'));
});

it('does not overwrite a file preview with a background failure', async () => {
    document.getElementById('profile-mode-badge')!.setAttribute('data-mode', 'preview');
    vi.mocked(startDatasetProfile).mockResolvedValue(response('failed'));
    await loadCurrentDatasetProfile(new AbortController().signal, () => true, ui);
    expect(ui.setUploadPreviewStatus).not.toHaveBeenCalled();
});

it('stops polling when the dataset changes', async () => {
    let current = true;
    vi.mocked(startDatasetProfile).mockResolvedValue(response('running'));
    const work = loadCurrentDatasetProfile(new AbortController().signal, () => current, ui);
    await Promise.resolve();
    current = false;
    await vi.runAllTimersAsync();
    await work;
    expect(fetchDatasetProfile).not.toHaveBeenCalled();
    expect(ui.hydrateColumnProfiles).not.toHaveBeenCalled();
});

it('ignores a completed response after abort', async () => {
    const controller = new AbortController();
    vi.mocked(startDatasetProfile).mockImplementation(async () => {
        controller.abort();
        return response('ready');
    });
    await loadCurrentDatasetProfile(controller.signal, () => true, ui);
    expect(ui.hydrateColumnProfiles).not.toHaveBeenCalled();
    expect(ui.setUploadPreviewStatus).not.toHaveBeenCalled();
});
