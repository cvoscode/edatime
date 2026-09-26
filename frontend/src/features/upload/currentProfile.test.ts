import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    fetchDatasetProfile,
    fetchSampledDatasetProfile,
    startDatasetProfile,
} from '../../services/api/profile.js';
import type { DatasetMetadata } from '../../types/api.js';
import type { DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';
import { datasetProfiles } from '../../services/profile/datasetProfiles.js';
import { loadCurrentDatasetProfile } from './currentProfile.js';

vi.mock('../../services/api/profile.js', () => ({
    startDatasetProfile: vi.fn(),
    fetchDatasetProfile: vi.fn(),
    fetchSampledDatasetProfile: vi.fn(),
}));

const ui = {
    hydrateColumnProfiles: vi.fn(),
    renderColumnProfilesGrid: vi.fn(),
    setUploadPreviewStatus: vi.fn(),
    applyTimeRangeFromMetadata: vi.fn(),
    setProfileMode: vi.fn(),
};
let sourceSequence = 0;

function makeMetadata(sourceId = `active-${++sourceSequence}`): DatasetMetadata {
    return {
        revision: 3,
        source_version_id: sourceId,
        source_version_revision: 3,
        dataset_fingerprint: `${sourceId}-fingerprint`,
        profile_status: 'immediate',
        total_rows: 10,
        columns: [{ name: 'time', dtype: 'datetime' }, { name: 'value', dtype: 'float64' }],
        numeric_columns: ['value'],
        time_column: 'time',
        time_range: { min: 100, max: 200 },
        column_profiles: [],
    };
}

function response(
    metadata: DatasetMetadata,
    status: DatasetProfileResponse['status'],
    kind: 'exact' | 'sampled' = 'exact',
): DatasetProfileResponse {
    return {
        algorithmVersion: kind === 'exact' ? 'exact-v1' : 'sample-v1',
        sourceVersion: {
            id: String(metadata.source_version_id),
            revision: metadata.source_version_revision ?? metadata.revision ?? 0,
            datasetFingerprint: String(metadata.dataset_fingerprint),
        },
        status,
        job: null,
        metadata: status === 'ready' ? {
            ...metadata,
            profile_status: kind,
            column_profiles: [{ name: 'value', dtype: 'float64', min: 1, max: 9 } as any],
        } : null,
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    document.body.innerHTML = '<span id="profile-mode-badge" data-mode="dataset"></span><button id="upload-profile-build-btn" hidden></button>';
});
afterEach(() => vi.useRealTimers());

describe('loadCurrentDatasetProfile', () => {
    it('reuses a ready source-keyed report without starting profiling', async () => {
        const metadata = makeMetadata();
        const cached = response(metadata, 'ready');
        datasetProfiles.publish(cached);

        await loadCurrentDatasetProfile(new AbortController().signal, () => true, metadata, ui);

        expect(startDatasetProfile).not.toHaveBeenCalled();
        expect(fetchDatasetProfile).not.toHaveBeenCalled();
        expect(ui.hydrateColumnProfiles).toHaveBeenCalledWith(cached.metadata);
        expect(document.getElementById('upload-profile-build-btn')?.hidden).toBe(true);
    });

    it('recovers a sampled server report after an exact report is absent', async () => {
        const metadata = makeMetadata();
        vi.mocked(fetchDatasetProfile).mockResolvedValue(response(metadata, 'not_started'));
        const sampled = response(metadata, 'ready', 'sampled');
        vi.mocked(fetchSampledDatasetProfile).mockResolvedValue(sampled);

        await loadCurrentDatasetProfile(new AbortController().signal, () => true, metadata, ui);

        expect(fetchDatasetProfile).toHaveBeenCalledOnce();
        expect(fetchSampledDatasetProfile).toHaveBeenCalledOnce();
        expect(startDatasetProfile).not.toHaveBeenCalled();
        expect(ui.hydrateColumnProfiles).toHaveBeenCalledWith(sampled.metadata);
        expect(ui.applyTimeRangeFromMetadata).toHaveBeenCalledWith(metadata, false);
    });

    it('offers an explicit build action when neither saved report exists', async () => {
        const metadata = makeMetadata();
        vi.mocked(fetchDatasetProfile).mockResolvedValue(response(metadata, 'not_started'));
        vi.mocked(fetchSampledDatasetProfile).mockResolvedValue(response(metadata, 'not_started', 'sampled'));

        await loadCurrentDatasetProfile(new AbortController().signal, () => true, metadata, ui);

        expect(startDatasetProfile).not.toHaveBeenCalled();
        expect(document.getElementById('upload-profile-build-btn')?.hidden).toBe(false);
        expect(ui.setUploadPreviewStatus).toHaveBeenCalledWith(expect.stringContaining('Build an exact report'));
    });

    it('starts and polls exact profiling only after the explicit build action', async () => {
        const metadata = makeMetadata();
        vi.mocked(startDatasetProfile).mockResolvedValue(response(metadata, 'queued'));
        const completed = response(metadata, 'ready');
        vi.mocked(fetchDatasetProfile).mockResolvedValue(completed);

        const work = loadCurrentDatasetProfile(
            new AbortController().signal,
            () => true,
            metadata,
            ui,
            { buildExact: true },
        );
        await vi.runAllTimersAsync();
        await work;

        expect(startDatasetProfile).toHaveBeenCalledOnce();
        expect(fetchDatasetProfile).toHaveBeenCalledOnce();
        expect(ui.hydrateColumnProfiles).toHaveBeenCalledWith(completed.metadata);
    });

    it('keeps a failed saved report retryable without automatically restarting it', async () => {
        const metadata = makeMetadata();
        vi.mocked(fetchDatasetProfile).mockResolvedValue({
            ...response(metadata, 'failed'),
            job: { id: 'job-1', status: 'failed', progressPercent: 5, message: 'Worker unavailable' },
        });
        vi.mocked(fetchSampledDatasetProfile).mockResolvedValue(response(metadata, 'not_started', 'sampled'));

        await loadCurrentDatasetProfile(new AbortController().signal, () => true, metadata, ui);

        expect(startDatasetProfile).not.toHaveBeenCalled();
        expect(document.getElementById('upload-profile-build-btn')?.hidden).toBe(false);
        expect(ui.setUploadPreviewStatus).toHaveBeenCalledWith(expect.stringContaining('Worker unavailable'));
    });

    it('does not replace an incoming file preview with active-source metadata', async () => {
        document.getElementById('profile-mode-badge')!.setAttribute('data-mode', 'preview');
        const metadata = makeMetadata();

        await loadCurrentDatasetProfile(new AbortController().signal, () => true, metadata, ui);

        expect(fetchDatasetProfile).not.toHaveBeenCalled();
        expect(startDatasetProfile).not.toHaveBeenCalled();
        expect(ui.hydrateColumnProfiles).not.toHaveBeenCalled();
    });

    it('ignores a report from another source revision', async () => {
        const metadata = makeMetadata();
        const wrong = makeMetadata('different-source');
        vi.mocked(fetchDatasetProfile).mockResolvedValue(response(wrong, 'ready'));
        vi.mocked(fetchSampledDatasetProfile).mockResolvedValue(response(metadata, 'not_started', 'sampled'));

        await loadCurrentDatasetProfile(new AbortController().signal, () => true, metadata, ui);

        expect(ui.setUploadPreviewStatus).toHaveBeenCalledWith(expect.stringContaining('No saved column profile'));
        expect(document.getElementById('upload-profile-build-btn')?.hidden).toBe(false);
    });
});
