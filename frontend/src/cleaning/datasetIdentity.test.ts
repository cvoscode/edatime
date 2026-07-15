import { describe, expect, it } from 'vitest';

import type { DatasetMetadata } from '../types/api.js';
import { cleaningDatasetIdentityFromMetadata } from './datasetIdentity.js';

function metadata(overrides: Partial<DatasetMetadata> = {}): DatasetMetadata {
    return {
        total_rows: 3,
        columns: [
            { name: 'ts', dtype: 'Int64' },
            { name: 'value', dtype: 'Float64' },
        ],
        numeric_columns: ['value'],
        time_column: 'ts',
        time_range: { min: 1, max: 3 },
        column_profiles: [],
        source_version_id: 'version-root',
        source_version_revision: 4,
        dataset_fingerprint: 'dataset-fingerprint',
        schema_fingerprint: 'schema-fingerprint',
        ...overrides,
    };
}

describe('cleaningDatasetIdentityFromMetadata', () => {
    it('keeps the immutable source revision when the active session revision has advanced', () => {
        const identity = cleaningDatasetIdentityFromMetadata(metadata(), 12);

        expect(identity.sourceVersionId).toBe('version-root');
        expect(identity.datasetRevision).toBe(4);
    });

    it('falls back to the active revision for older metadata responses', () => {
        const identity = cleaningDatasetIdentityFromMetadata(
            metadata({ source_version_revision: undefined }),
            12,
        );

        expect(identity.datasetRevision).toBe(12);
    });
});
