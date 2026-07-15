/** Client-side Arrow projections, with API DTOs re-exported from contracts. */

export type {
    ColumnMetadata,
    TimeRange,
    Histogram,
    ColumnProfile,
    DatasetMetadata,
} from '../contracts/api/v1/dataset.js';
export type {
    AnomalyRegion as AnomalyRegionData,
    SummaryStats,
    AnomalyResponse,
    TransformResponse,
} from '../contracts/api/v1/analytics.js';

export interface DataFetchMeta {
    downsampled: boolean;
    downsampleKnown: boolean;
    returnedRows: number;
    targetPoints: number;
    /** Immutable backend provenance for this decoded result, when supplied. */
    executionIdentity?: ExecutionIdentity;
}

/**
 * Backend-issued identity of the immutable dataset snapshot and pipeline that
 * produced a result. It lets the UI keep result provenance alongside decoded
 * Arrow data instead of assuming the currently active dataset did the work.
 */
export interface ExecutionIdentity {
    sourceVersionId: string;
    sourceRevision: number;
    schemaFingerprint: string;
    /** `none` means the unchanged source snapshot. */
    planHash: string;
}

export interface FetchedWindow {
    start: number;
    end: number;
}

/** Decoded Arrow series data. This is not an HTTP JSON DTO. */
export interface DataObject {
    ts: Float64Array;
    values: Record<string, Float64Array>;
    color: (number | string | null)[] | null;
    color_column: string | null;
    _meta: DataFetchMeta;
}
