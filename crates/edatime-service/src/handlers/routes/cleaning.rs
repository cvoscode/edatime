//! Plan-aware validation, preview, and full working-dataset export.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use polars::prelude::DataType;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::cleaning_codegen::{generate_python_polars, generate_rust_polars};
pub use super::cleaning_context::PlanRequestEnvelope;
use super::cleaning_context::{resolve_cleaning_context, validate_envelope};
use super::cleaning_handoff::{build_handoff_bundle, build_handoff_manifest};
pub use super::cleaning_preview::{CleaningPreviewResponse, preview};
use crate::error::AppError;
use crate::handlers::routes::shared::{ExecutionIdentity, add_execution_identity_headers};
use crate::streaming_export::lazy_parquet_response;
use edatime_query::cleaning::{CleaningPlanDto, compile_cleaning_plan};
use edatime_store::artifacts::ArtifactStorageUsage;
use edatime_store::jobs::JobKind;
use edatime_store::state::AppState;
use edatime_store::versions::DatasetVersionRecord;

/// Compatibility tuple for older route helpers. New page routes use the
/// typed context so version, plan hash, and frame stay bound together.
pub(crate) fn compile_request_frame(
    state: &AppState,
    envelope: &PlanRequestEnvelope,
) -> Result<(DatasetVersionRecord, String, polars::prelude::LazyFrame), AppError> {
    let context = resolve_cleaning_context(state, envelope)?;
    Ok((context.version, context.plan_hash, context.frame))
}

/// Exact, plan-aware bounds that can be added as canonical range stages
/// instead of invoking the legacy destructive outlier endpoint.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutlierProposalRequest {
    #[serde(flatten)]
    pub context: PlanRequestEnvelope,
    pub columns: Vec<String>,
    pub method: String,
    pub threshold: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlierRangeProposal {
    pub column: String,
    pub from: f64,
    pub to: f64,
    pub retain_nulls: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlierProposalResponse {
    pub source_version: DatasetVersionRecord,
    pub dataset_revision: u64,
    pub plan_hash: String,
    pub method: String,
    pub threshold: f64,
    pub ranges: Vec<OutlierRangeProposal>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CleaningDataExportRequest {
    #[serde(flatten)]
    pub context: PlanRequestEnvelope,
    #[serde(default = "default_export_format")]
    pub format: String,
    #[serde(default)]
    pub output_columns: Option<Vec<String>>,
}

/// A backend-owned source-code export. The plan envelope is validated and
/// compiled before code is produced, preventing a browser-only plan snapshot
/// from being handed off as executable provenance.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CleaningCodeExportRequest {
    #[serde(flatten)]
    pub context: PlanRequestEnvelope,
    pub language: CleaningCodeLanguage,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CleaningCodeLanguage {
    Python,
    Rust,
}

fn default_export_format() -> String {
    "parquet".to_string()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleaningValidationResponse {
    pub source_version: DatasetVersionRecord,
    pub dataset_revision: u64,
    pub plan_hash: String,
    pub canonical_plan: CleaningPlanDto,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleaningApplyResponse {
    pub job_id: String,
    pub source_version: DatasetVersionRecord,
    pub dataset_revision: u64,
    pub plan_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleaningPlanExportArtifact {
    pub schema_version: u16,
    pub exported_at: DateTime<Utc>,
    pub source_version: DatasetVersionRecord,
    pub dataset_revision: u64,
    pub dataset_fingerprint: String,
    pub schema_fingerprint: String,
    pub plan_hash: String,
    pub plan: CleaningPlanDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DatasetVersionSelectRequest {
    pub version_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedPlanHistoryResponse {
    pub source_version: DatasetVersionRecord,
    pub applied_plan: Option<Value>,
    /// available means the canonical plan snapshot is present; missing
    /// identifies older materialized versions that only retained a hash.
    /// Source versions use none.
    pub history_status: &'static str,
}

pub async fn validate(
    State(state): State<AppState>,
    Json(envelope): Json<PlanRequestEnvelope>,
) -> Result<Json<CleaningValidationResponse>, AppError> {
    let context = resolve_cleaning_context(&state, &envelope)?;
    Ok(Json(CleaningValidationResponse {
        dataset_revision: context.version.revision,
        source_version: context.version,
        plan_hash: context.plan_hash,
        canonical_plan: envelope.plan,
    }))
}

/// Calculate global z-score or IQR outlier bounds over the current canonical
/// working frame. This is intentionally a proposal: it never writes a dataset
/// and lets the client add the returned ranges to its editable plan.
pub async fn propose_outliers(
    State(state): State<AppState>,
    Json(request): Json<OutlierProposalRequest>,
) -> Result<Json<OutlierProposalResponse>, AppError> {
    let method = request.method.trim().to_ascii_lowercase();
    if !matches!(method.as_str(), "zscore" | "iqr") {
        return Err(AppError::bad_request(
            "Outlier proposal method must be zscore or iqr",
        ));
    }
    if !request.threshold.is_finite() || request.threshold <= 0.0 {
        return Err(AppError::bad_request(
            "Outlier proposal threshold must be finite and positive",
        ));
    }
    let columns = request
        .columns
        .iter()
        .map(|column| column.trim())
        .filter(|column| !column.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if columns.is_empty()
        || columns.len()
            != columns
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
    {
        return Err(AppError::bad_request(
            "Outlier proposal requires unique non-empty numeric columns",
        ));
    }
    let context = resolve_cleaning_context(&state, &request.context)?;
    let version = context.version;
    let plan_hash = context.plan_hash;
    let frame = context.frame;
    let schema = frame.clone().collect_schema().map_err(|error| {
        AppError::bad_request(format!(
            "Failed to inspect outlier proposal columns: {error}"
        ))
    })?;
    for column in &columns {
        if !schema.get(column).is_some_and(|dtype| dtype.is_numeric()) {
            return Err(AppError::bad_request(format!(
                "Outlier proposal column '{column}' must be numeric"
            )));
        }
    }
    let mut aggregate_expressions = Vec::with_capacity(columns.len() * 2);
    for (index, column) in columns.iter().enumerate() {
        let values = polars::prelude::col(column).cast(DataType::Float64).filter(
            polars::prelude::col(column)
                .cast(DataType::Float64)
                .is_finite(),
        );
        if method == "iqr" {
            aggregate_expressions.push(
                values
                    .clone()
                    .quantile(
                        polars::prelude::lit(0.25),
                        polars::prelude::QuantileMethod::Linear,
                    )
                    .alias(format!("__{index}_q1")),
            );
            aggregate_expressions.push(
                values
                    .quantile(
                        polars::prelude::lit(0.75),
                        polars::prelude::QuantileMethod::Linear,
                    )
                    .alias(format!("__{index}_q3")),
            );
        } else {
            aggregate_expressions.push(values.clone().mean().alias(format!("__{index}_mean")));
            aggregate_expressions.push(values.std(0).alias(format!("__{index}_std")));
        }
    }
    let aggregates = state
        .query_executor
        .execute_async(frame.select(aggregate_expressions))
        .await
        .map_err(AppError::from)?;
    let mut ranges = Vec::new();
    for (index, column) in columns.into_iter().enumerate() {
        let read = |suffix: &str| {
            aggregates
                .column(&format!("__{index}_{suffix}"))
                .ok()
                .and_then(|value| value.f64().ok())
                .and_then(|value| value.get(0))
                .filter(|value| value.is_finite())
        };
        let bounds = if method == "iqr" {
            match (read("q1"), read("q3")) {
                (Some(q1), Some(q3)) => {
                    let iqr = q3 - q1;
                    Some((q1 - request.threshold * iqr, q3 + request.threshold * iqr))
                }
                _ => None,
            }
        } else {
            read("mean").zip(read("std")).and_then(|(mean, std)| {
                (std >= f64::EPSILON).then_some((
                    mean - request.threshold * std,
                    mean + request.threshold * std,
                ))
            })
        };
        if let Some((from, to)) = bounds {
            ranges.push(OutlierRangeProposal {
                column,
                from,
                to,
                retain_nulls: true,
            });
        }
    }
    Ok(Json(OutlierProposalResponse {
        source_version: version.clone(),
        dataset_revision: version.revision,
        plan_hash,
        method,
        threshold: request.threshold,
        ranges,
    }))
}

pub async fn export_data(
    State(state): State<AppState>,
    Json(request): Json<CleaningDataExportRequest>,
) -> Result<Response, AppError> {
    if request.format != "parquet" {
        return Err(AppError::bad_request(
            "Cleaning data export currently supports format 'parquet' only",
        ));
    }
    let context = resolve_cleaning_context(&state, &request.context)?;
    let version = context.version;
    let plan_hash = context.plan_hash;
    let mut frame = context.frame;
    if let Some(columns) = request.output_columns.as_ref() {
        if columns.is_empty() {
            return Err(AppError::bad_request(
                "Cleaning export outputColumns must not be empty when supplied",
            ));
        }
        frame = frame.select(columns.iter().map(polars::prelude::col).collect::<Vec<_>>());
    }
    let response =
        lazy_parquet_response(&state.query_executor, frame, "edatime_cleaned.parquet").await?;
    Ok(add_execution_identity_headers(
        response,
        &ExecutionIdentity::from_version(version, Some(plan_hash)),
    ))
}

/// Export the backend-validated canonical plan together with the immutable
/// source identity that the data export is bound to.
pub async fn export_plan(
    State(state): State<AppState>,
    Json(envelope): Json<PlanRequestEnvelope>,
) -> Result<Response, AppError> {
    let (version, plan_hash) = validate_envelope(&state, &envelope)?;
    // Compile once here as well: plan export must not claim executability for
    // a stage that only passed envelope identity validation.
    let source = state.dataset_snapshot_for_version(&version.id)?;
    let _ = compile_cleaning_plan(source, &envelope.plan).map_err(AppError::from)?;
    let artifact = CleaningPlanExportArtifact {
        schema_version: 1,
        exported_at: Utc::now(),
        dataset_revision: version.revision,
        dataset_fingerprint: version.dataset_fingerprint.clone(),
        schema_fingerprint: version.schema_fingerprint.clone(),
        source_version: version,
        plan_hash,
        plan: envelope.plan,
    };
    let bytes = serde_json::to_vec_pretty(&artifact).map_err(|error| {
        AppError::internal(format!("Cleaning plan serialization failed: {error}"))
    })?;
    let mut response = Response::new(bytes.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=edatime_cleaning_plan.json"),
    );
    Ok(add_execution_identity_headers(
        response,
        &ExecutionIdentity::from_version(artifact.source_version, Some(artifact.plan_hash)),
    ))
}

/// Export an exact, source-bound reproducibility manifest for the compiled
/// plan. Unlike interactive chart queries this intentionally collects both
/// sides so row/column and quality summaries are audit facts, not estimates.
pub async fn export_manifest(
    State(state): State<AppState>,
    Json(envelope): Json<PlanRequestEnvelope>,
) -> Result<Response, AppError> {
    let (version, plan_hash, manifest) = build_handoff_manifest(&state, &envelope).await?;
    let bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| AppError::internal(format!("Manifest serialization failed: {error}")))?;
    let mut response = Response::new(bytes.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=edatime_handoff_manifest.json"),
    );
    Ok(add_execution_identity_headers(
        response,
        &ExecutionIdentity::from_version(version, Some(plan_hash)),
    ))
}

/// Export a complete, source-bound handoff archive. Every executable artifact
/// is generated after canonical validation, and `checksums.json` records the
/// SHA-256 digest of every other archive member.
pub async fn export_bundle(
    State(state): State<AppState>,
    Json(envelope): Json<PlanRequestEnvelope>,
) -> Result<Response, AppError> {
    let (version, plan_hash, manifest) = build_handoff_manifest(&state, &envelope).await?;
    let source_schema = state
        .dataset_snapshot_for_version(&version.id)?
        .collect_schema()
        .map_err(|error| {
            AppError::bad_request(format!(
                "Failed to inspect bundle code-export time column: {error}"
            ))
        })?;
    let time_dtype = source_schema
        .get(&envelope.plan.time_column)
        .ok_or_else(|| {
            AppError::bad_request(format!(
                "Missing time column '{}' for bundle code export",
                envelope.plan.time_column
            ))
        })?;
    let artifacts = vec![
        (
            "handoff-manifest.json".to_string(),
            serde_json::to_vec_pretty(&manifest).map_err(|error| {
                AppError::internal(format!("Bundle manifest serialization failed: {error}"))
            })?,
        ),
        (
            "canonical-plan.json".to_string(),
            serde_json::to_vec_pretty(&envelope.plan).map_err(|error| {
                AppError::internal(format!("Bundle plan serialization failed: {error}"))
            })?,
        ),
        (
            "apply_edatime_plan.py".to_string(),
            generate_python_polars(&envelope.plan, &version, &plan_hash, time_dtype)?.into_bytes(),
        ),
        (
            "apply_edatime_plan.rs".to_string(),
            generate_rust_polars(&envelope.plan, &version, &plan_hash, time_dtype)?.into_bytes(),
        ),
    ];
    let bytes = build_handoff_bundle(artifacts)?;
    let mut response = Response::new(bytes.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/zip"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=edatime_handoff_bundle.zip"),
    );
    Ok(add_execution_identity_headers(
        response,
        &ExecutionIdentity::from_version(version, Some(plan_hash)),
    ))
}

/// Export v1 Python or Rust application code generated by the same backend
/// that validates and compiles the canonical plan.
pub async fn export_code(
    State(state): State<AppState>,
    Json(request): Json<CleaningCodeExportRequest>,
) -> Result<Response, AppError> {
    let context = resolve_cleaning_context(&state, &request.context)?;
    let version = context.version;
    let plan_hash = context.plan_hash;
    let source_schema = state
        .dataset_snapshot_for_version(&version.id)?
        .collect_schema()
        .map_err(|error| {
            AppError::bad_request(format!(
                "Failed to inspect code-export time column: {error}"
            ))
        })?;
    let time_dtype = source_schema
        .get(&request.context.plan.time_column)
        .ok_or_else(|| {
            AppError::bad_request(format!(
                "Missing time column '{}' for code export",
                request.context.plan.time_column
            ))
        })?;
    let (content, disposition, content_type) = match request.language {
        CleaningCodeLanguage::Python => (
            generate_python_polars(&request.context.plan, &version, &plan_hash, time_dtype)?,
            "attachment; filename=apply_edatime_plan.py",
            "text/x-python; charset=utf-8",
        ),
        CleaningCodeLanguage::Rust => (
            generate_rust_polars(&request.context.plan, &version, &plan_hash, time_dtype)?,
            "attachment; filename=apply_edatime_plan.rs",
            "text/rust; charset=utf-8",
        ),
    };
    let mut response = Response::new(content.into());
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static(disposition),
    );
    Ok(add_execution_identity_headers(
        response,
        &ExecutionIdentity::from_version(version, Some(plan_hash)),
    ))
}

/// Explicitly materialize the compiled plan as a new child source version.
/// Export and preview never call this route, so the immutable baseline stays
/// available until the user deliberately chooses this transition.
pub async fn apply(
    State(state): State<AppState>,
    Json(envelope): Json<PlanRequestEnvelope>,
) -> Result<Response, AppError> {
    let context = resolve_cleaning_context(&state, &envelope)?;
    let version = context.version;
    let plan_hash = context.plan_hash;
    let frame = context.frame;
    let applied_plan =
        Some(serde_json::to_value(&envelope.plan).map_err(|error| {
            AppError::internal(format!("Encode applied cleaning plan: {error}"))
        })?);
    let job = state.jobs.create_with_request_id(
        JobKind::Materialization,
        crate::middleware::current_request_id(),
    );
    if !state.jobs.start(&job) {
        return Err(AppError::internal(
            "Could not start plan materialization job",
        ));
    }
    state.jobs.update_progress(
        &job,
        10,
        Some("materializing canonical cleaning plan".to_string()),
    );
    let result = if state.artifact_store.is_some() {
        state
            .materialize_dataset_child_lazy(
                &version.id,
                frame,
                plan_hash.clone(),
                envelope.plan.time_column.clone(),
                applied_plan.clone(),
                Some(&job),
            )
            .await
    } else {
        async {
            if job.is_cancelled() {
                return Err(edatime_core::error::DomainError::bad_request(
                    "Materialization job cancelled before collection",
                ));
            }
            let data = state.query_executor.execute_async(frame).await?;
            if job.is_cancelled() {
                return Err(edatime_core::error::DomainError::bad_request(
                    "Materialization job cancelled before publication",
                ));
            }
            state
                .materialize_dataset_child(
                    &version.id,
                    data,
                    plan_hash.clone(),
                    Some(envelope.plan.time_column.clone()),
                    applied_plan,
                )
                .await
        }
        .await
    };
    let child = match result {
        Ok(child) => child,
        Err(error) => {
            state.jobs.fail(&job, error.to_string());
            return Err(AppError::from(error));
        }
    };
    state.jobs.complete(&job);
    let response = CleaningApplyResponse {
        job_id: job.id().to_string(),
        dataset_revision: child.revision,
        source_version: child.clone(),
        plan_hash: plan_hash.clone(),
    };
    Ok(add_execution_identity_headers(
        Json(response).into_response(),
        &ExecutionIdentity::from_version(child, Some(plan_hash)),
    ))
}

pub async fn list_versions(
    State(state): State<AppState>,
) -> Result<Json<Vec<DatasetVersionRecord>>, AppError> {
    Ok(Json(state.dataset_versions()?))
}

pub async fn get_applied_plan_history(
    State(state): State<AppState>,
    Path(version_id): Path<String>,
) -> Result<Json<AppliedPlanHistoryResponse>, AppError> {
    let source_version = state.dataset_versions.record(&version_id)?;
    let history_status = match (
        source_version.applied_plan.is_some(),
        source_version.materialized_from_plan_hash.is_some(),
    ) {
        (true, _) => "available",
        (false, true) => "missing",
        (false, false) => "none",
    };
    Ok(Json(AppliedPlanHistoryResponse {
        applied_plan: source_version.applied_plan.clone(),
        source_version,
        history_status,
    }))
}

pub async fn get_storage_usage(
    State(state): State<AppState>,
) -> Result<Json<ArtifactStorageUsage>, AppError> {
    Ok(Json(state.artifact_storage_usage()?))
}

/// Explicitly select a retained version. Preview and export never change the
/// active dataset, so the original remains recoverable by user action.
pub async fn select_version(
    State(state): State<AppState>,
    Json(request): Json<DatasetVersionSelectRequest>,
) -> Result<Json<DatasetVersionRecord>, AppError> {
    let id = request.version_id.trim();
    if id.is_empty() {
        return Err(AppError::bad_request("versionId must not be empty"));
    }
    Ok(Json(state.select_dataset_version(id).await?))
}

#[cfg(test)]
mod tests;
