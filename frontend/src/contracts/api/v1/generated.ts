/**
 * Generated from contracts/api-v1.json by scripts/generate_api_contract_types.mjs.
 * Do not edit by hand.
 */

export const apiContractVersion = "v1" as const;

export const apiV1Operations = [
    {
        "id": "getHealth",
        "method": "GET",
        "path": "/api/v1/health",
        "request": null,
        "response": "HealthResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getBuild",
        "method": "GET",
        "path": "/api/v1/build",
        "request": null,
        "response": "BuildIdentity",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getContract",
        "method": "GET",
        "path": "/api/v1/contract",
        "request": null,
        "response": "ApiContract",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getCapabilities",
        "method": "GET",
        "path": "/api/v1/capabilities",
        "request": null,
        "response": "Capabilities",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postData",
        "method": "POST",
        "path": "/api/v1/data",
        "request": "DataRequest",
        "response": "ArrowData|JsonData",
        "contentType": "application/vnd.apache.arrow.stream|application/json",
        "planAware": true
    },
    {
        "id": "postCleaningValidate",
        "method": "POST",
        "path": "/api/v1/cleaning/validate",
        "request": "CleaningPlanEnvelope",
        "response": "ValidationResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postCleaningPreview",
        "method": "POST",
        "path": "/api/v1/cleaning/preview",
        "request": "CleaningPreviewRequest",
        "response": "CleaningPreviewResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postCleaningProposeOutliers",
        "method": "POST",
        "path": "/api/v1/cleaning/propose/outliers",
        "request": "OutlierProposalRequest",
        "response": "OutlierProposalResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postCleaningApply",
        "method": "POST",
        "path": "/api/v1/cleaning/apply",
        "request": "CleaningApplyRequest",
        "response": "CleaningApplyResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postCleaningExportData",
        "method": "POST",
        "path": "/api/v1/cleaning/export/data",
        "request": "CleaningExportRequest",
        "response": "File",
        "contentType": "application/octet-stream",
        "planAware": false
    },
    {
        "id": "postCleaningExportPlan",
        "method": "POST",
        "path": "/api/v1/cleaning/export/plan",
        "request": "CleaningExportRequest",
        "response": "File",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postCleaningExportCode",
        "method": "POST",
        "path": "/api/v1/cleaning/export/code",
        "request": "CleaningExportRequest",
        "response": "File",
        "contentType": "text/plain",
        "planAware": false
    },
    {
        "id": "postCleaningExportManifest",
        "method": "POST",
        "path": "/api/v1/cleaning/export/manifest",
        "request": "CleaningExportRequest",
        "response": "File",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postCleaningExportBundle",
        "method": "POST",
        "path": "/api/v1/cleaning/export/bundle",
        "request": "CleaningExportRequest",
        "response": "File",
        "contentType": "application/zip",
        "planAware": false
    },
    {
        "id": "getDatasetsVersions",
        "method": "GET",
        "path": "/api/v1/datasets/versions",
        "request": null,
        "response": "DatasetVersionsResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postDatasetsVersionsSelect",
        "method": "POST",
        "path": "/api/v1/datasets/versions/select",
        "request": "SelectVersionRequest",
        "response": "SelectVersionResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getDatasetsStorage",
        "method": "GET",
        "path": "/api/v1/datasets/storage",
        "request": null,
        "response": "StorageUsageResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getMetadata",
        "method": "GET",
        "path": "/api/v1/metadata",
        "request": null,
        "response": "DatasetMetadata",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getProfile",
        "method": "GET",
        "path": "/api/v1/profile",
        "request": null,
        "response": "ProfileResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postProfile",
        "method": "POST",
        "path": "/api/v1/profile",
        "request": null,
        "response": "ProfileResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getProfileSample",
        "method": "GET",
        "path": "/api/v1/profile/sample",
        "request": null,
        "response": "ProfileResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postProfileSample",
        "method": "POST",
        "path": "/api/v1/profile/sample",
        "request": null,
        "response": "ProfileResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getMetrics",
        "method": "GET",
        "path": "/api/v1/metrics",
        "request": null,
        "response": "MetricsResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getMetricsPrometheus",
        "method": "GET",
        "path": "/api/v1/metrics/prometheus",
        "request": null,
        "response": "PrometheusMetrics",
        "contentType": "text/plain",
        "planAware": false
    },
    {
        "id": "getJobs",
        "method": "GET",
        "path": "/api/v1/jobs",
        "request": null,
        "response": "JobListResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getJobsId}",
        "method": "GET",
        "path": "/api/v1/jobs/{id}",
        "request": null,
        "response": "JobResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "deleteJobsId}",
        "method": "DELETE",
        "path": "/api/v1/jobs/{id}",
        "request": null,
        "response": "JobResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postScatterPoints",
        "method": "POST",
        "path": "/api/v1/scatter/points",
        "request": "ScatterPointsRequest",
        "response": "ScatterPointsResponse|ArrowData",
        "contentType": "application/json|application/vnd.apache.arrow.stream",
        "planAware": true
    },
    {
        "id": "postScatterMatrix",
        "method": "POST",
        "path": "/api/v1/scatter/matrix",
        "request": "ScatterMatrixRequest",
        "response": "ScatterMatrixResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postScatterExportParquet",
        "method": "POST",
        "path": "/api/v1/scatter/export/parquet",
        "request": "ScatterExportRequest",
        "response": "File",
        "contentType": "application/vnd.apache.parquet",
        "planAware": true
    },
    {
        "id": "postScatterCorrelations",
        "method": "POST",
        "path": "/api/v1/scatter/correlations",
        "request": "ScatterCorrelationsRequest",
        "response": "ScatterCorrelationsResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postScatterCorrelationsMatrix",
        "method": "POST",
        "path": "/api/v1/scatter/correlations/matrix",
        "request": "CorrelationMatrixRequest",
        "response": "CorrelationMatrixResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postUpload",
        "method": "POST",
        "path": "/api/v1/upload",
        "request": "MultipartUpload",
        "response": "UploadResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postUploadPreview",
        "method": "POST",
        "path": "/api/v1/upload/preview",
        "request": "MultipartUpload",
        "response": "UploadPreviewResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getSampleName}",
        "method": "GET",
        "path": "/api/v1/sample/{name}",
        "request": null,
        "response": "File",
        "contentType": "text/csv",
        "planAware": false
    },
    {
        "id": "postDatabaseConnect",
        "method": "POST",
        "path": "/api/v1/database/connect",
        "request": "DatabaseConnectRequest",
        "response": "DatabaseStatusResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "deleteDatabaseConnect",
        "method": "DELETE",
        "path": "/api/v1/database/connect",
        "request": null,
        "response": "DatabaseStatusResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getDatabaseStatus",
        "method": "GET",
        "path": "/api/v1/database/status",
        "request": null,
        "response": "DatabaseStatusResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getDatabaseTables",
        "method": "GET",
        "path": "/api/v1/database/tables",
        "request": null,
        "response": "DatabaseTablesResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getDatabaseColumns",
        "method": "GET",
        "path": "/api/v1/database/columns",
        "request": null,
        "response": "DatabaseColumnsResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postDatabaseLoad",
        "method": "POST",
        "path": "/api/v1/database/load",
        "request": "DatabaseLoadRequest",
        "response": "UploadResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getConfigDatabase",
        "method": "GET",
        "path": "/api/v1/config/database",
        "request": null,
        "response": "DatabaseConfigResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "getAggregate",
        "method": "GET",
        "path": "/api/v1/aggregate",
        "request": "AggregateQuery",
        "response": "AggregateResponse",
        "contentType": "application/json",
        "planAware": false
    },
    {
        "id": "postAnalyticsRolling",
        "method": "POST",
        "path": "/api/v1/analytics/rolling",
        "request": "RollingRequest",
        "response": "RollingResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postAnalyticsAnomalies",
        "method": "POST",
        "path": "/api/v1/analytics/anomalies",
        "request": "AnomalyRequest",
        "response": "AnomalyResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postAnalyticsFft",
        "method": "POST",
        "path": "/api/v1/analytics/fft",
        "request": "FftRequest",
        "response": "FftResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postAnalyticsSpectrogram",
        "method": "POST",
        "path": "/api/v1/analytics/spectrogram",
        "request": "SpectrogramRequest",
        "response": "SpectrogramResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postAnalyticsSpectralFilter",
        "method": "POST",
        "path": "/api/v1/analytics/spectral-filter",
        "request": "SpectralFilterRequest",
        "response": "SpectralFilterResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postAnalyticsCausal",
        "method": "POST",
        "path": "/api/v1/analytics/causal",
        "request": "CausalGraphRequest",
        "response": "CausalGraphResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postDriftStats",
        "method": "POST",
        "path": "/api/v1/drift/stats",
        "request": "DriftStatsRequest",
        "response": "DriftStatsResponse",
        "contentType": "application/json",
        "planAware": true
    },
    {
        "id": "postDriftInvestigate",
        "method": "POST",
        "path": "/api/v1/drift/investigate",
        "request": "DriftInvestigateRequest",
        "response": "DriftInvestigateResponse",
        "contentType": "application/json",
        "planAware": true
    }
] as const;

export type ApiV1Operation = typeof apiV1Operations[number];
export type ApiV1OperationId = ApiV1Operation['id'];
export type ApiV1OperationMethod = ApiV1Operation['method'];
