/**
 * datasetState — metadata, column profiles, numeric columns, revision.
 *
 * Consumed by dataClient.ts, app.ts, columns.ts, profile.ts, upload.ts.
 */

import type { DatasetMetadata, ProfileRow } from '../types.js';
import { emitStoreEvent } from './events.js';

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
    const previousMetadata = datasetState.metadata;
    const previousNumericCols = datasetState.numericCols;
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
    emitStoreEvent('dataset:metadata', { previous: previousMetadata, next: metadata });
    emitStoreEvent('dataset:numericCols', { previous: previousNumericCols, next: datasetState.numericCols });
}

export function setNumericCols(cols: string[]): void {
    const previous = datasetState.numericCols;
    datasetState.numericCols = [...cols];
    emitStoreEvent('dataset:numericCols', { previous, next: datasetState.numericCols });
}

export function setColumnProfiles(profiles: ProfileRow[]): void {
    const previous = datasetState.columnProfiles;
    datasetState.columnProfiles = profiles.map((profile) => ({ ...profile }));
    emitStoreEvent('dataset:columnProfiles', { previous, next: datasetState.columnProfiles });
}

export function setDatasetRevision(rev: number): void {
    const previous = datasetState.datasetRevision;
    datasetState.datasetRevision = rev;
    emitStoreEvent('dataset:datasetRevision', { previous, next: rev });
}

export function incrementDatasetRevision(): void {
    setDatasetRevision(datasetState.datasetRevision + 1);
}
