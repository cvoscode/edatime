/**
 * Canonical, serializable preprocessing plan types.
 *
 * A plan is anchored to an immutable backend dataset version.  Page controls
 * may create stages, but never own the execution semantics themselves.
 */

export type CleaningStageKind = 'timeRange' | 'columnRange' | 'adaptiveLine' | 'missingValue' | 'deduplicate' | 'annotation';
export type StageExecutionClass = 'polarsExpression' | 'annotation';
export type StageScope = 'row' | 'annotation';
export type SourcePage = 'timeseries' | 'scatter' | 'correlation' | 'fft' | 'spectrogram' | 'causal' | 'drift' | 'manual' | 'import';

export interface CleaningDatasetIdentity {
    sourceVersionId: string;
    datasetRevision: number;
    datasetFingerprint: string | null;
    schemaFingerprint: string;
    timeColumn: string;
    sourceName?: string | null;
}

export interface CleaningPlan {
    schemaVersion: 1;
    id: string;
    planRevision: number;
    sourceVersionId: string;
    datasetRevision: number;
    datasetFingerprint: string | null;
    schemaFingerprint: string;
    timeColumn: string;
    sourceName?: string | null;
    stages: CleaningStage[];
    createdAt: string;
    updatedAt: string;
}

export interface CleaningStageBase {
    id: string;
    kind: CleaningStageKind;
    executionClass: StageExecutionClass;
    scope: StageScope;
    enabled: boolean;
    sourcePage: SourcePage;
    label: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
}

export interface TimeRangeStage extends CleaningStageBase {
    kind: 'timeRange';
    executionClass: 'polarsExpression';
    scope: 'row';
    startMs: number;
    endMs: number;
    mode: 'keepInside' | 'dropInside';
}

export interface ColumnRangeStage extends CleaningStageBase {
    kind: 'columnRange';
    executionClass: 'polarsExpression';
    scope: 'row';
    column: string;
    from: number;
    to: number;
    mode: 'keepInside' | 'dropInside';
}

export interface AdaptiveLineStage extends CleaningStageBase {
    kind: 'adaptiveLine';
    executionClass: 'polarsExpression';
    scope: 'row';
    column: string;
    x1Ms: number;
    y1: number;
    x2Ms: number;
    y2: number;
    keepAbove: boolean;
    applyWithinSegmentOnly: boolean;
}

/** Row-membership policy for a single numeric column's null/non-finite values. */
export interface MissingValueStage extends CleaningStageBase {
    kind: 'missingValue';
    executionClass: 'polarsExpression';
    scope: 'row';
    column: string;
    dropNulls: boolean;
    dropNonFinite: boolean;
}

/** Stable duplicate resolution over an explicit, ordered key-column subset. */
export interface DeduplicateStage extends CleaningStageBase {
    kind: 'deduplicate';
    executionClass: 'polarsExpression';
    scope: 'row';
    columns: string[];
    keep: 'first' | 'last';
}

export interface AnnotationStage extends CleaningStageBase {
    kind: 'annotation';
    executionClass: 'annotation';
    scope: 'annotation';
    severity?: 'info' | 'warning' | 'critical';
}

export type CleaningStage = TimeRangeStage | ColumnRangeStage | AdaptiveLineStage | MissingValueStage | DeduplicateStage | AnnotationStage;

export type CleaningStageInput = Omit<TimeRangeStage, 'id' | 'createdAt' | 'updatedAt'>
    | Omit<ColumnRangeStage, 'id' | 'createdAt' | 'updatedAt'>
    | Omit<AdaptiveLineStage, 'id' | 'createdAt' | 'updatedAt'>
    | Omit<MissingValueStage, 'id' | 'createdAt' | 'updatedAt'>
    | Omit<DeduplicateStage, 'id' | 'createdAt' | 'updatedAt'>
    | Omit<AnnotationStage, 'id' | 'createdAt' | 'updatedAt'>;

export interface PlanRequestSnapshot {
    plan: CleaningPlan;
    expectedPlanHash: string;
    expectedSourceVersionId: string;
    expectedDatasetRevision: number;
}
