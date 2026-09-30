//! Scatter correlation handlers — plan-aware POST requests.

use std::sync::Arc;

use axum::{
    Json,
    extract::State,
    response::{IntoResponse, Response},
};
use serde::Deserialize;

use crate::error::AppError;
use edatime_core::metrics::{CorrelationTelemetryMode, CpuStage};
use edatime_store::cache::CorrelationMatrixCacheEntry;
use edatime_store::state::AppState;
use polars::prelude::{LazyFrame, SortMultipleOptions};

use super::{CorrelationItem, SuggestionItem, numeric_columns};
use crate::handlers::routes::cleaning_context::{PlanRequestEnvelope, resolve_cleaning_context};
use crate::handlers::routes::shared::{
    ExecutionIdentity, add_execution_identity_headers, enforce_work_budget,
};

#[derive(Debug, Clone, Copy, Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CorrelationMode {
    PearsonRaw,
    SpearmanRaw,
    KendallRaw,
    PearsonDiff,
    SpearmanDiff,
    KendallDiff,
}

impl CorrelationMode {
    fn cache_key(self) -> &'static str {
        match self {
            Self::PearsonRaw => "pearson_raw",
            Self::SpearmanRaw => "spearman_raw",
            Self::KendallRaw => "kendall_raw",
            Self::PearsonDiff => "pearson_diff",
            Self::SpearmanDiff => "spearman_diff",
            Self::KendallDiff => "kendall_diff",
        }
    }

    #[allow(clippy::needless_lifetimes)] // explicit lifetime is part of the public API surface
    fn matrix<'a>(self, data: &'a CorrelationMatrixData) -> &'a Vec<Vec<Option<f64>>> {
        match self {
            Self::PearsonRaw => &data.pearson_raw,
            Self::SpearmanRaw => &data.spearman_raw,
            Self::KendallRaw => &data.kendall_raw,
            Self::PearsonDiff => &data.pearson_diff,
            Self::SpearmanDiff => &data.spearman_diff,
            Self::KendallDiff => &data.kendall_diff,
        }
    }

    /// Stable snake_case label used as a low-cardinality bucket for
    /// telemetry. NEVER derive a label from raw user input here — the
    /// `mode` parameter is already a closed enum, so any reachable label
    /// belongs to the six known values.
    fn telemetry_mode(self) -> CorrelationTelemetryMode {
        match self {
            Self::PearsonRaw => CorrelationTelemetryMode::PearsonRaw,
            Self::SpearmanRaw => CorrelationTelemetryMode::SpearmanRaw,
            Self::KendallRaw => CorrelationTelemetryMode::KendallRaw,
            Self::PearsonDiff => CorrelationTelemetryMode::PearsonDiff,
            Self::SpearmanDiff => CorrelationTelemetryMode::SpearmanDiff,
            Self::KendallDiff => CorrelationTelemetryMode::KendallDiff,
        }
    }
}

fn default_include_global_top_pairs() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScatterCorrelationsQuery {
    pub base: Option<String>,
    pub threshold: Option<f64>,
    pub mode: Option<CorrelationMode>,
    /// Global all-pairs ranking is useful on the Pair plot page, but callers
    /// that only need base-column suggestions can avoid computing every pair.
    #[serde(default = "default_include_global_top_pairs")]
    pub include_global_top_pairs: bool,
    pub cleaning_plan: PlanRequestEnvelope,
}

#[derive(Debug, serde::Serialize)]
pub struct ScatterCorrelationsResponse {
    pub mode: CorrelationMode,
    pub base_column: String,
    pub threshold: f64,
    pub numeric_columns: Vec<String>,
    pub correlations: Vec<CorrelationItem>,
    pub suggestions: Vec<SuggestionItem>,
    /// Top-N strongest pairs across the entire matrix, ranked by absolute
    /// correlation. Independent of the base column / threshold so the
    /// frontend can surface the *globally* strongest pair (e.g. HULL↔MULL
    /// on ETTm2) even when it does not involve the base column — see
    /// `usage_issue.md` §2.1 and §3.1. Each entry carries the pair, the
    /// signed correlation, and the sample count for the pair.
    #[serde(default)]
    pub top_pairs: Vec<TopPairItem>,
}

/// One globally-ranked correlation pair. Includes the signed correlation
/// (not just absolute) so callers can distinguish strong positives from
/// strong negatives — see `usage_issue.md` §2.6.
#[derive(Debug, serde::Serialize, Clone)]
pub struct TopPairItem {
    pub x: String,
    pub y: String,
    pub correlation: f64,
    pub count: usize,
}

fn json_with_execution_identity<T: serde::Serialize>(
    value: T,
    identity: &ExecutionIdentity,
) -> Response {
    add_execution_identity_headers(Json(value).into_response(), identity)
}

/// Share the requested metric across pages and base-column changes. Computing
/// all six metrics here makes even a Pearson plot wait for Kendall and the
/// first-difference matrices. Cache each metric independently instead.
async fn working_correlation_matrix(
    state: &AppState,
    lf: LazyFrame,
    identity: &ExecutionIdentity,
    mode: Option<CorrelationMode>,
) -> Result<CorrelationMatrixData, AppError> {
    let columns = numeric_columns(lf.clone());
    let budget = correlation_work_budget(state, columns.len(), mode, false)?;
    let estimated_bytes = estimated_correlation_result_bytes(&columns, mode.is_none());
    let plan_hash = identity.plan_hash.as_deref().ok_or_else(|| {
        AppError::internal("Plan-aware correlation request is missing its plan hash")
    })?;
    let slot = state.working_correlation_cache.lock().await.entry(
        identity.source_version_id.clone(),
        plan_hash.to_string(),
        mode.map(CorrelationMode::cache_key).unwrap_or("all_modes"),
        estimated_bytes,
    );
    let metrics = Arc::clone(&state.metrics);
    let mode_telemetry = mode
        .map(CorrelationMode::telemetry_mode)
        .unwrap_or(CorrelationTelemetryMode::AllModes);
    let was_pending = slot.get().is_none();
    let mut computed = false;
    let entry = slot
        .get_or_try_init(|| async {
            computed = true;
            let data = state
                .query_executor
                .run_interactive(CpuStage::Correlations, move || match mode {
                    Some(mode) => compute_correlation_data_for_mode_with_budget(
                        lf,
                        mode,
                        metrics,
                        Some(budget),
                    ),
                    None => compute_correlation_matrix_with_budget(lf, metrics, Some(budget)),
                })
                .await
                .map_err(AppError::from)??;
            let entry = data.into_cache();
            state
                .working_correlation_cache
                .lock()
                .await
                .record_result_size(&slot, entry.estimated_bytes());
            Ok::<_, AppError>(entry)
        })
        .await?;
    state
        .metrics
        .record_correlation_request(!computed, mode_telemetry);
    if !computed && was_pending {
        state.metrics.record_correlation_single_flight();
    }
    Ok(CorrelationMatrixData::from_cache(entry.clone()))
}

async fn scatter_correlations_response(
    state: AppState,
    params: ScatterCorrelationsQuery,
) -> Result<Response, AppError> {
    tracing::info!(
        "post_scatter_correlations called with base={:?}, threshold={:?}",
        params.base,
        params.threshold
    );

    let (lf, identity) = correlation_frame_with_plan(&state, &params.cleaning_plan)?;

    let threshold = params.threshold.unwrap_or(0.7).clamp(0.0, 1.0);
    let requested_base = params.base.clone();
    let mode = params.mode.unwrap_or(CorrelationMode::PearsonRaw);
    let mode_telemetry = mode.telemetry_mode();
    if !params.include_global_top_pairs {
        let requested_base = requested_base.as_deref().ok_or_else(|| {
            AppError::bad_request("A base column is required when global top pairs are disabled")
        })?;
        let columns = numeric_columns(lf.clone());
        let budget = correlation_work_budget(&state, columns.len(), Some(mode), true)?;
        state
            .metrics
            .record_correlation_request(false, mode_telemetry);
        let metrics = Arc::clone(&state.metrics);
        let base = requested_base.to_string();
        let data = state
            .query_executor
            .run_interactive(CpuStage::Correlations, move || {
                compute_base_correlation_data(lf, columns, base, mode, metrics, budget)
            })
            .await
            .map_err(AppError::from)??;
        return Ok(json_with_execution_identity(
            build_scatter_correlations_from_base_data(&data, threshold, mode),
            &identity,
        ));
    }
    let data = working_correlation_matrix(&state, lf, &identity, Some(mode)).await?;
    Ok(json_with_execution_identity(
        build_scatter_correlations_from_matrix_data(
            &data,
            requested_base.as_deref(),
            threshold,
            mode,
        )?,
        &identity,
    ))
}

#[tracing::instrument(skip(state, params))]
pub async fn post_scatter_correlations(
    State(state): State<AppState>,
    Json(params): Json<ScatterCorrelationsQuery>,
) -> Result<Response, AppError> {
    scatter_correlations_response(state, params).await
}

// ── Full NxN Correlation Matrix ────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct CorrelationMatrixResponse {
    pub input_rows: usize,
    pub time_range_ms: Option<[f64; 2]>,
    pub counts: Vec<Vec<usize>>,
    pub diff_counts: Vec<Vec<usize>>,
    pub columns: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pearson_raw: Option<Vec<Vec<Option<f64>>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spearman_raw: Option<Vec<Vec<Option<f64>>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kendall_raw: Option<Vec<Vec<Option<f64>>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pearson_diff: Option<Vec<Vec<Option<f64>>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spearman_diff: Option<Vec<Vec<Option<f64>>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kendall_diff: Option<Vec<Vec<Option<f64>>>>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CorrelationMatrixQuery {
    pub mode: Option<CorrelationMode>,
    pub cleaning_plan: PlanRequestEnvelope,
}

fn estimated_correlation_result_bytes(columns: &[String], all_modes: bool) -> usize {
    let n = columns.len();
    let cells = n.saturating_mul(n);
    let metric_matrices = if all_modes { 6usize } else { 1usize };
    let values = metric_matrices.saturating_mul(std::mem::size_of::<Option<f64>>());
    let counts = 2usize.saturating_mul(std::mem::size_of::<usize>());
    let row_headers = metric_matrices
        .saturating_add(2)
        .saturating_mul(n)
        .saturating_mul(std::mem::size_of::<Vec<Option<f64>>>());
    cells
        .saturating_mul(values.saturating_add(counts))
        .saturating_add(row_headers)
        .saturating_add(std::mem::size_of::<CorrelationMatrixCacheEntry>())
        .saturating_add(n.saturating_mul(std::mem::size_of::<String>()))
        .saturating_add(
            columns
                .iter()
                .map(String::capacity)
                .fold(0usize, usize::saturating_add),
        )
}

fn correlation_pair_count(column_count: usize, base_only: bool) -> u128 {
    let columns = column_count as u128;
    if base_only {
        columns.saturating_sub(1)
    } else {
        columns.saturating_mul(columns.saturating_sub(1)) / 2
    }
}

/// The row cap belongs to the resolved working plan, never the mutable
/// active repository. Collection probes at most one row beyond this cap so
/// oversized requests fail without publishing a truncated correlation.
#[derive(Clone, Copy)]
struct CorrelationWorkBudget {
    units_per_row: u128,
    max_work_units: u128,
}

impl CorrelationWorkBudget {
    fn probe_rows(self) -> u32 {
        u32::try_from((self.max_work_units / self.units_per_row).saturating_add(1))
            .unwrap_or(u32::MAX)
    }

    fn check_rows(self, rows: usize) -> Result<(), AppError> {
        enforce_work_budget(
            "correlation row-pair work",
            (rows as u128).saturating_mul(self.units_per_row),
            self.max_work_units,
        )
    }
}

fn correlation_work_budget(
    state: &AppState,
    column_count: usize,
    mode: Option<CorrelationMode>,
    base_only: bool,
) -> Result<CorrelationWorkBudget, AppError> {
    let pair_count = correlation_pair_count(column_count, base_only);
    enforce_work_budget(
        "correlation pair count",
        pair_count,
        state.config.budgets.max_scatter_matrix_pairs as u128,
    )?;
    if base_only && column_count == 0 {
        return Err(AppError::bad_request(
            "No numeric columns are available for correlation",
        ));
    }
    let diagonal_work = if base_only { 1 } else { column_count as u128 };
    let matrix_count = if mode.is_none() { 6 } else { 1 };
    Ok(CorrelationWorkBudget {
        units_per_row: pair_count
            .saturating_add(diagonal_work)
            .saturating_mul(matrix_count)
            .max(1),
        max_work_units: state.config.budgets.max_correlation_work_units as u128,
    })
}

fn correlation_frame_with_plan(
    state: &AppState,
    cleaning_plan: &PlanRequestEnvelope,
) -> Result<(LazyFrame, ExecutionIdentity), AppError> {
    let context = resolve_cleaning_context(state, cleaning_plan)?;
    let frame = chronologically_ordered_frame(context.frame, &cleaning_plan.plan.time_column);
    Ok((
        frame,
        ExecutionIdentity::from_version(context.version, Some(context.plan_hash)),
    ))
}

/// Correlation differences use adjacent rows in ascending selected-time
/// order, regardless of the saved cleaning plan's presentation sort.
fn chronologically_ordered_frame(frame: LazyFrame, time_column: &str) -> LazyFrame {
    frame.sort(
        [time_column],
        SortMultipleOptions::default().with_maintain_order(true),
    )
}

// Phase 0.2 + Phase 0.3 follow-up: the type was promoted from
// module-private to `pub` so the Criterion bench
// (`crates/edatime-service/benches/correlations.rs`) can use the
// return type. `#[doc(hidden)]` here AND the matching alias on
// `handlers::scatter` are what keep it out of the rendered rustdoc.
// Without the `#[doc(hidden)]` here, the rustdoc rendered surface
// would expose this struct (with six full `Vec<Vec<Option<f64>>>`
// matrices) as part of the public API.
#[doc(hidden)]
#[derive(Debug, Clone)]
pub struct CorrelationMatrixData {
    input_rows: usize,
    time_range_ms: Option<[f64; 2]>,
    columns: Vec<String>,
    pearson_raw: Vec<Vec<Option<f64>>>,
    spearman_raw: Vec<Vec<Option<f64>>>,
    kendall_raw: Vec<Vec<Option<f64>>>,
    pearson_diff: Vec<Vec<Option<f64>>>,
    spearman_diff: Vec<Vec<Option<f64>>>,
    kendall_diff: Vec<Vec<Option<f64>>>,
    counts: Vec<Vec<usize>>,
    diff_counts: Vec<Vec<usize>>,
}

impl CorrelationMatrixData {
    fn from_cache(entry: CorrelationMatrixCacheEntry) -> Self {
        Self {
            input_rows: entry.input_rows,
            time_range_ms: entry.time_range_ms,
            columns: entry.columns,
            pearson_raw: entry.pearson_raw,
            spearman_raw: entry.spearman_raw,
            kendall_raw: entry.kendall_raw,
            pearson_diff: entry.pearson_diff,
            spearman_diff: entry.spearman_diff,
            kendall_diff: entry.kendall_diff,
            counts: entry.counts,
            diff_counts: entry.diff_counts,
        }
    }

    fn into_cache(self) -> CorrelationMatrixCacheEntry {
        CorrelationMatrixCacheEntry {
            input_rows: self.input_rows,
            time_range_ms: self.time_range_ms,
            columns: self.columns,
            pearson_raw: self.pearson_raw,
            spearman_raw: self.spearman_raw,
            kendall_raw: self.kendall_raw,
            pearson_diff: self.pearson_diff,
            spearman_diff: self.spearman_diff,
            kendall_diff: self.kendall_diff,
            counts: self.counts,
            diff_counts: self.diff_counts,
        }
    }

    fn to_response(&self) -> CorrelationMatrixResponse {
        CorrelationMatrixResponse {
            input_rows: self.input_rows,
            time_range_ms: self.time_range_ms,
            counts: self.counts.clone(),
            diff_counts: self.diff_counts.clone(),
            columns: self.columns.clone(),
            pearson_raw: Some(self.pearson_raw.clone()),
            spearman_raw: Some(self.spearman_raw.clone()),
            kendall_raw: Some(self.kendall_raw.clone()),
            pearson_diff: Some(self.pearson_diff.clone()),
            spearman_diff: Some(self.spearman_diff.clone()),
            kendall_diff: Some(self.kendall_diff.clone()),
        }
    }

    fn to_response_for_mode(&self, mode: CorrelationMode) -> CorrelationMatrixResponse {
        let mut response = CorrelationMatrixResponse {
            input_rows: self.input_rows,
            time_range_ms: self.time_range_ms,
            counts: self.counts.clone(),
            diff_counts: self.diff_counts.clone(),
            columns: self.columns.clone(),
            pearson_raw: None,
            spearman_raw: None,
            kendall_raw: None,
            pearson_diff: None,
            spearman_diff: None,
            kendall_diff: None,
        };

        match mode {
            CorrelationMode::PearsonRaw => response.pearson_raw = Some(self.pearson_raw.clone()),
            CorrelationMode::SpearmanRaw => response.spearman_raw = Some(self.spearman_raw.clone()),
            CorrelationMode::KendallRaw => response.kendall_raw = Some(self.kendall_raw.clone()),
            CorrelationMode::PearsonDiff => response.pearson_diff = Some(self.pearson_diff.clone()),
            CorrelationMode::SpearmanDiff => {
                response.spearman_diff = Some(self.spearman_diff.clone())
            }
            CorrelationMode::KendallDiff => response.kendall_diff = Some(self.kendall_diff.clone()),
        }

        response
    }
}

pub fn spawn_correlation_matrix_warmup(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let revision = state.dataset_revision();
        if state.cached_correlation_matrix(revision).is_some() {
            return;
        }
        let lf = state.dataset_snapshot();
        let column_count = numeric_columns(lf.clone()).len();
        let budget = match correlation_work_budget(&state, column_count, None, false) {
            Ok(budget) => budget,
            Err(error) => {
                tracing::debug!("correlation matrix warmup skipped by work budget: {error}");
                return;
            }
        };
        let metrics = Arc::clone(&state.metrics);
        metrics.record_correlation_warmup_dispatched();
        let _single_flight = state.acquire_correlation_single_flight(revision).await;
        if state.cached_correlation_matrix(revision).is_some() {
            metrics.record_correlation_single_flight();
            return;
        }
        let closure_metrics = Arc::clone(&metrics);
        match state
            .query_executor
            .run_background(CpuStage::Correlations, move || {
                compute_correlation_matrix_with_budget(
                    lf,
                    Arc::clone(&closure_metrics),
                    Some(budget),
                )
            })
            .await
        {
            Ok(Ok(data)) => {
                state.store_correlation_matrix_if_current(revision, data.into_cache());
            }
            Ok(Err(error)) => {
                tracing::debug!("correlation matrix warmup skipped: {}", error);
            }
            Err(error) => {
                tracing::warn!("correlation matrix warmup admission failed: {:?}", error);
            }
        }
    })
}

async fn correlation_matrix_response(
    state: AppState,
    params: CorrelationMatrixQuery,
) -> Result<Response, AppError> {
    let mode = params.mode;
    let (lf, identity) = correlation_frame_with_plan(&state, &params.cleaning_plan)?;
    let data = working_correlation_matrix(&state, lf, &identity, mode).await?;
    Ok(json_with_execution_identity(
        match mode {
            Some(mode) => data.to_response_for_mode(mode),
            None => data.to_response(),
        },
        &identity,
    ))
}

/// POST counterpart for plan-aware correlation matrix requests. It accepts a
/// typed plan envelope so large plans never need to fit in a query string.
pub async fn post_correlation_matrix(
    State(state): State<AppState>,
    Json(params): Json<CorrelationMatrixQuery>,
) -> Result<Response, AppError> {
    correlation_matrix_response(state, params).await
}

mod compute;
pub use compute::{compute_correlation_matrix, compute_correlation_matrix_for_mode};
// Crate-private kernels used by the handlers below and by the tests.
use compute::*;

#[cfg(test)]
mod tests;
