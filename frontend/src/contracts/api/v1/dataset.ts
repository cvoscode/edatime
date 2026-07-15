/** JSON DTOs published by dataset metadata endpoints. */
export interface ColumnMetadata {
    name: string;
    dtype: string;
}

export interface TimeRange {
    min: number;
    max: number;
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
    total_rows: number;
    columns: ColumnMetadata[];
    numeric_columns: string[];
    time_column: string | null;
    time_range: TimeRange | null;
    column_profiles: ColumnProfile[];
}
