/** JSON DTOs published by dataset metadata endpoints. */
export interface ColumnMetadata {
    name: string;
    dtype: string;
}

export interface TimeRange {
    min: number;
    max: number;
}

/** Source-order and duplicate-timestamp facts from a completed profile. */
export interface TimeQuality {
    non_null_count: number;
    null_count: number;
    unique_timestamp_count: number;
    duplicate_timestamp_count: number;
    is_monotonic_non_decreasing: boolean;
    out_of_order_count: number;
    min_gap_ms?: number | null;
    median_gap_ms?: number | null;
    max_gap_ms?: number | null;
}

export interface Histogram {
    bin_edges: number[];
    counts: number[];
}

export interface ColumnProfile {
    name: string;
    dtype: string;
    count: number;
    non_null_count: number;
    null_count: number;
    /** Exact for `exact-v1`; absent from older server responses. */
    non_finite_count?: number;
    min: number | string | null;
    max: number | string | null;
    mean: number | null;
    median: number | null;
    std: number | null;
    unique: number | null;
    top: string | null;
    freq: number | null;
    histogram: Histogram | null;
}

export interface DatasetMetadata {
    revision?: number;
    source_version_id?: string;
    source_version_revision?: number;
    root_source_version_id?: string;
    parent_source_version_id?: string | null;
    dataset_fingerprint?: string;
    schema_fingerprint?: string;
    source_name?: string | null;
    /** `immediate` contains schema/row/time facts; sampled and exact carry column statistics. */
    profile_status?: 'immediate' | 'sampled' | 'exact';
    /** Row count used for a `sampled` profile. */
    profile_sample_rows?: number;
    total_rows: number;
    columns: ColumnMetadata[];
    numeric_columns: string[];
    time_column: string | null;
    time_range: TimeRange | null;
    /** Absent from immediate metadata because order and duplicates require profiling. */
    time_quality?: TimeQuality | null;
    column_profiles: ColumnProfile[];
}

/** Exact background-profile state for the selected immutable source. */
export interface DatasetProfileResponse {
    algorithmVersion: string;
    sourceVersion: {
        id: string;
        revision: number;
        datasetFingerprint: string;
    };
    status: 'not_started' | 'queued' | 'running' | 'cancelling' | 'cancelled' | 'failed' | 'ready';
    job: {
        id: string;
        status: string;
        progressPercent: number | null;
        message: string | null;
    } | null;
    metadata: DatasetMetadata | null;
}
