import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import type { DatasetMetadata } from '../../types/api.js';
import { createHomeMetadataBootstrap } from './metadataBootstrap.js';

const metadata = {
    revision: 7,
    source_version_id: 'source-home',
    dataset_fingerprint: 'fingerprint-home',
    schema_fingerprint: 'schema-home',
    source_name: 'ETTm2.csv',
    profile_status: 'immediate',
    total_rows: 69_680,
    columns: [{ name: 'ts', dtype: 'datetime' }, { name: 'OT', dtype: 'float64' }],
    numeric_columns: ['OT'],
    time_column: 'ts',
    time_range: { min: 1, max: 2 },
    column_profiles: [],
} as DatasetMetadata;

describe('createHomeMetadataBootstrap', () => {
    it('commits lightweight metadata without requiring chart or profile initialization', async () => {
        const workspace = createWorkspaceStore();
        const fetchMetadata = vi.fn().mockResolvedValue(metadata);
        const bootstrap = createHomeMetadataBootstrap({ workspace, fetchMetadata });

        await expect(bootstrap.ensure()).resolves.toBe('ready');
        expect(fetchMetadata).toHaveBeenCalledOnce();
        expect(workspace.getSnapshot().dataset.metadata).toMatchObject({ source_name: 'ETTm2.csv', total_rows: 69_680 });
        expect(workspace.getSnapshot().dataset.revision).toBe(7);
    });

    it('reuses metadata already present after same-session navigation', async () => {
        const workspace = createWorkspaceStore();
        const session = workspace.beginDatasetSession();
        workspace.commitDataset(session, metadata, metadata.revision ?? 0);
        const fetchMetadata = vi.fn();
        const bootstrap = createHomeMetadataBootstrap({ workspace, fetchMetadata });

        await expect(bootstrap.ensure()).resolves.toBe('ready');
        expect(fetchMetadata).not.toHaveBeenCalled();
    });

    it('fetches again in a new workspace after reload and recovers the same active server source', async () => {
        const firstWorkspace = createWorkspaceStore();
        await createHomeMetadataBootstrap({
            workspace: firstWorkspace,
            fetchMetadata: vi.fn().mockResolvedValue(metadata),
        }).ensure();

        const reloadedWorkspace = createWorkspaceStore();
        const fetchMetadata = vi.fn().mockResolvedValue(metadata);
        await expect(createHomeMetadataBootstrap({ workspace: reloadedWorkspace, fetchMetadata }).ensure()).resolves.toBe('ready');
        expect(fetchMetadata).toHaveBeenCalledOnce();
        expect(reloadedWorkspace.getSnapshot().dataset.metadata?.source_version_id).toBe('source-home');
    });

    it('treats only a structured not-found response as a genuinely empty server', async () => {
        const workspace = createWorkspaceStore();
        const bootstrap = createHomeMetadataBootstrap({
            workspace,
            fetchMetadata: vi.fn().mockRejectedValue(Object.assign(new Error('No current version'), { status: 404, code: 'not_found' })),
        });
        await expect(bootstrap.ensure()).resolves.toBe('empty');
        expect(workspace.getSnapshot().dataset.metadata).toBeNull();
    });

    it('surfaces metadata service failures for the page retry state', async () => {
        const bootstrap = createHomeMetadataBootstrap({
            workspace: createWorkspaceStore(),
            fetchMetadata: vi.fn().mockRejectedValue(Object.assign(new Error('Metadata failed (500)'), { status: 500, code: 'internal' })),
        });
        await expect(bootstrap.ensure()).rejects.toThrow('Metadata failed (500)');
    });
});
