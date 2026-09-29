import type { WorkspaceStore } from '../workspace/workspaceStore.js';
import { announceActiveDataset } from '../ui/datasetAnnouncement.js';
import { markDatasetChanged } from '../ui/freshnessIndicator.js';

/** Announce immutable source switches independently from analysis-result updates. */
export function trackDatasetFreshness(workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>): () => void {
    let lastKey = '';
    const sync = (snapshot: ReturnType<typeof workspace.getSnapshot>) => {
        const metadata = snapshot.dataset.metadata;
        if (!metadata) return;
        const versionId = snapshot.dataset.activeSourceVersionId || metadata.source_version_id || '';
        const versionRevision = metadata.source_version_revision ?? metadata.revision ?? snapshot.dataset.revision;
        const key = JSON.stringify([
            versionId,
            versionRevision,
            metadata.dataset_fingerprint || snapshot.dataset.sourceFingerprint || '',
            metadata.schema_fingerprint || '',
        ]);
        if (key === lastKey) return;
        const change = lastKey ? 'changed' : 'loaded';
        lastKey = key;
        announceActiveDataset(metadata, versionId);
        markDatasetChanged(metadata.display_name?.trim() || metadata.source_name?.trim() || versionId || 'Active dataset', change);
    };
    sync(workspace.getSnapshot());
    return workspace.subscribe(sync);
}
