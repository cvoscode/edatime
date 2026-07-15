/** Feature-side Scatter state, with wire DTOs re-exported from contracts. */

export type {
    ColorCardinality,
    ScatterPointsResponse,
    ScatterMatrixPair,
    CorrelationItem,
    CorrelationSuggestion,
    ScatterCorrelationsResponse,
    TopPairItem,
} from '../contracts/api/v1/scatter.js';

export interface ScatterMatrixResponse {
    cells: Map<string, MatrixCellData>;
    executionIdentity?: import('../contracts/api/v1/scatter.js').ExecutionIdentity;
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

/** Decoded Arrow matrix cache state. This is not a wire DTO. */
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
