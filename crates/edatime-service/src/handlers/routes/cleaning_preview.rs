//! Preview stage-by-stage row impacts and bounded examples for a validated plan.

use std::collections::BTreeMap;

use axum::{Json, extract::State};
use polars::prelude::{DataType, LazyFrame, len};
use serde::Serialize;

use super::cleaning_context::{PlanRequestEnvelope, resolve_cleaning_context};
use crate::error::AppError;
use edatime_query::cleaning::{CleaningPlanDto, CleaningStageDto, ValidatedCleaningPlan};
use edatime_store::state::AppState;
use edatime_store::versions::DatasetVersionRecord;

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
    pub source_columns: Vec<String>,
    pub result_columns: Vec<String>,
    pub examples: CleaningPreviewExamples,
    pub stage_impacts: Vec<CleaningStageImpact>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleaningPreviewExamples {
    pub raw: Vec<CleaningPreviewRow>,
    pub working: Vec<CleaningPreviewRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleaningPreviewRow {
    pub row_number: usize,
    pub timestamp: String,
    pub values: BTreeMap<String, String>,
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

pub(super) fn preview_warnings(plan: &CleaningPlanDto) -> Vec<String> {
    let Some(split_index) = plan.stages.iter().position(|stage| {
        stage.enabled() && matches!(stage, CleaningStageDto::ChronologicalSplit { .. })
    }) else {
        return Vec::new();
    };
    plan.stages[..split_index]
        .iter()
        .filter(|stage| stage.enabled())
        .filter_map(|stage| match stage {
            CleaningStageDto::FillNull { .. } => Some(format!(
                "Potential leakage: ordered null fill stage '{}' runs before the chronological split and can carry values across split boundaries.",
                stage.id()
            )),
            CleaningStageDto::Resample { .. } => Some(format!(
                "Potential leakage: resampling stage '{}' runs before the chronological split and can aggregate values across split boundaries.",
                stage.id()
            )),
            _ => None,
        })
        .collect()
}

fn stage_preserves_row_count(stage: &CleaningStageDto) -> bool {
    matches!(
        stage,
        CleaningStageDto::ColumnRange { .. }
            | CleaningStageDto::AdaptiveLine { .. }
            | CleaningStageDto::ColumnSelect { .. }
            | CleaningStageDto::Sort { .. }
            | CleaningStageDto::FillNull { .. }
            | CleaningStageDto::ChronologicalSplit { .. }
            | CleaningStageDto::DerivedColumn { .. }
            | CleaningStageDto::Annotation { .. }
    )
}

async fn count_rows(state: &AppState, frame: LazyFrame) -> Result<usize, AppError> {
    let count = state
        .query_executor
        .execute_async(frame.select([len().cast(DataType::UInt64).alias("__rows")]))
        .await
        .map_err(AppError::from)?;
    count
        .column("__rows")
        .ok()
        .and_then(|column| column.u64().ok())
        .and_then(|column| column.get(0))
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| AppError::internal("Cleaning preview row count unavailable"))
}

async fn collect_examples(
    state: &AppState,
    frame: LazyFrame,
    time_column: &str,
) -> Result<Vec<CleaningPreviewRow>, AppError> {
    let data = state
        .query_executor
        .execute_async(frame.limit(3))
        .await
        .map_err(AppError::from)?;
    let mut rows = Vec::with_capacity(data.height());
    for row_number in 0..data.height() {
        let timestamp = data
            .column(time_column)
            .ok()
            .and_then(|column| column.get(row_number).ok())
            .map(|value| value.to_string())
            .unwrap_or_else(|| "—".to_string());
        let mut values = BTreeMap::new();
        for column in data.columns() {
            let name = column.name().as_str();
            if name == time_column || values.len() >= 8 {
                continue;
            }
            if let Ok(value) = column.get(row_number) {
                values.insert(name.to_string(), value.to_string());
            }
        }
        rows.push(CleaningPreviewRow {
            row_number,
            timestamp,
            values,
        });
    }
    Ok(rows)
}

pub async fn preview(
    State(state): State<AppState>,
    Json(envelope): Json<PlanRequestEnvelope>,
) -> Result<Json<CleaningPreviewResponse>, AppError> {
    let context = resolve_cleaning_context(&state, &envelope)?;
    let version = context.version;
    let plan_hash = context.plan_hash;
    let mut frame = context.frame;
    let source = state.dataset_snapshot_for_version(&version.id)?;
    let source_schema = source.clone().collect_schema().map_err(|error| {
        AppError::bad_request(format!("Cleaning source schema unavailable: {error}"))
    })?;

    let rows_before = count_rows(&state, source.clone()).await?;
    // Validate cross-stage prerequisites against the saved plan once.
    let validated_plan = ValidatedCleaningPlan::new(&envelope.plan).map_err(AppError::from)?;
    let mut stage_frame = source.clone();
    let mut prior_rows = rows_before;
    let mut stage_impacts = Vec::with_capacity(envelope.plan.stages.len());
    for (stage_index, stage) in envelope.plan.stages.iter().enumerate() {
        let executed = stage.enabled() && !matches!(stage, CleaningStageDto::Annotation { .. });
        let rows_after = if executed {
            // Apply the stage in the already validated plan context while
            // preserving saved order and reporting its marginal row impact.
            stage_frame = validated_plan
                .compile_stage(stage_frame, stage_index)
                .map_err(AppError::from)?;
            if stage_preserves_row_count(stage) {
                prior_rows
            } else {
                count_rows(&state, stage_frame.clone()).await?
            }
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
    let result_schema = frame.collect_schema().map_err(|error| {
        AppError::bad_request(format!("Cleaning result schema unavailable: {error}"))
    })?;

    let raw_examples = collect_examples(&state, source.clone(), &envelope.plan.time_column).await?;
    let working_examples =
        collect_examples(&state, frame.clone(), &envelope.plan.time_column).await?;
    let source_columns = source_schema
        .iter_names()
        .map(|name| name.to_string())
        .collect();
    let result_columns = result_schema
        .iter_names()
        .map(|name| name.to_string())
        .collect();
    let rows_after = prior_rows;
    Ok(Json(CleaningPreviewResponse {
        dataset_revision: version.revision,
        source_version: version,
        plan_hash,
        rows_before,
        rows_after,
        rows_removed: rows_before.saturating_sub(rows_after),
        columns_before: source_schema.len(),
        columns_after: result_schema.len(),
        source_columns,
        result_columns,
        examples: CleaningPreviewExamples {
            raw: raw_examples,
            working: working_examples,
        },
        stage_impacts,
        warnings: preview_warnings(&envelope.plan),
    }))
}
