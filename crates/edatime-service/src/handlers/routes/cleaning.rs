//! Plan-aware validation, preview, and full working-dataset export.

use axum::{
    Json,
    extract::State,
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::handlers::routes::shared::{ExecutionIdentity, add_execution_identity_headers};
use crate::streaming_export::lazy_parquet_response;
use edatime_query::cleaning::{
    CleaningPlanDto, CleaningStageDto, compile_cleaning_plan, semantic_hash,
};
use edatime_store::artifacts::ArtifactStorageUsage;
use edatime_store::jobs::JobKind;
use edatime_store::state::AppState;
use edatime_store::versions::DatasetVersionRecord;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanRequestEnvelope {
    pub plan: CleaningPlanDto,
    pub expected_plan_hash: Option<String>,
    pub expected_source_version_id: String,
    pub expected_dataset_revision: u64,
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
pub struct CleaningPreviewResponse {
    pub source_version: DatasetVersionRecord,
    pub dataset_revision: u64,
    pub plan_hash: String,
    pub rows_before: usize,
    pub rows_after: usize,
    pub rows_removed: usize,
    pub columns_before: usize,
    pub columns_after: usize,
    pub stage_impacts: Vec<CleaningStageImpact>,
    pub warnings: Vec<String>,
}

/// Exact row-membership change at each saved plan stage. These values are
/// calculated only for an explicit preview request; regular chart queries do
/// not pay for the per-stage collections required to produce this audit view.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleaningStageImpact {
    pub stage_id: String,
    pub executed: bool,
    pub rows_before: usize,
    pub rows_after: usize,
    pub rows_removed: usize,
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

fn validate_envelope(
    state: &AppState,
    envelope: &PlanRequestEnvelope,
) -> Result<(DatasetVersionRecord, String), AppError> {
    let version = state
        .dataset_versions
        .record(&envelope.expected_source_version_id)
        .map_err(|_| {
            AppError::stale_plan("Requested cleaning-plan source version is unavailable")
        })?;
    if envelope.plan.source_version_id != version.id
        || envelope.expected_source_version_id != version.id
        || envelope.plan.dataset_revision != version.revision
        || envelope.expected_dataset_revision != version.revision
    {
        return Err(AppError::stale_plan(
            "Cleaning plan baseline no longer matches the requested source version",
        ));
    }
    if envelope.plan.dataset_fingerprint.as_deref() != Some(version.dataset_fingerprint.as_str())
        || envelope.plan.schema_fingerprint != version.schema_fingerprint
    {
        return Err(AppError::stale_plan(
            "Cleaning plan fingerprint no longer matches the requested source version",
        ));
    }
    let hash = semantic_hash(&envelope.plan).map_err(AppError::from)?;
    // A frontend hash is an optimistic scheduling hint. The backend hash is
    // authoritative and deliberately returned instead of being trusted here.
    let _ = &envelope.expected_plan_hash;
    Ok((version, hash))
}

pub(crate) fn compile_request_frame(
    state: &AppState,
    envelope: &PlanRequestEnvelope,
) -> Result<(DatasetVersionRecord, String, polars::prelude::LazyFrame), AppError> {
    let (version, plan_hash) = validate_envelope(state, envelope)?;
    let source = state.dataset_snapshot_for_version(&version.id)?;
    let frame = compile_cleaning_plan(source, &envelope.plan).map_err(AppError::from)?;
    Ok((version, plan_hash, frame))
}

pub async fn validate(
    State(state): State<AppState>,
    Json(envelope): Json<PlanRequestEnvelope>,
) -> Result<Json<CleaningValidationResponse>, AppError> {
    let (version, plan_hash, _frame) = compile_request_frame(&state, &envelope)?;
    Ok(Json(CleaningValidationResponse {
        dataset_revision: version.revision,
        source_version: version,
        plan_hash,
        canonical_plan: envelope.plan,
    }))
}

pub async fn preview(
    State(state): State<AppState>,
    Json(envelope): Json<PlanRequestEnvelope>,
) -> Result<Json<CleaningPreviewResponse>, AppError> {
    let (version, plan_hash, frame) = compile_request_frame(&state, &envelope)?;
    let source = state.dataset_snapshot_for_version(&version.id)?;
    let source_schema = source.clone().collect_schema().map_err(|error| {
        AppError::bad_request(format!("Cleaning source schema unavailable: {error}"))
    })?;
    let rows_before = state
        .query_executor
        .execute_async(source.clone())
        .await
        .map_err(AppError::from)?
        .height();
    let mut stage_frame = source.clone();
    let mut prior_rows = rows_before;
    let mut stage_impacts = Vec::with_capacity(envelope.plan.stages.len());
    for stage in &envelope.plan.stages {
        let executed = stage.enabled() && !matches!(stage, CleaningStageDto::Annotation { .. });
        let rows_after = if executed {
            // Compile exactly one stage at a time over the preceding stage's
            // lazy frame. This preserves saved order and exposes the real
            // marginal effect instead of independently comparing every stage
            // against the raw source.
            let one_stage_plan = CleaningPlanDto {
                stages: vec![stage.clone()],
                ..envelope.plan.clone()
            };
            stage_frame =
                compile_cleaning_plan(stage_frame, &one_stage_plan).map_err(AppError::from)?;
            state
                .query_executor
                .execute_async(stage_frame.clone())
                .await
                .map_err(AppError::from)?
                .height()
        } else {
            prior_rows
        };
        stage_impacts.push(CleaningStageImpact {
            stage_id: stage.id().to_string(),
            executed,
            rows_before: prior_rows,
            rows_after,
            rows_removed: prior_rows.saturating_sub(rows_after),
        });
        prior_rows = rows_after;
    }
    let result = state
        .query_executor
        .execute_async(frame)
        .await
        .map_err(AppError::from)?;
    let rows_after = result.height();
    Ok(Json(CleaningPreviewResponse {
        dataset_revision: version.revision,
        source_version: version,
        plan_hash,
        rows_before,
        rows_after,
        rows_removed: rows_before.saturating_sub(rows_after),
        columns_before: source_schema.len(),
        columns_after: result.width(),
        stage_impacts,
        warnings: Vec::new(),
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
    let (version, plan_hash, mut frame) = compile_request_frame(&state, &request.context)?;
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

/// Explicitly materialize the compiled plan as a new child source version.
/// Export and preview never call this route, so the immutable baseline stays
/// available until the user deliberately chooses this transition.
pub async fn apply(
    State(state): State<AppState>,
    Json(envelope): Json<PlanRequestEnvelope>,
) -> Result<Response, AppError> {
    let (version, plan_hash, frame) = compile_request_frame(&state, &envelope)?;
    let job = state.jobs.create(JobKind::Materialization);
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
            )
            .await
    } else {
        async {
            let data = state
                .query_executor
                .execute_async(frame)
                .await?;
            state
                .materialize_dataset_child(&version.id, data, plan_hash.clone())
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
    use axum::extract::State;
    use edatime_core::config::AppConfig;
    use edatime_query::cleaning::{CleaningStageBaseDto, CleaningStageDto, RangeMode};
    use polars::prelude::{DataFrame, NamedFrom, ParquetReader, SerReader, Series};
    use std::fs;

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
                }],
                created_at: "now".to_string(),
                updated_at: "now".to_string(),
            },
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn preview_and_export_use_the_requested_immutable_baseline() {
        let state = state();
        let response = preview(State(state.clone()), Json(envelope(&state)))
            .await
            .expect("preview")
            .0;
        assert_eq!(response.rows_before, 3);
        assert_eq!(response.rows_after, 2);
        assert_eq!(response.stage_impacts.len(), 1);
        assert_eq!(response.stage_impacts[0].stage_id, "range");
        assert!(response.stage_impacts[0].executed);
        assert_eq!(response.stage_impacts[0].rows_before, 3);
        assert_eq!(response.stage_impacts[0].rows_after, 2);
        assert_eq!(response.stage_impacts[0].rows_removed, 1);

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
        assert_eq!(data.height(), 2);
        assert_eq!(
            data.column("value")
                .expect("value")
                .f64()
                .expect("f64")
                .into_no_null_iter()
                .collect::<Vec<_>>(),
            vec![2.0, 3.0]
        );
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
            2
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
        assert_eq!(state.dataset_rows().await, 2);
        assert_eq!(
            state
                .query_executor
                .execute_async(state.dataset_snapshot())
                .await
                .expect("scan child")
                .height(),
            2
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
}
