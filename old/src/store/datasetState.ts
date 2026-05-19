/**
 * datasetState — metadata, column profiles, numeric columns, revision.
 *
 * Consumed by dataClient.ts, app.ts, columns.ts, profile.ts, upload.ts.
 */

import type { DatasetMetadata, ProfileRow } from '../types.js';

export interface DatasetState {
    metadata: DatasetMetadata | null;
    numericCols: string[];
    columnProfiles: ProfileRow[];
    datasetRevision: number;
}

export const datasetState: DatasetState = {
    metadata: null,
    numericCols: [],
    columnProfiles: [],
    datasetRevision: 0,
};

/* ── Mutations ──────────────────────────────────────────── */

export function setMetadata(metadata: DatasetMetadata | null): void {
    datasetState.metadata = metadata;
    // Keep numericCols in sync when metadata changes
    if (metadata) {
        const timeCol = String(metadata.time_column || '').toLowerCase();
        datasetState.numericCols = (metadata.numeric_columns || []).filter(
            (col: string) => col.toLowerCase() !== timeCol,
        );
    } else {
        datasetState.numericCols = [];
    }
}

export function setColumnProfiles(profiles: ProfileRow[]): void {
    datasetState.columnProfiles = profiles;
}

export function setDatasetRevision(rev: number): void {
    datasetState.datasetRevision = rev;
}

export function incrementDatasetRevision(): void {
    datasetState.datasetRevision += 1;
}