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
                return Err(edatime_core::error::AppError::bad_request(
                    "Materialization job cancelled before collection",
                ));
            }
            let data = state.query_executor.execute_async(frame).await?;
            if job.is_cancelled() {
                return Err(edatime_core::error::AppError::bad_request(
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
mod tests {
    use super::*;
    use crate::handlers::routes::cleaning_handoff::sha256_hex;
    use crate::handlers::routes::cleaning_preview::preview_warnings;
    use axum::extract::State;
    use edatime_core::config::AppConfig;
    use edatime_query::cleaning::{
        CleaningStageBaseDto, CleaningStageDto, FillNullDirection, RangeMode,
        ResampleAggregationDto, ResampleAggregationMethod, TimeRangeMode,
    };
    use polars::prelude::{DataFrame, NamedFrom, ParquetReader, SerReader, Series, TimeUnit};
    use std::fs;
    use std::io::{Cursor, Read};

    fn state() -> AppState {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("ts".into(), vec![1_i64, 2, 3]).into(),
                Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
            ],
        )
        .expect("frame");
        AppState::new(df, AppConfig::default())
    }

    fn ordered_state() -> AppState {
        use polars::prelude::DataType;
        let timestamps = Series::new(
            "ts".into(),
            [1_704_067_200_000_i64, 1_704_069_000_000, 1_704_070_800_000],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("datetime series");
        let df = DataFrame::new(
            3,
            vec![
                timestamps.into(),
                Series::new("value".into(), [Some(10.0_f64), None, Some(30.0)]).into(),
            ],
        )
        .expect("ordered frame");
        AppState::new(df, AppConfig::default())
    }

    fn ordered_time_sort() -> CleaningStageDto {
        CleaningStageDto::Sort {
            base: base("sort-time"),
            columns: vec!["ts".to_string()],
            descending: false,
            nulls_last: true,
        }
    }

    fn base(id: &str) -> CleaningStageBaseDto {
        CleaningStageBaseDto {
            id: id.to_string(),
            enabled: true,
            execution_class: "polarsExpression".to_string(),
            scope: "row".to_string(),
            source_page: "timeseries".to_string(),
            label: id.to_string(),
            note: None,
            created_at: "now".to_string(),
            updated_at: "now".to_string(),
        }
    }

    fn envelope(state: &AppState) -> PlanRequestEnvelope {
        let version = state.current_dataset_version().expect("version");
        PlanRequestEnvelope {
            expected_plan_hash: None,
            expected_source_version_id: version.id.clone(),
            expected_dataset_revision: version.revision,
            plan: CleaningPlanDto {
                schema_version: 1,
                id: "plan".to_string(),
                plan_revision: 1,
                source_version_id: version.id,
                dataset_revision: version.revision,
                dataset_fingerprint: Some(version.dataset_fingerprint),
                schema_fingerprint: version.schema_fingerprint,
                time_column: "ts".to_string(),
                source_name: None,
                stages: vec![CleaningStageDto::ColumnRange {
                    base: base("range"),
                    column: "value".to_string(),
                    from: 2.0,
                    to: 3.0,
                    mode: RangeMode::KeepInside,
                    retain_nulls: false,
                }],
                created_at: "now".to_string(),
                updated_at: "now".to_string(),
            },
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn preview_preserves_full_plan_ordering_for_fill_and_resample_impacts() {
        let fill_state = ordered_state();
        let mut fill_request = envelope(&fill_state);
        fill_request.plan.stages = vec![
            ordered_time_sort(),
            CleaningStageDto::FillNull {
                base: base("fill-forward"),
                columns: vec!["value".to_string()],
                strategy: FillNullDirection::Forward,
                limit: None,
            },
        ];
        let fill = preview(State(fill_state.clone()), Json(fill_request.clone()))
            .await
            .expect("sort followed by forward fill should preview")
            .0;
        assert_eq!(fill.rows_before, 3);
        assert_eq!(fill.rows_after, 3);
        assert_eq!(fill.stage_impacts.len(), 2);
        assert_eq!(fill.stage_impacts[0].stage_id, "sort-time");
        assert_eq!(fill.stage_impacts[1].stage_id, "fill-forward");
        assert_eq!(fill.stage_impacts[1].rows_before, 3);
        assert_eq!(fill.stage_impacts[1].rows_after, 3);
        let filled_value = fill.examples.working[1]
            .values
            .get("value")
            .expect("filled example value")
            .parse::<f64>()
            .expect("numeric filled value");
        assert_eq!(filled_value, 10.0);

        let resample_state = ordered_state();
        let mut resample_request = envelope(&resample_state);
        resample_request.plan.stages = vec![
            ordered_time_sort(),
            CleaningStageDto::Resample {
                base: base("hourly"),
                every: "1h".to_string(),
                aggregations: vec![ResampleAggregationDto {
                    column: "value".to_string(),
                    method: ResampleAggregationMethod::Mean,
                }],
            },
        ];
        let resampled = preview(State(resample_state.clone()), Json(resample_request))
            .await
            .expect("sort followed by resample should preview")
            .0;
        assert_eq!(resampled.rows_before, 3);
        assert_eq!(resampled.rows_after, 2);
        assert_eq!(resampled.stage_impacts[0].rows_after, 3);
        assert_eq!(resampled.stage_impacts[1].rows_before, 3);
        assert_eq!(resampled.stage_impacts[1].rows_after, 2);

        fill_request.plan.stages.swap(0, 1);
        assert!(
            preview(State(fill_state), Json(fill_request))
                .await
                .is_err()
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn preview_counts_only_stages_that_can_change_row_membership() {
        let state = ordered_state();
        let mut request = envelope(&state);
        request.plan.stages = vec![
            ordered_time_sort(),
            CleaningStageDto::FillNull {
                base: base("fill-forward"),
                columns: vec!["value".to_string()],
                strategy: FillNullDirection::Forward,
                limit: None,
            },
            CleaningStageDto::ColumnRange {
                base: base("value-range"),
                column: "value".to_string(),
                from: 0.0,
                to: 40.0,
                mode: RangeMode::KeepInside,
                retain_nulls: true,
            },
        ];

        let response = preview(State(state.clone()), Json(request))
            .await
            .expect("row-preserving stages preview")
            .0;
        assert_eq!(response.stage_impacts.len(), 3);
        assert!(response.stage_impacts.iter().all(|impact| {
            impact.rows_before == 3 && impact.rows_after == 3 && impact.rows_removed == 0
        }));
        let queries = state.metrics.snapshot(0, 0).cpu_admission.by_stage["query"].completed;
        assert_eq!(
            queries, 3,
            "source count and the two bounded example queries"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn preview_and_export_use_the_requested_immutable_baseline() {
        let state = state();
        let response = preview(State(state.clone()), Json(envelope(&state)))
            .await
            .expect("preview")
            .0;
        assert_eq!(response.rows_before, 3);
        assert_eq!(response.rows_after, 3);
        assert_eq!(response.stage_impacts.len(), 1);
        assert_eq!(response.stage_impacts[0].stage_id, "range");
        assert!(response.stage_impacts[0].executed);
        assert_eq!(response.stage_impacts[0].rows_before, 3);
        assert_eq!(response.stage_impacts[0].rows_after, 3);
        assert_eq!(response.stage_impacts[0].rows_removed, 0);

        let export = export_data(
            State(state.clone()),
            Json(CleaningDataExportRequest {
                context: envelope(&state),
                format: "parquet".to_string(),
                output_columns: None,
            }),
        )
        .await
        .expect("export");
        assert_eq!(
            export
                .headers()
                .get("x-edatime-source-version")
                .expect("source version"),
            "source-0"
        );
        assert!(export.headers().get("x-edatime-plan-hash").is_some());
        assert!(
            export
                .headers()
                .get("x-edatime-schema-fingerprint")
                .is_some()
        );
        let advertised_size = export
            .headers()
            .get(header::CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<usize>().ok())
            .expect("content length");
        let body = axum::body::to_bytes(export.into_body(), usize::MAX)
            .await
            .expect("streamed export body");
        assert_eq!(body.len(), advertised_size);
        let data = ParquetReader::new(std::io::Cursor::new(body))
            .finish()
            .expect("streamed parquet");
        assert_eq!(data.height(), 3);
        assert_eq!(
            data.column("value")
                .expect("value")
                .f64()
                .expect("f64")
                .into_iter()
                .collect::<Vec<_>>(),
            vec![None, Some(2.0), Some(3.0)]
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn outlier_proposal_returns_plan_aware_non_destructive_bounds() {
        let state = state();
        let response = propose_outliers(
            State(state.clone()),
            Json(OutlierProposalRequest {
                context: envelope(&state),
                columns: vec!["value".to_string()],
                method: "zscore".to_string(),
                threshold: 1.0,
            }),
        )
        .await
        .expect("proposal")
        .0;
        assert_eq!(response.source_version.id, "source-0");
        assert_eq!(response.method, "zscore");
        assert_eq!(response.ranges.len(), 1);
        assert_eq!(response.ranges[0].column, "value");
        assert!(response.ranges[0].retain_nulls);
        // The fixture's canonical plan already keeps value in [2, 3], so
        // the proposal proves it measures the working frame, not raw data.
        assert!((response.ranges[0].from - 2.0).abs() < 0.001);
        assert!((response.ranges[0].to - 3.0).abs() < 0.001);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stale_source_identity_is_rejected_before_execution() {
        let state = state();
        let mut request = envelope(&state);
        request.expected_source_version_id = "missing".to_string();
        let error = validate(State(state), Json(request))
            .await
            .expect_err("stale source");
        assert_eq!(error.code, crate::error::ErrorCode::StalePlan);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn apply_creates_a_child_without_losing_the_requested_baseline() {
        let state = state();
        let root = state.current_dataset_version().expect("root");
        let response = apply(State(state.clone()), Json(envelope(&state)))
            .await
            .expect("apply");
        assert_eq!(
            response
                .headers()
                .get("x-edatime-source-version")
                .and_then(|value| value.to_str().ok()),
            Some("source-1")
        );
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body");
        let response: serde_json::Value = serde_json::from_slice(&body).expect("response JSON");
        let job_id = response["jobId"].as_str().expect("materialization job id");
        assert_eq!(
            state.jobs.record(job_id).expect("job record").status,
            edatime_store::jobs::JobStatus::Completed
        );
        assert_eq!(
            response["sourceVersion"]["parentId"].as_str(),
            Some(root.id.as_str())
        );
        assert_eq!(
            state
                .dataset_snapshot_for_version(&root.id)
                .expect("root")
                .collect()
                .expect("collect")
                .height(),
            3
        );
        assert_eq!(
            state
                .dataset_snapshot()
                .collect()
                .expect("working")
                .height(),
            3
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn configured_apply_streams_to_a_scan_backed_child_artifact() {
        let artifact_dir = std::env::temp_dir().join(format!(
            "edatime-cleaning-lazy-apply-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(artifact_dir.clone());
        let df = DataFrame::new(
            3,
            vec![
                Series::new("ts".into(), vec![1_i64, 2, 3]).into(),
                Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
            ],
        )
        .expect("frame");
        let state = AppState::new(df, config);

        let response = apply(State(state.clone()), Json(envelope(&state)))
            .await
            .expect("streaming apply");

        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let child = state.current_dataset_version().expect("child");
        assert!(child.id.starts_with("artifact-"));
        assert!(child.dataset_fingerprint.starts_with("fnv1a-parquet-"));
        assert_eq!(state.dataset_rows().await, 3);
        assert_eq!(
            state
                .query_executor
                .execute_async(state.dataset_snapshot())
                .await
                .expect("scan child")
                .height(),
            3
        );
        let catalog = state
            .artifact_store
            .as_ref()
            .expect("artifact store")
            .load_catalog()
            .expect("catalog");
        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].version_id, child.id);
        assert!(
            !artifact_dir
                .join(format!("{}.parquet.tmp", child.id))
                .exists()
        );
        fs::remove_dir_all(artifact_dir).expect("clean artifact directory");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn plan_export_carries_the_same_immutable_identity_as_execution() {
        let state = state();
        let export = export_plan(State(state.clone()), Json(envelope(&state)))
            .await
            .expect("export");
        assert_eq!(
            export.headers().get(header::CONTENT_TYPE).expect("type"),
            "application/json; charset=utf-8"
        );
        let body = axum::body::to_bytes(export.into_body(), usize::MAX)
            .await
            .expect("body");
        let artifact: serde_json::Value = serde_json::from_slice(&body).expect("json");
        assert_eq!(artifact["sourceVersion"]["id"], "source-0");
        assert!(artifact["planHash"].as_str().is_some());
        assert_eq!(artifact["plan"]["sourceVersionId"], "source-0");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn code_export_is_backend_validated_and_source_bound() {
        let state = state();
        let export = export_code(
            State(state.clone()),
            Json(CleaningCodeExportRequest {
                context: envelope(&state),
                language: CleaningCodeLanguage::Python,
            }),
        )
        .await
        .expect("export");
        assert_eq!(
            export.headers().get(header::CONTENT_TYPE).expect("type"),
            "text/x-python; charset=utf-8"
        );
        assert_eq!(
            export
                .headers()
                .get("x-edatime-source-version")
                .expect("source"),
            "source-0"
        );
        let body = axum::body::to_bytes(export.into_body(), usize::MAX)
            .await
            .expect("body");
        let code = String::from_utf8(body.to_vec()).expect("utf8");
        assert!(code.contains("EdaTime backend-generated canonical plan artifact"));
        assert!(code.contains("pl.col(\"value\")"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn code_export_supports_chronological_split_labels() {
        let state = state();
        let mut context = envelope(&state);
        context.plan.stages = vec![CleaningStageDto::ChronologicalSplit {
            base: base("split"),
            train_end_ms: 1.0,
            validation_end_ms: 2.0,
            embargo_ms: 0.0,
            output_column: "split".to_string(),
        }];
        let export = export_code(
            State(state),
            Json(CleaningCodeExportRequest {
                context,
                language: CleaningCodeLanguage::Python,
            }),
        )
        .await
        .expect("export");
        let body = axum::body::to_bytes(export.into_body(), usize::MAX)
            .await
            .expect("body");
        let code = String::from_utf8(body.to_vec()).expect("utf8");
        assert!(code.contains("unassigned"));
        assert!(code.contains("validation"));
        assert!(code.contains("cast(pl.Int64)"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn handoff_manifest_uses_the_plans_selected_time_column() {
        let temporal = |name: &str, values: Vec<i64>| {
            Series::new(name.into(), values)
                .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
                .expect("temporal fixture")
                .into()
        };
        let frame = DataFrame::new(
            3,
            vec![
                temporal("ts", vec![0, 1000, 2000]),
                temporal("event_time", vec![100_000, 101_000, 102_000]),
                Series::new("value".into(), [1.0_f64, 2.0, 3.0]).into(),
            ],
        )
        .expect("two time columns");
        let state = AppState::new(frame, AppConfig::default());
        let mut context = envelope(&state);
        context.plan.time_column = "event_time".to_string();
        context.plan.stages.clear();
        let response = export_manifest(State(state), Json(context))
            .await
            .expect("manifest");
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body");
        let manifest: serde_json::Value = serde_json::from_slice(&body).expect("manifest JSON");
        for summary in ["before", "after"] {
            assert_eq!(manifest[summary]["timeRange"]["min"], 100_000, "{summary}");
            assert_eq!(manifest[summary]["timeRange"]["max"], 102_000, "{summary}");
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn resident_materialization_preserves_the_plans_selected_time_column() {
        let state = state();
        let temporal = |name: &str, values: Vec<i64>| {
            Series::new(name.into(), values)
                .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
                .expect("temporal fixture")
                .into()
        };
        let frame = DataFrame::new(
            3,
            vec![
                temporal("ts", vec![0, 1000, 2000]),
                temporal("event_time", vec![100_000, 101_000, 102_000]),
                Series::new("value".into(), [1.0_f64, 2.0, 3.0]).into(),
            ],
        )
        .expect("two time columns");
        state
            .replace_dataset_with_time_column(frame, Some("ts".to_string()))
            .await
            .expect("source publication");
        let mut context = envelope(&state);
        let root_id = context.plan.source_version_id.clone();
        context.plan.time_column = "event_time".to_string();
        context.plan.stages = vec![CleaningStageDto::ColumnSelect {
            base: base("keep-selected-time"),
            columns: vec!["event_time".to_string(), "value".to_string()],
            mode: edatime_query::cleaning::ColumnSelectMode::Keep,
        }];
        apply(State(state.clone()), Json(context))
            .await
            .expect("materialize plan");
        let child = state.current_dataset_version().expect("child source");
        assert_eq!(child.time_column.as_deref(), Some("event_time"));
        assert_eq!(
            state.time_column_display_name_sync().as_deref(),
            Some("event_time")
        );
        let metadata = crate::handlers::routes::metadata::get_metadata(State(state.clone()))
            .await
            .expect("prepared source metadata")
            .0;
        assert_eq!(metadata.time_column.as_deref(), Some("event_time"));
        assert_eq!(metadata.time_range.expect("selected bounds").min, 100_000);
        state
            .select_dataset_version(&root_id)
            .await
            .expect("restore root");
        state
            .select_dataset_version(&child.id)
            .await
            .expect("restore child");
        assert_eq!(
            state
                .ts_context(&state.dataset_snapshot())
                .expect("child time context")
                .ts_col,
            "event_time"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn code_export_supports_canonical_derived_columns() {
        let state = state();
        let mut context = envelope(&state);
        context.plan.stages = vec![CleaningStageDto::DerivedColumn {
            base: base("derived"),
            expression: "sqrt(value) + 1".to_string(),
            output_column: "score".to_string(),
        }];
        let export = export_code(
            State(state),
            Json(CleaningCodeExportRequest {
                context,
                language: CleaningCodeLanguage::Python,
            }),
        )
        .await
        .expect("export");
        let body = axum::body::to_bytes(export.into_body(), usize::MAX)
            .await
            .expect("body");
        let code = String::from_utf8(body.to_vec()).expect("utf8");
        assert!(code.contains("pl.col(\"value\")"));
        assert!(code.contains("alias(\"score\")"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn drawn_line_filters_export_as_code_and_in_reproducibility_bundles() {
        let state = state();
        let mut context = envelope(&state);
        context.plan.stages.push(CleaningStageDto::AdaptiveLine {
            base: base("line"),
            column: "value".to_string(),
            x1_ms: 3.0,
            y1: 2.0,
            x2_ms: 1.0,
            y2: 0.0,
            keep_above: true,
            apply_within_segment_only: true,
        });
        for language in [CleaningCodeLanguage::Python, CleaningCodeLanguage::Rust] {
            let response = export_code(
                State(state.clone()),
                Json(CleaningCodeExportRequest {
                    context: context.clone(),
                    language,
                }),
            )
            .await
            .expect("drawn filter code export");
            let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .expect("code body");
            let code = String::from_utf8(body.to_vec()).expect("code text");
            assert!(code.contains("with_columns"));
            assert!(code.contains("otherwise"));
            assert!(code.contains("alias(\"value\")"));
        }
        let response = export_bundle(State(state), Json(context))
            .await
            .expect("drawn filter bundle");
        assert_eq!(response.status(), axum::http::StatusCode::OK);
    }

    #[test]
    fn exported_time_windows_use_the_source_time_units() {
        let state = state();
        let mut context = envelope(&state);
        context.plan.stages = vec![CleaningStageDto::TimeRange {
            base: base("window"),
            start_ms: 86_400_000.0,
            end_ms: 172_800_000.0,
            mode: TimeRangeMode::KeepInside,
        }];
        let version = state.current_dataset_version().expect("version");
        for (dtype, lower, upper) in [
            (DataType::Date, 1_i64, 2_i64),
            (
                DataType::Datetime(TimeUnit::Microseconds, None),
                86_400_000_000,
                172_800_000_000,
            ),
            (
                DataType::Datetime(TimeUnit::Nanoseconds, None),
                86_400_000_000_000,
                172_800_000_000_000,
            ),
        ] {
            let python =
                generate_python_polars(&context.plan, &version, "hash", &dtype).expect("python");
            let rust = generate_rust_polars(&context.plan, &version, "hash", &dtype).expect("rust");
            assert!(python.contains(&format!("cast(pl.Int64) >= {lower}")));
            assert!(python.contains(&format!("cast(pl.Int64) <= {upper}")));
            assert!(rust.contains(&format!("gt_eq(lit({lower}_i64))")));
            assert!(rust.contains(&format!("lt_eq(lit({upper}_i64))")));
        }
    }

    #[test]
    fn codegen_split_uses_native_date_boundaries() {
        let state = state();
        let mut context = envelope(&state);
        context.plan.stages = vec![CleaningStageDto::ChronologicalSplit {
            base: base("split"),
            train_end_ms: 86_400_000.0,
            validation_end_ms: 172_800_000.0,
            embargo_ms: 0.0,
            output_column: "split".to_string(),
        }];
        let version = state.current_dataset_version().expect("version");
        let python = generate_python_polars(&context.plan, &version, "hash", &DataType::Date)
            .expect("python code");
        let rust = generate_rust_polars(&context.plan, &version, "hash", &DataType::Date)
            .expect("rust code");
        assert!(python.contains("cast(pl.Int64) <= 1"));
        assert!(python.contains("cast(pl.Int64) <= 2"));
        assert!(rust.contains("cast(DataType::Int64).lt_eq(lit(1))"));
        assert!(rust.contains("cast(DataType::Int64).lt_eq(lit(2))"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn handoff_manifest_binds_exact_before_after_and_checksums() {
        let state = state();
        let export = export_manifest(State(state.clone()), Json(envelope(&state)))
            .await
            .expect("manifest");
        let body = axum::body::to_bytes(export.into_body(), usize::MAX)
            .await
            .expect("body");
        let manifest: serde_json::Value = serde_json::from_slice(&body).expect("json");
        assert_eq!(manifest["sourceVersion"]["id"], "source-0");
        assert_eq!(manifest["rootSourceVersion"]["id"], "source-0");
        assert_eq!(manifest["before"]["rows"], 3);
        assert_eq!(manifest["after"]["rows"], 3);
        assert_eq!(manifest["after"]["columns"], 2);
        assert_eq!(
            manifest["executionProvenance"]["application"],
            "edatime-service"
        );
        assert_eq!(
            manifest["executionProvenance"]["planSchemaVersion"],
            manifest["canonicalPlan"]["schemaVersion"]
        );
        assert_eq!(
            manifest["executionProvenance"]["executionMode"],
            "exact-plan-v1"
        );
        assert_eq!(
            manifest["artifactChecksums"]["canonicalPlan"],
            manifest["planHash"]
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn handoff_bundle_contains_verified_canonical_artifacts() {
        let state = state();
        let export = export_bundle(State(state.clone()), Json(envelope(&state)))
            .await
            .expect("bundle");
        assert_eq!(
            export
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("application/zip")
        );
        let body = axum::body::to_bytes(export.into_body(), usize::MAX)
            .await
            .expect("body");
        let mut archive = zip::ZipArchive::new(Cursor::new(body.to_vec())).expect("zip archive");
        let names = (0..archive.len())
            .map(|index| {
                archive
                    .by_index(index)
                    .expect("archive entry")
                    .name()
                    .to_string()
            })
            .collect::<Vec<_>>();
        assert_eq!(
            names,
            vec![
                "handoff-manifest.json",
                "canonical-plan.json",
                "apply_edatime_plan.py",
                "apply_edatime_plan.rs",
                "checksums.json",
            ]
        );
        let mut checksums = String::new();
        archive
            .by_name("checksums.json")
            .expect("checksums entry")
            .read_to_string(&mut checksums)
            .expect("checksums text");
        let checksums: serde_json::Value =
            serde_json::from_str(&checksums).expect("checksums json");
        assert_eq!(checksums["algorithm"], "sha256");
        let mut canonical_plan = Vec::new();
        archive
            .by_name("canonical-plan.json")
            .expect("plan entry")
            .read_to_end(&mut canonical_plan)
            .expect("plan bytes");
        assert_eq!(
            checksums["artifacts"]["canonical-plan.json"],
            sha256_hex(&canonical_plan)
        );
    }

    #[test]
    fn preview_warns_when_resampling_precedes_a_chronological_split() {
        let mut request = envelope(&state());
        request.plan.stages = vec![
            CleaningStageDto::Resample {
                base: base("resample"),
                every: "1s".to_string(),
                aggregations: vec![edatime_query::cleaning::ResampleAggregationDto {
                    column: "value".to_string(),
                    method: edatime_query::cleaning::ResampleAggregationMethod::Mean,
                }],
            },
            CleaningStageDto::ChronologicalSplit {
                base: base("split"),
                train_end_ms: 1.0,
                validation_end_ms: 2.0,
                embargo_ms: 0.0,
                output_column: "split".to_string(),
            },
        ];
        assert!(preview_warnings(&request.plan)[0].contains("resample"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn selecting_a_retained_root_restores_its_full_working_frame() {
        let state = state();
        let root = state.current_dataset_version().expect("root");
        let _ = apply(State(state.clone()), Json(envelope(&state)))
            .await
            .expect("apply");
        let selected = select_version(
            State(state.clone()),
            Json(DatasetVersionSelectRequest {
                version_id: root.id.clone(),
            }),
        )
        .await
        .expect("select")
        .0;
        assert_eq!(selected.id, root.id);
        assert_eq!(
            state
                .dataset_snapshot()
                .collect()
                .expect("working")
                .height(),
            3
        );
        assert_eq!(
            state.current_dataset_version().expect("current").id,
            root.id
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn applied_plan_history_returns_saved_plan_and_marks_legacy_gaps() {
        use polars::prelude::{DataFrame, NamedFrom, Series};

        let state = state();
        let root = state.current_dataset_version().expect("source version");
        let plan = serde_json::json!({
            "schemaVersion": 1,
            "id": "saved-plan",
            "sourceVersionId": root.id,
            "datasetRevision": root.revision,
            "datasetFingerprint": root.dataset_fingerprint,
            "schemaFingerprint": root.schema_fingerprint,
            "timeColumn": "ts",
            "stages": []
        });
        let child = state
            .materialize_dataset_child(
                &root.id,
                DataFrame::new(1, vec![Series::new("value".into(), [2.0_f64]).into()])
                    .expect("prepared frame"),
                "saved-hash".to_string(),
                Some("ts".to_string()),
                Some(plan.clone()),
            )
            .await
            .expect("materialize prepared version");
        let saved = get_applied_plan_history(State(state.clone()), Path(child.id.clone()))
            .await
            .expect("read applied plan")
            .0;
        assert_eq!(saved.history_status, "available");
        assert_eq!(saved.applied_plan, Some(plan));

        let legacy = state
            .materialize_dataset_child(
                &child.id,
                DataFrame::new(1, vec![Series::new("value".into(), [3.0_f64]).into()])
                    .expect("legacy frame"),
                "legacy-hash".to_string(),
                Some("ts".to_string()),
                None,
            )
            .await
            .expect("materialize legacy version");
        let missing = get_applied_plan_history(State(state), Path(legacy.id))
            .await
            .expect("read legacy plan status")
            .0;
        assert_eq!(missing.history_status, "missing");
        assert_eq!(missing.applied_plan, None);
    }
}
