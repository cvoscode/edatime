/** Dataset and transport DTOs shared across frontend features. */

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
    total_rows: number;
    columns: ColumnMetadata[];
    numeric_columns: string[];
    time_column: string | null;
    time_range: TimeRange | null;
    column_profiles: ColumnProfile[];
}

export interface DataFetchMeta {
    downsampled: boolean;
    downsampleKnown: boolean;
    returnedRows: number;
    targetPoints: number;
}

export interface FetchedWindow {
    start: number;
    end: number;
}

export interface SummaryStats {
    mean: number;
    std: number;
    min: number;
    max: number;
}

export interface DataObject {
    ts: Float64Array;
    values: Record<string, Float64Array>;
    color: (number | string | null)[] | null;
    color_column: string | null;
    _meta: DataFetchMeta;
}

export interface AnomalyRegionData {
    column: string;
    method: string;
    start_ms: number;
    end_ms: number;
    score: number;
}

export interface AnomalyResponse {
    method: string;
    threshold: number;
    regions: AnomalyRegionData[];
    summary_stats?: SummaryStats | null;
}

export interface TransformResponse {
    status: string;
    column: string;
    expression: string;
}
