import { apiV1Routes } from '../contracts/api/v1/routes.js';
import { deleteJson, getJson, postBlob, postJson } from '../services/api/http.js';
import type { ApiRequestOptions } from '../services/api/http.js';
import { buildPlanRequestSnapshot } from './compiler.js';
import type { CleaningPlan } from './types.js';

export interface DatasetVersionRecord {
    id: string;
    rootId: string;
    parentId: string | null;
    revision: number;
    datasetFingerprint: string;
    schemaFingerprint: string;
    sourceName: string | null;
    materializedFromPlanHash: string | null;
    createdAt: string;
}

export interface ArtifactStorageUsage {
    enabled: boolean;
    artifactCount: number;
    usedBytes: number;
    maxBytes: number | null;
}

export interface CleaningValidationResponse {
    sourceVersion: DatasetVersionRecord;
    datasetRevision: number;
    planHash: string;
    canonicalPlan: CleaningPlan;
}

export interface CleaningPreviewResponse {
    sourceVersion: DatasetVersionRecord;
    datasetRevision: number;
    planHash: string;
    rowsBefore: number;
    rowsAfter: number;
    rowsRemoved: number;
    columnsBefore: number;
    columnsAfter: number;
    stageImpacts: CleaningStageImpact[];
    warnings: string[];
}

/** Exact row-membership change at one saved stage from an explicit preview. */
export interface CleaningStageImpact {
    stageId: string;
    executed: boolean;
    rowsBefore: number;
    rowsAfter: number;
    rowsRemoved: number;
}

export interface CleaningApplyResponse {
    jobId: string;
    sourceVersion: DatasetVersionRecord;
    datasetRevision: number;
    planHash: string;
}

export interface SessionJob {
    id: string;
    kind: 'ingest' | 'profile' | 'materialization' | 'export' | 'analytics';
    status: 'queued' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'expired';
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    progressPercent: number | null;
    message: string | null;
}

export interface CleaningDataExportOptions {
    format?: 'parquet';
    outputColumns?: string[];
}

function envelope(plan: CleaningPlan): Record<string, unknown> {
    const snapshot = buildPlanRequestSnapshot(plan);
    return {
        plan: snapshot.plan,
        expectedPlanHash: snapshot.expectedPlanHash,
        expectedSourceVersionId: snapshot.expectedSourceVersionId,
        expectedDatasetRevision: snapshot.expectedDatasetRevision,
    };
}

export function validateCleaningPlan(
    plan: CleaningPlan,
    options?: ApiRequestOptions,
): Promise<CleaningValidationResponse> {
    return postJson(apiV1Routes.cleaning.validate, envelope(plan), 'Cleaning plan validation', options);
}

export function previewCleaningPlan(
    plan: CleaningPlan,
    options?: ApiRequestOptions,
): Promise<CleaningPreviewResponse> {
    return postJson(apiV1Routes.cleaning.preview, envelope(plan), 'Cleaning plan preview', options);
}

export function applyCleaningPlan(
    plan: CleaningPlan,
    options?: ApiRequestOptions,
): Promise<CleaningApplyResponse> {
    return postJson(apiV1Routes.cleaning.apply, envelope(plan), 'Cleaning plan apply', options);
}

export function exportCleaningData(
    plan: CleaningPlan,
    exportOptions: CleaningDataExportOptions = {},
    options?: ApiRequestOptions,
): Promise<Blob> {
    return postBlob(
        apiV1Routes.cleaning.exportData,
        { ...envelope(plan), format: exportOptions.format ?? 'parquet', outputColumns: exportOptions.outputColumns },
        'Cleaning data export',
        options,
    );
}

export function exportCleaningPlan(
    plan: CleaningPlan,
    options?: ApiRequestOptions,
): Promise<Blob> {
    return postBlob(apiV1Routes.cleaning.exportPlan, envelope(plan), 'Cleaning plan export', options);
}

/** Backend-generated source code from the validated canonical plan. */
export function exportCleaningCode(
    plan: CleaningPlan,
    language: 'python' | 'rust',
    options?: ApiRequestOptions,
): Promise<Blob> {
    return postBlob(
        apiV1Routes.cleaning.exportCode,
        { ...envelope(plan), language },
        'Cleaning code export',
        options,
    );
}

/** Exact before/after audit and provenance manifest for a canonical plan. */
export function exportCleaningManifest(
    plan: CleaningPlan,
    options?: ApiRequestOptions,
): Promise<Blob> {
    return postBlob(
        apiV1Routes.cleaning.exportManifest,
        envelope(plan),
        'Cleaning handoff manifest export',
        options,
    );
}

export function listDatasetVersions(options?: ApiRequestOptions): Promise<DatasetVersionRecord[]> {
    // Versions are dataset-scoped by design: a replacement invalidates this
    // selection list along with all other dataset-derived responses.
    return getJson(apiV1Routes.cleaning.versions, 'Dataset versions', options);
}

export function selectDatasetVersion(
    versionId: string,
    options?: ApiRequestOptions,
): Promise<DatasetVersionRecord> {
    return postJson(apiV1Routes.cleaning.selectVersion, { versionId }, 'Dataset version selection', options);
}

export function getArtifactStorageUsage(options?: ApiRequestOptions): Promise<ArtifactStorageUsage> {
    return getJson(apiV1Routes.cleaning.storage, 'Artifact storage usage', options);
}

/** Recent process-local pipeline work. This is operational state, not history. */
export function listSessionJobs(options?: ApiRequestOptions): Promise<SessionJob[]> {
    return getJson(apiV1Routes.jobs, 'Session jobs', { ...options, datasetScoped: false });
}

export function cancelSessionJob(jobId: string, options?: ApiRequestOptions): Promise<SessionJob> {
    return deleteJson(apiV1Routes.job(jobId), 'Session job cancellation', { ...options, datasetScoped: false });
}
