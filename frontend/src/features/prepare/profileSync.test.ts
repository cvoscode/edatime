import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatasetMetadata, DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';
import type { AppliedPlanHistoryResponse } from '../../cleaning/api.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { fetchDatasetProfile, startDatasetProfile } from '../../services/api/profile.js';
import { getJson, postJson } from '../../services/api/http.js';
import { loadCurrentDatasetProfile } from '../upload/currentProfile.js';
import { hydrateColumnProfiles, renderColumnProfilesGrid } from '../upload/profile.js';
import { setUploadPreviewStatus } from '../upload/preview.js';
import { initPreparePage } from './index.js';

vi.mock('../../services/api/http.js', async (importOriginal) => ({
    ...await importOriginal<typeof import('../../services/api/http.js')>(),
    getJson: vi.fn(),
    postJson: vi.fn(),
}));

let sequence = 0;
let source: DatasetProfileResponse['sourceVersion'];
let workspace = createWorkspaceStore();
let dispose = () => {};
const uploadUi = { hydrateColumnProfiles, renderColumnProfilesGrid, setUploadPreviewStatus };

function metadata(): DatasetMetadata {
    return {
        source_version_id: source.id, source_version_revision: source.revision,
        dataset_fingerprint: source.datasetFingerprint, profile_status: 'immediate',
        total_rows: 100, columns: [{ name: 'temperature', dtype: 'Float64' }],
        numeric_columns: ['temperature'], time_column: 'ts', time_range: null, column_profiles: [],
    };
}

function appliedHistory(): AppliedPlanHistoryResponse {
    return {
        sourceVersion: {
            id: source.id, rootId: source.id, parentId: null, revision: source.revision,
            datasetFingerprint: source.datasetFingerprint, schemaFingerprint: 'schema', sourceName: 'ETTm2.csv',
            displayName: null, timeColumn: 'ts', materializedFromPlanHash: null, createdAt: '2026-09-27T00:00:00.000Z',
        },
        appliedPlan: null,
        historyStatus: 'none',
    };
}

function profile(status: DatasetProfileResponse['status'] = 'ready', kind: 'exact' | 'sampled' = 'exact'): DatasetProfileResponse {
    return {
        algorithmVersion: kind === 'exact' ? 'exact-v1' : 'sample-v1', sourceVersion: { ...source }, status, job: null,
        metadata: status === 'ready' ? {
            ...metadata(), profile_status: kind,
            column_profiles: [{
                name: 'temperature', dtype: 'Float64', count: 100, non_null_count: 88, null_count: 12,
                min: -2.5, max: 42.1, mean: 20, median: 19, std: 2, unique: null, top: null, freq: null,
                histogram: { counts: [2, 5, 8], bin_edges: [0, 10, 20, 30] },
            }],
        } : null,
    };
}

function selectSource(): void {
    workspace.commitDataset(workspace.beginDatasetSession(), metadata(), source.revision);
    cleaningPlanStore.resetForDataset({
        sourceVersionId: source.id, datasetRevision: source.revision, datasetFingerprint: source.datasetFingerprint,
        schemaFingerprint: 'schema', timeColumn: 'ts',
    });
}

function expectReady(): void {
    const report = document.getElementById('prepare-profile-findings')!;
    expect(report.querySelector('.profile-grid-rows')?.textContent).toContain('88 (88.0%)');
    expect(report.querySelector('.profile-grid-rows')?.textContent).not.toContain('Pending');
    const button = Array.from(report.querySelectorAll('button')).find((candidate) => candidate.textContent === 'Exact quality report ready');
    expect(button?.disabled).toBe(true);
}

beforeEach(() => {
    vi.resetAllMocks();
    source = { id: `profile-sync-${++sequence}`, revision: 3, datasetFingerprint: `data-${sequence}` };
    workspace = createWorkspaceStore();
    document.body.innerHTML = '<span id="profile-mode-badge" data-mode="dataset"></span><div id="profile-grid"></div><div id="prepare-workspace"></div>';
    selectSource();
    vi.mocked(getJson).mockImplementation(async (_url, label) => label === 'Applied plan history' ? appliedHistory() : profile('not_started'));
});

afterEach(() => {
    dispose();
    dispose = () => {};
    cleaningPlanStore.clear();
    workspace.dispose();
    vi.restoreAllMocks();
});

describe('source profile synchronization', () => {
    it('shows the profile already loaded by Upload without starting or fetching another report', async () => {
        vi.mocked(postJson).mockResolvedValue(profile());
        await startDatasetProfile();
        await loadCurrentDatasetProfile(new AbortController().signal, () => true, metadata(), uploadUi);
        expect(document.querySelector('#profile-grid .profile-grid-rows')?.textContent).toContain('88 (88.0%)');

        dispose = initPreparePage({ workspace });

        expectReady();
        expect(postJson).toHaveBeenCalledOnce();
        expect(getJson).toHaveBeenCalledOnce();
        expect(getJson).toHaveBeenCalledWith(expect.stringContaining('/provenance'), 'Applied plan history', expect.anything());
    });

    it('recovers a completed server report when Preparation opens without a client cache', async () => {
        vi.mocked(getJson).mockImplementation(async (_url, label) => label === 'Applied plan history' ? appliedHistory() : profile());
        dispose = initPreparePage({ workspace });

        await vi.waitFor(expectReady);
        expect(getJson).toHaveBeenCalledTimes(2);
        expect(getJson).toHaveBeenNthCalledWith(1, expect.stringContaining('/provenance'), 'Applied plan history', expect.anything());
        expect(getJson).toHaveBeenNthCalledWith(2, '/api/v1/profile', 'Dataset profile', expect.anything());
        expect(postJson).not.toHaveBeenCalled();
    });

    it('receives background completion while Upload is showing an incoming file preview', async () => {
        let finish!: (result: DatasetProfileResponse) => void;
        vi.mocked(postJson).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        const loading = startDatasetProfile();
        dispose = initPreparePage({ workspace });
        document.getElementById('profile-mode-badge')!.setAttribute('data-mode', 'preview');
        hydrateColumnProfiles({ ...metadata(), columns: [{ name: 'incoming_file', dtype: 'Float64' }] });
        renderColumnProfilesGrid(true);

        finish(profile());
        await loading;

        expectReady();
        expect(document.querySelector('#profile-grid .profile-grid-rows')?.textContent).toContain('incoming_file');
        expect(document.querySelector('#prepare-profile-grid .profile-grid-rows')?.textContent).not.toContain('incoming_file');
    });

    it('follows an existing job to completion without starting it again', async () => {
        let profileCalls = 0;
        vi.mocked(getJson).mockImplementation(async (_url, label) => label === 'Applied plan history'
            ? appliedHistory()
            : profile(profileCalls++ === 0 ? 'running' : 'ready'));
        dispose = initPreparePage({ workspace });

        await vi.waitFor(expectReady, { timeout: 2000 });
        expect(getJson).toHaveBeenCalledTimes(3);
        expect(postJson).not.toHaveBeenCalled();
    });

    it('clears the report on a dataset switch and ignores late responses for the previous source or fingerprint', async () => {
        const previous = profile();
        vi.mocked(postJson).mockResolvedValue(previous);
        await startDatasetProfile();
        dispose = initPreparePage({ workspace });
        expectReady();

        source = { id: 'replacement-source', revision: 4, datasetFingerprint: 'replacement-data' };
        selectSource();
        vi.mocked(postJson).mockResolvedValue(previous);
        await startDatasetProfile();
        vi.mocked(postJson).mockResolvedValue({ ...profile(), sourceVersion: { ...source, datasetFingerprint: 'wrong-data' } });
        await startDatasetProfile();
        expect(document.querySelector('#prepare-profile-grid .profile-grid-rows')?.textContent).toContain('Pending');

        vi.mocked(postJson).mockResolvedValue(profile());
        await startDatasetProfile();
        expectReady();
    });

    it('keeps a ready report when an older pending poll arrives afterwards', async () => {
        let finish!: (result: DatasetProfileResponse) => void;
        vi.mocked(getJson).mockImplementation((url, label) => label === 'Applied plan history'
            ? Promise.resolve(appliedHistory())
            : new Promise((resolve) => { finish = resolve; }));
        dispose = initPreparePage({ workspace });
        const pendingPoll = fetchDatasetProfile();
        vi.mocked(postJson).mockResolvedValue(profile());
        await startDatasetProfile();
        expectReady();

        finish(profile('running'));
        await pendingPoll;
        expect(document.querySelector('.prepare-workspace__quality-progress')).toBeNull();
        expectReady();
    });

    it('does not update a disposed page when a profile completes', async () => {
        dispose = initPreparePage({ workspace });
        dispose();
        vi.mocked(postJson).mockResolvedValue(profile());
        await startDatasetProfile();

        expect(document.querySelector('#prepare-profile-grid .profile-grid-rows')?.textContent).toContain('Pending');
    });

    it('keeps a completed report ready if its cancellation request later fails', async () => {
        vi.mocked(postJson).mockResolvedValue({ ...profile('running'), job: {
            id: 'profile-job', status: 'running', progressPercent: 50, message: null,
        } });
        await startDatasetProfile();
        let fail!: (error: Error) => void;
        const cancelProfile = vi.fn(() => new Promise<void>((_, reject) => { fail = reject; }));
        dispose = initPreparePage({ workspace, cancelProfile });
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Cancel exact quality report')!.click();
        vi.mocked(postJson).mockResolvedValue(profile());
        await startDatasetProfile();
        fail(new Error('Cancellation arrived too late'));
        await Promise.resolve();
        expectReady();
        expect(document.querySelector('.prepare-workspace__quality-error')).toBeNull();
        expect(document.querySelector('.prepare-workspace__quality-progress')).toBeNull();
    });

    it('keeps a report ready when completion arrives during a cancellation request', async () => {
        vi.mocked(postJson).mockResolvedValue({ ...profile('running'), job: {
            id: 'profile-job', status: 'running', progressPercent: 50, message: null,
        } });
        await startDatasetProfile();
        let finishCancellation!: () => void;
        const cancelProfile = vi.fn(() => new Promise<void>((resolve) => { finishCancellation = resolve; }));
        dispose = initPreparePage({ workspace, cancelProfile });
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Cancel exact quality report')!.click();
        expect(cancelProfile).toHaveBeenCalledOnce();

        vi.mocked(postJson).mockResolvedValue(profile());
        await startDatasetProfile();
        finishCancellation();
        await Promise.resolve();

        expectReady();
        expect(document.querySelector('.prepare-workspace__quality-progress')).toBeNull();
    });
});
