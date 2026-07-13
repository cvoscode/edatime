/** Scatter query contracts, rendering state, and matrix cache projections. */

import type { CorrelationMetric } from '../utils/correlationModes.js';

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
    color_cardinality?: ColorCardinality | null;
}

export interface ScatterMatrixPair {
    x: string;
    y: string;
}

export interface ScatterMatrixResponse {
    cells: Map<string, MatrixCellData>;
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

export interface ScatterCorrelationsResponse {
    mode: CorrelationMetric;
    base_column: string;
    threshold: number;
    numeric_columns: string[];
    correlations: CorrelationItem[];
    suggestions: CorrelationSuggestion[];
    top_pairs?: TopPairItem[];
}

export interface TopPairItem {
    x: string;
    y: string;
    correlation: number;
    count: number;
}

export interface ScatterPairStats {
    pearsonRaw: number | null;
    spearmanRaw: number | null;
    pearsonDiff: number | null;
    spearmanDiff: number | null;
    count: number | null;
}

export interface ScatterFilterSpec {
    column: string;
    from: number;
    to: number;
}

export interface ScatterLineFilterSpec {
    column: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
}

export interface MatrixCellData {
    totalPoints: number;
    points: [number, number][];
    colorValues: number[] | null;
    colorLabels: unknown[] | null;
}

export interface ScatterFetchOptions {
    start?: number;
    end?: number;
    filters?: ScatterFilterSpec[];
    lineFilters?: ScatterLineFilterSpec[];
}
