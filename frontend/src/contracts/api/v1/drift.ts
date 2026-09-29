/** Source-bound Drift preflight DTOs for the versioned API. */
export interface DriftPreflightColumn {
    column: string;
    referenceValidSamples: number;
    comparisonValidSamples: number;
    comparisonWindows: number;
    windowsBelowMinimum: number;
    averageWindowSamples: number;
    referenceToWindowRatio: number | null;
    decisionReady: boolean;
    warnings: string[];
    suggestions: string[];
}

export interface DriftPreflightResponse {
    sourceVersionId: string;
    sourceRevision: number;
    schemaFingerprint: string;
    planHash: string;
    window: 'hourly' | 'daily' | 'weekly';
    decisionReady: boolean;
    columns: DriftPreflightColumn[];
}
