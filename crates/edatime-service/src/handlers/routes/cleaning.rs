//! Plan-aware validation, preview, and full working-dataset export.

use axum::{
    Json,
    extract::State,
    http::{HeaderValue, header},
    response::Response,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use edatime_query::arrow_export::dataframe_to_parquet;
use edatime_query::cleaning::{CleaningPlanDto, compile_cleaning_plan, semantic_hash};
use edatime_store::state::AppState;
use edatime_store::versions::DatasetVersionRecord;

#[derive(Debug, Clone, Deserialize)]
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
    pub warnings: Vec<String>,
}

fn validate_envelope(state: &AppState, envelope: &PlanRequestEnvelope) -> Result<(DatasetVersionRecord, String), AppError> {
    let version = state
        .dataset_versions
        .record(&envelope.expected_source_version_id)
        .map_err(|_| AppError::stale_plan("Requested cleaning-plan source version is unavailable"))?;
    if envelope.plan.source_version_id != version.id
        || envelope.expected_source_version_id != version.id
        || envelope.plan.dataset_revision != version.revision
        || envelope.expected_dataset_revision != version.revision
    {
        return Err(AppError::stale_plan("Cleaning plan baseline no longer matches the requested source version"));
    }
    if envelope.plan.dataset_fingerprint.as_deref() != Some(version.dataset_fingerprint.as_str())
        || envelope.plan.schema_fingerprint != version.schema_fingerprint
    {
        return Err(AppError::stale_plan("Cleaning plan fingerprint no longer matches the requested source version"));
    }
    let hash = semantic_hash(&envelope.plan).map_err(AppError::from)?;
    // A frontend hash is an optimistic scheduling hint. The backend hash is
    // authoritative and deliberately returned instead of being trusted here.
    let _ = &envelope.expected_plan_hash;
    Ok((version, hash))
}

fn compile_request_frame(state: &AppState, envelope: &PlanRequestEnvelope) -> Result<(DatasetVersionRecord, String, polars::prelude::LazyFrame), AppError> {
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
    let source_schema = source
        .clone()
        .collect_schema()
        .map_err(|error| AppError::bad_request(format!("Cleaning source schema unavailable: {error}")))?;
    let rows_before = state
        .query_executor
        .execute_async(source)
        .await
        .map_err(AppError::from)?
        .height();
    let result = state.query_executor.execute_async(frame).await.map_err(AppError::from)?;
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
        warnings: Vec::new(),
    }))
}

pub async fn export_data(
    State(state): State<AppState>,
    Json(request): Json<CleaningDataExportRequest>,
) -> Result<Response, AppError> {
    if request.format != "parquet" {
        return Err(AppError::bad_request("Cleaning data export currently supports format 'parquet' only"));
    }
    let (version, plan_hash, mut frame) = compile_request_frame(&state, &request.context)?;
    if let Some(columns) = request.output_columns.as_ref() {
        if columns.is_empty() {
            return Err(AppError::bad_request("Cleaning export outputColumns must not be empty when supplied"));
        }
        frame = frame.select(columns.iter().map(polars::prelude::col).collect::<Vec<_>>());
    }
    let data = state.query_executor.execute_async(frame).await.map_err(AppError::from)?;
    let bytes = dataframe_to_parquet(data)
        .map_err(|error| AppError::io(format!("Cleaning Parquet serialization failed: {error}")))?;
    let mut response = Response::new(bytes.into());
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/x-parquet"));
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=edatime_cleaned.parquet"),
    );
    headers.insert(
        "x-edatime-source-version",
        HeaderValue::from_str(&version.id).map_err(|_| AppError::internal("Invalid source version response header"))?,
    );
    headers.insert(
        "x-edatime-plan-hash",
        HeaderValue::from_str(&plan_hash).map_err(|_| AppError::internal("Invalid plan hash response header"))?,
    );
    Ok(response)
}

pub async fn list_versions(
    State(state): State<AppState>,
) -> Result<Json<Vec<DatasetVersionRecord>>, AppError> {
    Ok(Json(state.dataset_versions()?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::State;
    use edatime_core::config::AppConfig;
    use edatime_query::cleaning::{CleaningStageBaseDto, CleaningStageDto, RangeMode};
    use polars::prelude::{DataFrame, NamedFrom, Series};

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
        assert_eq!(export.headers().get("x-edatime-source-version").expect("source version"), "source-0");
        assert!(export.headers().get("x-edatime-plan-hash").is_some());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stale_source_identity_is_rejected_before_execution() {
        let state = state();
        let mut request = envelope(&state);
        request.expected_source_version_id = "missing".to_string();
        let error = validate(State(state), Json(request)).await.expect_err("stale source");
        assert_eq!(error.code, crate::error::ErrorCode::StalePlan);
    }
}
