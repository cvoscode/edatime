import type { DatasetMetadata } from '../types/api.js';
import type { CleaningDatasetIdentity } from './types.js';

function fnv1a(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function schemaFingerprint(metadata: DatasetMetadata): string {
    const backendFingerprint = String(metadata.schema_fingerprint ?? '').trim();
    if (backendFingerprint) return backendFingerprint;
    const columns = (metadata.columns ?? [])
        .map((column) => `${column.name}:${column.dtype}`)
        .join('|');
    return `schema-fnv1a-${fnv1a(`${metadata.time_column ?? ''}|${columns}`)}`;
}

/**
 * Converts metadata into an explicit plan baseline.  The legacy fallback is
 * only used until every server response supplies a real source version ID.
 */
export function cleaningDatasetIdentityFromMetadata(
    metadata: DatasetMetadata,
    revision: number,
): CleaningDatasetIdentity {
    const sourceVersionId = String(metadata.source_version_id ?? '').trim()
        || `legacy-source-r${Math.max(0, Math.trunc(revision))}`;
    const fingerprint = String(metadata.dataset_fingerprint ?? '').trim() || null;
    return {
        sourceVersionId,
        datasetRevision: Math.max(0, Math.trunc(revision)),
        datasetFingerprint: fingerprint,
        schemaFingerprint: schemaFingerprint(metadata),
        timeColumn: String(metadata.time_column ?? '').trim() || 'ts',
        sourceName: String(metadata.source_name ?? '').trim() || null,
    };
}
