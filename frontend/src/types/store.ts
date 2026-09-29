import type { TimeQuality } from '../contracts/api/v1/dataset.js';

/** Serializable state primitives shared by workspace and UI stores. */

export type ProfileQualityStatus = 'immediate' | 'sampled' | 'exact' | 'unavailable';

export interface ProfileQualityFindings {
    status: ProfileQualityStatus;
    sampleRows: number | null;
    samplingDescription?: string;
    nonFiniteCount: number | null;
    finiteCount: number | null;
    zeroCount: number | null;
    longestZeroRun: number | null;
    longestZeroRunStartMs: number | null;
    longestZeroRunEndMs: number | null;
    distinctCount: number | null;
    isConstant: boolean | null;
    q25: number | null;
    q75: number | null;
    interquartileRange: number | null;
    isTimeColumn: boolean;
    timeQuality: TimeQuality | null;
}

export interface ProfileRow {
    name: string;
    dtype: string;
    nonNullCount: number;
    nullCount: number;
    min: number | null;
    max: number | null;
    histCounts: number[];
    /** True when the row is a schema-only placeholder awaiting profiling. */
    profilePending?: boolean;
    quality?: ProfileQualityFindings;
    [key: string]: unknown;
}

export interface ColumnRange {
    from: number;
    to: number;
}

export interface AdaptiveLineFilter {
    id: string;
    column: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
}

export interface PendingAdaptivePoint {
    column: string;
    x: number;
    y: number;
    x2?: number;
    y2?: number;
}

export interface ProfileGridSort {
    key: string | null;
    dir: 'asc' | 'desc';
}

export interface ProfileColumnDef {
    key: string;
    label: string;
    minWidth: number;
    defaultWidth: number;
    sortable: boolean;
}
