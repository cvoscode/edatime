/** Immutable source and preparation identity returned with analysis results. */
export interface ExecutionIdentity {
    sourceVersionId: string;
    sourceRevision: number;
    schemaFingerprint: string;
    /** `none` means the unchanged source snapshot. */
    planHash: string;
}
