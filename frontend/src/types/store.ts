/** Serializable state primitives shared by workspace and UI stores. */

export interface ProfileRow {
    name: string;
    dtype: string;
    nonNullCount: number;
    nullCount: number;
    min: number | null;
    max: number | null;
    histCounts: number[];
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
