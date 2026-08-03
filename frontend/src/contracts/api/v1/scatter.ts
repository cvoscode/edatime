/** JSON DTOs shared by Scatter and correlation endpoints. */
export const CORRELATION_METRICS = [
    'pearson_raw',
    'spearman_raw',
    'kendall_raw',
    'pearson_diff',
    'spearman_diff',
    'kendall_diff',
] as const;

export type CorrelationMetric = typeof CORRELATION_METRICS[number];

export interface ExecutionIdentity {
    sourceVersionId: string;
    sourceRevision: number;
    schemaFingerprint: string;
    planHash: string;
}

export interface ColorCardinality {
    requested: number;
    used: number;
    bucketed: number;
}

export interface ScatterPointsResponse {
    x: string;
    y: string;
    color: string | null;
    total_points: number;
    returned_points: number;
    points: [number, number][];
    color_values: number[] | null;
    color_labels: (string | null)[] | null;
    color_min: number | null;
    color_max: number | null;
    size_values: number[] | null;
    size_min: number | null;
    size_max: number | null;
    color_cardinality?: ColorCardinality | null;
    executionIdentity?: ExecutionIdentity;
}

export interface ScatterMatrixPair {
    x: string;
    y: string;
}

export interface CorrelationItem {
    column: string;
    count: number;
    value: number | null;
}

export interface CorrelationSuggestion {
    x: string;
    y: string;
    correlation: number;
}

export interface TopPairItem {
    x: string;
    y: string;
    correlation: number;
    count: number;
}

export interface ScatterCorrelationsResponse {
    mode: CorrelationMetric;
    base_column: string;
    threshold: number;
    numeric_columns: string[];
    correlations: CorrelationItem[];
    suggestions: CorrelationSuggestion[];
    top_pairs?: TopPairItem[];
    executionIdentity?: ExecutionIdentity;
}
