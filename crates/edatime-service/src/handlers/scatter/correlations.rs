//! Scatter correlation handlers — plan-aware POST requests.

use std::sync::Arc;

use axum::{
    Json,
    extract::State,
    response::{IntoResponse, Response},
};
use rayon::prelude::*;
use serde::Deserialize;

use crate::error::AppError;
use edatime_core::metrics::{AppMetrics, CorrelationStage, CorrelationTelemetryMode, CpuStage};
use edatime_core::stats;
use edatime_store::cache::CorrelationMatrixCacheEntry;
use edatime_store::state::AppState;
use polars::prelude::{LazyFrame, SortMultipleOptions, col};

use super::collect::series_to_scatter_values;
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
    let slot = state.working_correlation_cache.lock().await.entry(
        identity.source_version_id.clone(),
        identity
            .plan_hash
            .as_deref()
            .expect("plan-aware correlation requests include a plan hash")
            .to_string(),
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

#[tracing::instrument(skip(state))]
pub async fn post_scatter_correlations(
    State(state): State<AppState>,
    Json(params): Json<ScatterCorrelationsQuery>,
) -> Result<Response, AppError> {
    scatter_correlations_response(state, params).await
}

// ── Full NxN Correlation Matrix ────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct CorrelationMatrixResponse {
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

struct BaseCorrelationData {
    columns: Vec<String>,
    base_index: usize,
    mode_values: Vec<Option<f64>>,
    counts: Vec<usize>,
    diff_counts: Vec<usize>,
}

fn select_correlation_columns(frame: LazyFrame, columns: &[String]) -> LazyFrame {
    frame.select(
        columns
            .iter()
            .map(|name| col(name.as_str()))
            .collect::<Vec<_>>(),
    )
}

fn collect_correlation_frame(
    frame: LazyFrame,
    columns: &[String],
    budget: Option<CorrelationWorkBudget>,
) -> Result<polars::prelude::DataFrame, AppError> {
    let selected = select_correlation_columns(frame, columns);
    let selected = match budget {
        Some(budget) => selected.limit(budget.probe_rows()),
        None => selected,
    };
    let data = selected
        .with_new_streaming(true)
        .collect()
        .map_err(|error| AppError::internal(format!("correlation collect: {error}")))?;
    if let Some(budget) = budget {
        budget.check_rows(data.height())?;
    }
    Ok(data)
}

fn compute_base_correlation_data(
    frame: LazyFrame,
    columns: Vec<String>,
    base_column: String,
    mode: CorrelationMode,
    metrics: Arc<AppMetrics>,
    budget: CorrelationWorkBudget,
) -> Result<BaseCorrelationData, AppError> {
    let base_index = columns
        .iter()
        .position(|column| column == &base_column)
        .ok_or_else(|| {
            AppError::bad_request(format!(
                "Base column '{base_column}' is not numeric/temporal"
            ))
        })?;
    let collect_start = std::time::Instant::now();
    let df = collect_correlation_frame(frame, &columns, Some(budget))?;
    metrics.record_correlation_stage(
        CorrelationStage::Collect,
        collect_start.elapsed().as_nanos() as u64,
    );
    metrics.record_correlation_input(columns.len() as u64, df.height() as u64);

    let extract_start = std::time::Instant::now();
    let values = extract_correlation_columns(&df, &columns)?;
    metrics.record_correlation_stage(
        CorrelationStage::Extract,
        extract_start.elapsed().as_nanos() as u64,
    );

    let pair_start = std::time::Instant::now();
    let mut mode_values = vec![None; columns.len()];
    let mut counts = vec![0; columns.len()];
    let mut diff_counts = vec![0; columns.len()];
    for index in 0..columns.len() {
        if index == base_index {
            continue;
        }
        let (_, _, value, count, diff_count) =
            compute_mode_pair_correlation(base_index, index, mode, &values);
        mode_values[index] = value;
        counts[index] = count;
        diff_counts[index] = diff_count;
    }
    metrics.record_correlation_stage(
        CorrelationStage::PairCalc,
        pair_start.elapsed().as_nanos() as u64,
    );
    Ok(BaseCorrelationData {
        columns,
        base_index,
        mode_values,
        counts,
        diff_counts,
    })
}

fn build_scatter_correlations_from_base_data(
    data: &BaseCorrelationData,
    threshold: f64,
    mode: CorrelationMode,
) -> ScatterCorrelationsResponse {
    let base_column = data.columns[data.base_index].clone();
    let mut correlations = data
        .columns
        .iter()
        .enumerate()
        .filter(|(index, _)| *index != data.base_index)
        .map(|(index, column)| CorrelationItem {
            column: column.clone(),
            count: effective_mode_count(data.counts[index], data.diff_counts[index], mode),
            value: data.mode_values[index],
        })
        .collect::<Vec<_>>();
    correlations.sort_by(|a, b| {
        b.value
            .map(|value| value.abs())
            .unwrap_or(0.0)
            .total_cmp(&a.value.map(|value| value.abs()).unwrap_or(0.0))
    });
    let suggestions = correlations
        .iter()
        .filter(|item| item.value.is_some_and(|value| value.abs() >= threshold))
        .map(|item| SuggestionItem {
            x: base_column.clone(),
            y: item.column.clone(),
            correlation: item.value.unwrap_or_default(),
        })
        .collect();
    ScatterCorrelationsResponse {
        mode,
        base_column,
        threshold,
        numeric_columns: data.columns.clone(),
        correlations,
        suggestions,
        top_pairs: Vec::new(),
    }
}

fn first_difference_pairs(x_values: &[Option<f64>], y_values: &[Option<f64>]) -> Vec<[f64; 2]> {
    x_values
        .windows(2)
        .zip(y_values.windows(2))
        .filter_map(|(x_window, y_window)| {
            let ([Some(x0), Some(x1)], [Some(y0), Some(y1)]) = (x_window, y_window) else {
                return None;
            };
            let delta_x = x1 - x0;
            let delta_y = y1 - y0;
            (delta_x.is_finite() && delta_y.is_finite()).then_some([delta_x, delta_y])
        })
        .collect()
}

fn compute_pair_correlation(
    mode: CorrelationMode,
    pairs: &[[f64; 2]],
    diff_pairs: &[[f64; 2]],
) -> Option<f64> {
    match mode {
        CorrelationMode::PearsonRaw => stats::pearson(pairs),
        CorrelationMode::SpearmanRaw => stats::spearman(pairs),
        CorrelationMode::KendallRaw => stats::kendall_tau(pairs),
        CorrelationMode::PearsonDiff => stats::pearson(diff_pairs),
        CorrelationMode::SpearmanDiff => stats::spearman(diff_pairs),
        CorrelationMode::KendallDiff => stats::kendall_tau(diff_pairs),
    }
}

type CorrelationColumn = Vec<Option<f64>>;

/// Materialize each correlation column once, preserving row alignment for
/// nulls and non-finite values. Before this extraction phase, every pair
/// independently cast both source columns, multiplying conversion/allocation
/// work by the number of pairs.
fn extract_correlation_columns(
    df: &polars::prelude::DataFrame,
    columns: &[String],
) -> Result<Vec<CorrelationColumn>, AppError> {
    columns
        .iter()
        .map(|column| series_to_scatter_values(df, column))
        .collect()
}

fn collect_aligned_pairs(x_values: &[Option<f64>], y_values: &[Option<f64>]) -> Vec<[f64; 2]> {
    x_values
        .iter()
        .zip(y_values)
        .filter_map(|(x, y)| match (x, y) {
            (Some(x), Some(y)) => Some([*x, *y]),
            _ => None,
        })
        .collect()
}

#[derive(Debug)]
struct PairCorrelationValues {
    i: usize,
    j: usize,
    raw_pearson: Option<f64>,
    raw_spearman: Option<f64>,
    raw_kendall: Option<f64>,
    diff_pearson: Option<f64>,
    diff_spearman: Option<f64>,
    diff_kendall: Option<f64>,
    count: usize,
    diff_count: usize,
}

fn compute_all_pair_correlations(
    i: usize,
    j: usize,
    values: &[CorrelationColumn],
) -> PairCorrelationValues {
    let pairs = collect_aligned_pairs(&values[i], &values[j]);
    let diff_pairs = first_difference_pairs(&values[i], &values[j]);
    PairCorrelationValues {
        i,
        j,
        raw_pearson: stats::pearson(&pairs),
        raw_spearman: stats::spearman(&pairs),
        raw_kendall: stats::kendall_tau(&pairs),
        diff_pearson: stats::pearson(&diff_pairs),
        diff_spearman: stats::spearman(&diff_pairs),
        diff_kendall: stats::kendall_tau(&diff_pairs),
        count: pairs.len(),
        diff_count: diff_pairs.len(),
    }
}

fn compute_mode_pair_correlation(
    i: usize,
    j: usize,
    mode: CorrelationMode,
    values: &[CorrelationColumn],
) -> (usize, usize, Option<f64>, usize, usize) {
    let pairs = collect_aligned_pairs(&values[i], &values[j]);
    let diff_pairs = match mode {
        CorrelationMode::PearsonDiff
        | CorrelationMode::SpearmanDiff
        | CorrelationMode::KendallDiff => first_difference_pairs(&values[i], &values[j]),
        _ => vec![],
    };
    (
        i,
        j,
        compute_pair_correlation(mode, &pairs, &diff_pairs),
        pairs.len(),
        diff_pairs.len(),
    )
}

fn upper_triangle_indices(column_count: usize) -> Vec<(usize, usize)> {
    (0..column_count)
        .flat_map(|i| ((i + 1)..column_count).map(move |j| (i, j)))
        .collect()
}

/// Small and medium matrices are faster without Rayon scheduling overhead.
/// Wide matrices (at least 256 independent pairs, or 24 columns) use Rayon’s
/// bounded global pool; results are applied serially so no matrix locks or
/// shared mutable state enter the hot path.
fn map_pair_indices<T: Send>(
    indices: &[(usize, usize)],
    work: impl Fn((usize, usize)) -> T + Send + Sync,
) -> Vec<T> {
    if indices.len() < 256 {
        indices.iter().copied().map(work).collect()
    } else {
        indices.par_iter().copied().map(work).collect()
    }
}

#[doc(hidden)]
pub fn compute_correlation_matrix_for_mode(
    lf: LazyFrame,
    mode: CorrelationMode,
    metrics: Arc<AppMetrics>,
) -> Result<CorrelationMatrixResponse, AppError> {
    Ok(compute_correlation_data_for_mode(lf, mode, metrics)?.to_response_for_mode(mode))
}

fn compute_correlation_data_for_mode(
    lf: LazyFrame,
    mode: CorrelationMode,
    metrics: Arc<AppMetrics>,
) -> Result<CorrelationMatrixData, AppError> {
    compute_correlation_data_for_mode_with_budget(lf, mode, metrics, None)
}

fn compute_correlation_data_for_mode_with_budget(
    lf: LazyFrame,
    mode: CorrelationMode,
    metrics: Arc<AppMetrics>,
    budget: Option<CorrelationWorkBudget>,
) -> Result<CorrelationMatrixData, AppError> {
    let mut numeric = numeric_columns(lf.clone());
    numeric.sort();
    let mut data = CorrelationMatrixData {
        columns: numeric.clone(),
        pearson_raw: vec![],
        spearman_raw: vec![],
        kendall_raw: vec![],
        pearson_diff: vec![],
        spearman_diff: vec![],
        kendall_diff: vec![],
        counts: vec![],
        diff_counts: vec![],
    };
    if numeric.is_empty() {
        return Ok(data);
    }

    let n = numeric.len();
    let mut selected = vec![vec![None; n]; n];
    let collect_start = std::time::Instant::now();
    let df = collect_correlation_frame(lf, &numeric, budget)?;
    metrics.record_correlation_stage(
        CorrelationStage::Collect,
        collect_start.elapsed().as_nanos() as u64,
    );
    metrics.record_correlation_input(n as u64, df.height() as u64);

    let extract_start = std::time::Instant::now();
    let values = extract_correlation_columns(&df, &numeric)?;
    metrics.record_correlation_stage(
        CorrelationStage::Extract,
        extract_start.elapsed().as_nanos() as u64,
    );

    let pair_start = std::time::Instant::now();
    data.counts = vec![vec![0; n]; n];
    data.diff_counts = vec![vec![0; n]; n];
    for (i, row) in selected.iter_mut().enumerate() {
        let (_, _, value, count, diff_count) = compute_mode_pair_correlation(i, i, mode, &values);
        row[i] = value;
        data.counts[i][i] = count;
        data.diff_counts[i][i] = diff_count;
    }
    for (i, j, value, count, diff_count) in
        map_pair_indices(&upper_triangle_indices(n), |(i, j)| {
            compute_mode_pair_correlation(i, j, mode, &values)
        })
    {
        selected[i][j] = value;
        selected[j][i] = value;
        data.counts[i][j] = count;
        data.counts[j][i] = count;
        data.diff_counts[i][j] = diff_count;
        data.diff_counts[j][i] = diff_count;
    }
    metrics.record_correlation_stage(
        CorrelationStage::PairCalc,
        pair_start.elapsed().as_nanos() as u64,
    );

    match mode {
        CorrelationMode::PearsonRaw => data.pearson_raw = selected,
        CorrelationMode::SpearmanRaw => data.spearman_raw = selected,
        CorrelationMode::KendallRaw => data.kendall_raw = selected,
        CorrelationMode::PearsonDiff => data.pearson_diff = selected,
        CorrelationMode::SpearmanDiff => data.spearman_diff = selected,
        CorrelationMode::KendallDiff => data.kendall_diff = selected,
    }
    Ok(data)
}

// Phase 0.2: the body used to be `fn compute_correlation_matrix(...)`
// with module-private visibility. The Criterion bench under
// `crates/edatime-service/benches/correlations.rs` cannot reach a
// module-private function because benches are external compilation
// units. The function is re-exported under a `*_bench_target` alias on
// `handlers::scatter` (`#[doc(hidden)]`) so it does not enlarge the
// documented public API.
#[doc(hidden)]
pub fn compute_correlation_matrix(
    lf: LazyFrame,
    metrics: Arc<AppMetrics>,
) -> Result<CorrelationMatrixData, AppError> {
    compute_correlation_matrix_with_budget(lf, metrics, None)
}

fn compute_correlation_matrix_with_budget(
    lf: LazyFrame,
    metrics: Arc<AppMetrics>,
    budget: Option<CorrelationWorkBudget>,
) -> Result<CorrelationMatrixData, AppError> {
    let mut numeric = numeric_columns(lf.clone());
    numeric.sort();

    if numeric.is_empty() {
        return Ok(CorrelationMatrixData {
            columns: vec![],
            pearson_raw: vec![],
            spearman_raw: vec![],
            kendall_raw: vec![],
            pearson_diff: vec![],
            spearman_diff: vec![],
            kendall_diff: vec![],
            counts: vec![],
            diff_counts: vec![],
        });
    }

    let n = numeric.len();
    let mut pearson_raw = vec![vec![None; n]; n];
    let mut spearman_raw = vec![vec![None; n]; n];
    let mut kendall_raw = vec![vec![None; n]; n];
    let mut pearson_diff = vec![vec![None; n]; n];
    let mut spearman_diff = vec![vec![None; n]; n];
    let mut kendall_diff = vec![vec![None; n]; n];
    let mut counts = vec![vec![0; n]; n];
    let mut diff_counts = vec![vec![0; n]; n];

    let collect_start = std::time::Instant::now();
    let df = collect_correlation_frame(lf, &numeric, budget)?;
    let collect_ns = collect_start.elapsed().as_nanos() as u64;
    metrics.record_correlation_stage(CorrelationStage::Collect, collect_ns);
    let input_rows = df.height() as u64;
    metrics.record_correlation_input(n as u64, input_rows);

    let extract_start = std::time::Instant::now();
    let values = extract_correlation_columns(&df, &numeric)?;
    metrics.record_correlation_stage(
        CorrelationStage::Extract,
        extract_start.elapsed().as_nanos() as u64,
    );

    let pair_start = std::time::Instant::now();
    for i in 0..n {
        let pair = compute_all_pair_correlations(i, i, &values);
        pearson_raw[i][i] = pair.raw_pearson;
        spearman_raw[i][i] = pair.raw_spearman;
        kendall_raw[i][i] = pair.raw_kendall;
        pearson_diff[i][i] = pair.diff_pearson;
        spearman_diff[i][i] = pair.diff_spearman;
        kendall_diff[i][i] = pair.diff_kendall;
        counts[i][i] = pair.count;
        diff_counts[i][i] = pair.diff_count;
    }
    for pair in map_pair_indices(&upper_triangle_indices(n), |(i, j)| {
        compute_all_pair_correlations(i, j, &values)
    }) {
        pearson_raw[pair.i][pair.j] = pair.raw_pearson;
        pearson_raw[pair.j][pair.i] = pair.raw_pearson;
        spearman_raw[pair.i][pair.j] = pair.raw_spearman;
        spearman_raw[pair.j][pair.i] = pair.raw_spearman;
        kendall_raw[pair.i][pair.j] = pair.raw_kendall;
        kendall_raw[pair.j][pair.i] = pair.raw_kendall;
        pearson_diff[pair.i][pair.j] = pair.diff_pearson;
        pearson_diff[pair.j][pair.i] = pair.diff_pearson;
        spearman_diff[pair.i][pair.j] = pair.diff_spearman;
        spearman_diff[pair.j][pair.i] = pair.diff_spearman;
        kendall_diff[pair.i][pair.j] = pair.diff_kendall;
        kendall_diff[pair.j][pair.i] = pair.diff_kendall;
        counts[pair.i][pair.j] = pair.count;
        counts[pair.j][pair.i] = pair.count;
        diff_counts[pair.i][pair.j] = pair.diff_count;
        diff_counts[pair.j][pair.i] = pair.diff_count;
    }
    let pair_ns = pair_start.elapsed().as_nanos() as u64;
    metrics.record_correlation_stage(CorrelationStage::PairCalc, pair_ns);
    // This numerical target computes all six matrices. Mode-specific
    // requests use their own target and record only the requested metric.
    metrics.record_correlation_all_modes();

    Ok(CorrelationMatrixData {
        columns: numeric,
        pearson_raw,
        spearman_raw,
        kendall_raw,
        pearson_diff,
        spearman_diff,
        kendall_diff,
        counts,
        diff_counts,
    })
}

fn build_scatter_correlations_from_matrix_data(
    data: &CorrelationMatrixData,
    requested_base: Option<&str>,
    threshold: f64,
    mode: CorrelationMode,
) -> Result<ScatterCorrelationsResponse, AppError> {
    // Globally-ranked top pairs: walk the upper triangle of the selected
    // correlation matrix, collect every finite (i, j) pair with its
    // signed correlation + sample count, sort by |r| descending and keep
    // the top 20. Returned alongside `suggestions` so the frontend can
    // surface "HULL ↔ MULL = 0.91" even when the user's base column is
    // HUFL (whose strongest partner tops out around 0.67 on ETTm2) — see
    // `usage_issue.md` §2.1.
    let top_pairs = top_pairs_from_matrix(data, mode, 20);

    if data.columns.len() < 2 {
        return Ok(ScatterCorrelationsResponse {
            mode,
            base_column: data.columns.first().cloned().unwrap_or_default(),
            threshold,
            numeric_columns: data.columns.clone(),
            correlations: vec![],
            suggestions: vec![],
            top_pairs,
        });
    }

    let base_column = if let Some(base) = requested_base {
        if !data.columns.iter().any(|column| column == base) {
            return Err(AppError::bad_request(format!(
                "Base column '{}' is not numeric/temporal",
                base
            )));
        }
        base.to_string()
    } else {
        data.columns
            .iter()
            .find(|column| column.as_str() != "ts")
            .cloned()
            .unwrap_or_else(|| data.columns[0].clone())
    };

    let base_index = data
        .columns
        .iter()
        .position(|column| column == &base_column)
        .ok_or_else(|| AppError::internal("Cached correlation base column missing"))?;
    let selected = mode.matrix(data);

    let mut correlations = data
        .columns
        .iter()
        .enumerate()
        .filter(|(_, column)| *column != &base_column)
        .map(|(index, column)| CorrelationItem {
            column: column.clone(),
            count: effective_mode_count(
                data.counts[base_index][index],
                data.diff_counts[base_index][index],
                mode,
            ),
            value: selected[base_index][index],
        })
        .collect::<Vec<_>>();

    correlations.sort_by(|a, b| {
        let a_score = a.value.map(|v| v.abs()).unwrap_or(0.0);
        let b_score = b.value.map(|v| v.abs()).unwrap_or(0.0);
        b_score.total_cmp(&a_score)
    });

    let suggestions = correlations
        .iter()
        .filter(|item| item.value.map(|v| v.abs()).unwrap_or(0.0) >= threshold)
        .map(|item| SuggestionItem {
            x: base_column.clone(),
            y: item.column.clone(),
            correlation: item.value.unwrap_or(0.0),
        })
        .collect();

    Ok(ScatterCorrelationsResponse {
        mode,
        base_column,
        threshold,
        numeric_columns: data.columns.clone(),
        correlations,
        suggestions,
        top_pairs,
    })
}

/// Build the globally-ranked `top_pairs` list for the selected correlation
/// mode. Walks the upper triangle of `data.columns × data.columns` so each
/// unordered pair appears exactly once.
fn top_pairs_from_matrix(
    data: &CorrelationMatrixData,
    mode: CorrelationMode,
    limit: usize,
) -> Vec<TopPairItem> {
    let selected = mode.matrix(data);
    let n = data.columns.len();
    if n < 2 {
        return Vec::new();
    }
    let mut pairs: Vec<TopPairItem> = Vec::with_capacity(n * (n - 1) / 2);
    for (i, row) in selected.iter().enumerate().take(n) {
        for (j, value) in row.iter().enumerate().take(n).skip(i + 1) {
            let Some(value) = value else {
                continue;
            };
            pairs.push(TopPairItem {
                x: data.columns[i].clone(),
                y: data.columns[j].clone(),
                correlation: *value,
                count: effective_mode_count(data.counts[i][j], data.diff_counts[i][j], mode),
            });
        }
    }
    pairs.sort_by(|a, b| {
        let a_score = a.correlation.abs();
        let b_score = b.correlation.abs();
        // Descending by |r|, ties broken by signed correlation (positive
        // first) so the strongest positive pair wins on ties.
        b_score
            .total_cmp(&a_score)
            .then_with(|| b.correlation.total_cmp(&a.correlation))
    });
    pairs.truncate(limit);
    pairs
}

/// Report eligible adjacent-row deltas for difference metrics. Invalid
/// observations break adjacency, so this count cannot be inferred by
/// subtracting one from the number of finite raw pairs.
fn effective_mode_count(raw_count: usize, diff_count: usize, mode: CorrelationMode) -> usize {
    if matches!(
        mode,
        CorrelationMode::PearsonDiff | CorrelationMode::SpearmanDiff | CorrelationMode::KendallDiff
    ) {
        diff_count
    } else {
        raw_count
    }
}

#[cfg(test)]
fn build_scatter_correlations_from_cached_matrix(
    entry: CorrelationMatrixCacheEntry,
    requested_base: Option<&str>,
    threshold: f64,
    mode: CorrelationMode,
) -> Result<ScatterCorrelationsResponse, AppError> {
    let data = CorrelationMatrixData::from_cache(entry);
    build_scatter_correlations_from_matrix_data(&data, requested_base, threshold, mode)
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

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use edatime_core::IntoLazy;
    use edatime_core::config::AppConfig;
    use edatime_query::cleaning::CleaningPlanDto;
    use polars::prelude::{DataFrame, NamedFrom, Series};

    /// Test-only metrics handle. Telemetry from compute_correlation_matrix
    /// is observed but discarded in tests; the test still asserts on the
    /// returned matrix, not on metric counters.
    fn test_metrics() -> Arc<AppMetrics> {
        Arc::new(AppMetrics::new())
    }

    fn empty_envelope(state: &AppState) -> PlanRequestEnvelope {
        let version = state.current_dataset_version().expect("source version");
        PlanRequestEnvelope {
            expected_plan_hash: None,
            expected_source_version_id: version.id.clone(),
            expected_dataset_revision: version.revision,
            plan: CleaningPlanDto {
                schema_version: 1,
                id: "correlation-test-plan".to_string(),
                plan_revision: 1,
                source_version_id: version.id,
                dataset_revision: version.revision,
                dataset_fingerprint: Some(version.dataset_fingerprint),
                schema_fingerprint: version.schema_fingerprint,
                time_column: "ts".to_string(),
                source_name: None,
                stages: vec![],
                created_at: "now".to_string(),
                updated_at: "now".to_string(),
            },
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn working_matrix_reuses_results_and_invalidates_on_plan_change() {
        let frame = DataFrame::new(
            3,
            vec![
                Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
            ],
        )
        .expect("frame");
        let state = AppState::new(frame.clone(), AppConfig::default());
        let mut identity = ExecutionIdentity::from_version(
            state.current_dataset_version().expect("version"),
            Some("plan-a".into()),
        );
        let mode = Some(CorrelationMode::PearsonRaw);
        let first = working_correlation_matrix(&state, frame.clone().lazy(), &identity, mode)
            .await
            .expect("first");
        // An empty input would fail to reproduce the first matrix without a cache hit.
        let cached =
            working_correlation_matrix(&state, frame.head(Some(0)).lazy(), &identity, mode)
                .await
                .expect("cached");
        assert_eq!(first.counts, cached.counts);
        identity.plan_hash = Some("plan-b".into());
        let changed =
            working_correlation_matrix(&state, frame.head(Some(2)).lazy(), &identity, mode)
                .await
                .expect("changed");
        assert_eq!(changed.counts[0][1], 2);
        assert_eq!(first.counts[0][1], 3);
        identity.source_version_id = "another-source".into();
        let changed_source =
            working_correlation_matrix(&state, frame.head(Some(1)).lazy(), &identity, mode)
                .await
                .expect("changed source");
        assert_eq!(changed_source.counts[0][1], 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn working_matrix_computes_only_requested_modes_and_coalesces_matching_requests() {
        let frame = DataFrame::new(
            5,
            vec![
                Series::new(
                    "a".into(),
                    [Some(1.0_f64), None, Some(3.0), Some(8.0), Some(5.0)],
                )
                .into(),
                Series::new("b".into(), [2.0_f64, 7.0, 4.0, 9.0, 5.0]).into(),
            ],
        )
        .expect("frame");
        let state = AppState::new(frame.clone(), AppConfig::default());
        let identity = ExecutionIdentity::from_version(
            state.current_dataset_version().expect("version"),
            Some("plan-a".into()),
        );
        let mode = Some(CorrelationMode::PearsonRaw);
        let (first, second) = tokio::join!(
            working_correlation_matrix(&state, frame.clone().lazy(), &identity, mode),
            working_correlation_matrix(&state, frame.clone().lazy(), &identity, mode),
        );
        let first = first.expect("first");
        assert_eq!(first.pearson_raw, second.expect("second").pearson_raw);
        assert_eq!(first.counts[0][1], 4);
        assert!(first.spearman_raw.is_empty());
        assert!(first.kendall_raw.is_empty());
        assert!(first.pearson_diff.is_empty());
        assert!(first.spearman_diff.is_empty());
        assert!(first.kendall_diff.is_empty());
        // Both callers share a single collection and pair calculation.
        assert_eq!(
            state
                .metrics
                .snapshot(0, 0)
                .correlations_stages
                .input_rows_total,
            5
        );
        let snapshot = state.metrics.snapshot(0, 0);
        assert_eq!(snapshot.correlations_stages.all_modes_total, 0);
        assert_eq!(snapshot.correlations_stages.cache_miss_total, 1);
        assert_eq!(snapshot.correlations_stages.cache_hit_total, 1);
        let spearman = working_correlation_matrix(
            &state,
            frame.clone().lazy(),
            &identity,
            Some(CorrelationMode::SpearmanRaw),
        )
        .await
        .expect("spearman");
        assert!(spearman.pearson_raw.is_empty());
        let full = working_correlation_matrix(&state, frame.lazy(), &identity, None)
            .await
            .expect("all modes");
        assert_eq!(spearman.spearman_raw, full.spearman_raw);
        assert_eq!(first.pearson_raw, full.pearson_raw);
        assert_eq!(first.counts, full.counts);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn working_matrix_does_not_wait_for_another_plan_in_flight() {
        let frame = DataFrame::new(
            3,
            vec![
                Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
            ],
        )
        .expect("frame");
        let state = AppState::new(frame.clone(), AppConfig::default());
        let identity = ExecutionIdentity::from_version(
            state.current_dataset_version().expect("version"),
            Some("new-plan".into()),
        );
        let old_slot = state.working_correlation_cache.lock().await.entry(
            identity.source_version_id.clone(),
            "old-plan".into(),
            "pearson_raw",
            1,
        );
        let (started, waiting) = tokio::sync::oneshot::channel();
        let old_request = tokio::spawn(async move {
            old_slot
                .get_or_init(|| async {
                    started.send(()).expect("started");
                    std::future::pending::<CorrelationMatrixCacheEntry>().await
                })
                .await;
        });
        waiting.await.expect("old request holds its slot");
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            working_correlation_matrix(
                &state,
                frame.lazy(),
                &identity,
                Some(CorrelationMode::PearsonRaw),
            ),
        )
        .await;
        old_request.abort();
        let matrix = result
            .expect("new plan must not wait for old plan")
            .expect("new matrix");
        assert_eq!(matrix.pearson_raw[0][1], Some(1.0));
    }

    #[test]
    fn selected_mode_preserves_pair_alignment_and_counts_for_every_metric() {
        let frame = DataFrame::new(
            6,
            vec![
                Series::new(
                    "a".into(),
                    [
                        Some(1.0_f64),
                        None,
                        Some(3.0),
                        Some(f64::NAN),
                        Some(7.0),
                        Some(5.0),
                    ],
                )
                .into(),
                Series::new("b".into(), [2.0_f64, 8.0, 2.0, 9.0, 6.0, 4.0]).into(),
                Series::new("c".into(), [6.0_f64, 5.0, 4.0, 3.0, 2.0, 1.0]).into(),
            ],
        )
        .expect("frame");
        let all = compute_correlation_matrix(frame.clone().lazy(), test_metrics()).expect("all");
        for mode in [
            CorrelationMode::PearsonRaw,
            CorrelationMode::SpearmanRaw,
            CorrelationMode::KendallRaw,
            CorrelationMode::PearsonDiff,
            CorrelationMode::SpearmanDiff,
            CorrelationMode::KendallDiff,
        ] {
            let selected =
                compute_correlation_data_for_mode(frame.clone().lazy(), mode, test_metrics())
                    .expect("selected mode");
            assert_eq!(mode.matrix(&selected), mode.matrix(&all));
            assert_eq!(selected.counts, all.counts);
            let response =
                build_scatter_correlations_from_matrix_data(&selected, Some("a"), 0.0, mode)
                    .expect("scatter response");
            let expected = build_scatter_correlations_from_matrix_data(&all, Some("a"), 0.0, mode)
                .expect("full response");
            assert_eq!(
                serde_json::to_value(response).unwrap(),
                serde_json::to_value(expected).unwrap()
            );
        }
    }

    #[test]
    fn cached_matrix_builds_sorted_correlations_for_requested_base() {
        let cached = edatime_store::cache::CorrelationMatrixCacheEntry {
            columns: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            pearson_raw: vec![
                vec![Some(1.0), Some(0.25), Some(0.9)],
                vec![Some(0.25), Some(1.0), Some(-0.8)],
                vec![Some(0.9), Some(-0.8), Some(1.0)],
            ],
            spearman_raw: vec![
                vec![Some(1.0), Some(0.3), Some(0.7)],
                vec![Some(0.3), Some(1.0), Some(-0.6)],
                vec![Some(0.7), Some(-0.6), Some(1.0)],
            ],
            kendall_raw: vec![
                vec![Some(1.0), Some(0.2), Some(0.6)],
                vec![Some(0.2), Some(1.0), Some(-0.4)],
                vec![Some(0.6), Some(-0.4), Some(1.0)],
            ],
            pearson_diff: vec![
                vec![Some(1.0), Some(0.1), Some(-0.2)],
                vec![Some(0.1), Some(1.0), Some(0.4)],
                vec![Some(-0.2), Some(0.4), Some(1.0)],
            ],
            spearman_diff: vec![
                vec![Some(1.0), Some(0.15), Some(-0.1)],
                vec![Some(0.15), Some(1.0), Some(0.45)],
                vec![Some(-0.1), Some(0.45), Some(1.0)],
            ],
            kendall_diff: vec![
                vec![Some(1.0), Some(0.05), Some(-0.1)],
                vec![Some(0.05), Some(1.0), Some(0.72)],
                vec![Some(-0.1), Some(0.72), Some(1.0)],
            ],
            counts: vec![vec![3, 3, 3], vec![3, 3, 3], vec![3, 3, 3]],
            diff_counts: vec![vec![2, 2, 2], vec![2, 2, 2], vec![2, 2, 2]],
        };

        let response = build_scatter_correlations_from_cached_matrix(
            cached,
            Some("b"),
            0.7,
            CorrelationMode::KendallDiff,
        )
        .expect("cached matrix should build response");

        assert_eq!(response.base_column, "b");
        assert_eq!(response.mode, CorrelationMode::KendallDiff);
        assert_eq!(response.numeric_columns, vec!["a", "b", "c"]);
        assert_eq!(
            response
                .correlations
                .iter()
                .map(|item| item.column.as_str())
                .collect::<Vec<_>>(),
            vec!["c", "a"]
        );
        assert_eq!(response.correlations[0].value, Some(0.72));
        assert_eq!(response.correlations[0].count, 2);
        assert_eq!(response.suggestions.len(), 1);
        assert_eq!(response.suggestions[0].x, "b");
        assert_eq!(response.suggestions[0].y, "c");
        assert_eq!(response.suggestions[0].correlation, 0.72);
    }

    #[test]
    fn top_pairs_ranks_by_absolute_correlation_across_full_matrix() {
        // Mirror the ETTm2 situation: the strongest pair (b↔c) does not
        // involve the base column `a`. The legacy `suggestions` list would
        // miss it when threshold > |corr(a,*)|; the new `top_pairs` field
        // surfaces it regardless — see `usage_issue.md` §2.1.
        let cached = edatime_store::cache::CorrelationMatrixCacheEntry {
            columns: vec![
                "a".to_string(),
                "b".to_string(),
                "c".to_string(),
                "d".to_string(),
            ],
            pearson_raw: vec![
                vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
                vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
                vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
                vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
            ],
            spearman_raw: vec![
                vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
                vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
                vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
                vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
            ],
            kendall_raw: vec![
                vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
                vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
                vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
                vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
            ],
            pearson_diff: vec![
                vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
                vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
                vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
                vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
            ],
            spearman_diff: vec![
                vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
                vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
                vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
                vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
            ],
            kendall_diff: vec![
                vec![Some(1.0), Some(0.25), Some(0.30), Some(-0.10)],
                vec![Some(0.25), Some(1.0), Some(0.91), Some(-0.60)],
                vec![Some(0.30), Some(0.91), Some(1.0), Some(-0.20)],
                vec![Some(-0.10), Some(-0.60), Some(-0.20), Some(1.0)],
            ],
            counts: vec![
                vec![3, 3, 3, 3],
                vec![3, 3, 3, 3],
                vec![3, 3, 3, 3],
                vec![3, 3, 3, 3],
            ],
            diff_counts: vec![
                vec![2, 2, 2, 2],
                vec![2, 2, 2, 2],
                vec![2, 2, 2, 2],
                vec![2, 2, 2, 2],
            ],
        };

        let response = build_scatter_correlations_from_cached_matrix(
            cached,
            Some("a"),
            // High threshold so the legacy `suggestions` list comes back
            // empty — the whole point of `top_pairs` is to surface pairs
            // regardless of the threshold.
            0.95,
            CorrelationMode::PearsonRaw,
        )
        .expect("cached matrix should build response");

        // Legacy base-column suggestions are filtered out by threshold.
        assert!(
            response.suggestions.is_empty(),
            "threshold should hide suggestions"
        );

        // top_pairs is sorted by |r| descending and includes the strongest
        // off-base pair first (b ↔ c = 0.91), then the strong negative
        // (b ↔ d = -0.60).
        assert_eq!(response.top_pairs[0].x, "b");
        assert_eq!(response.top_pairs[0].y, "c");
        assert!((response.top_pairs[0].correlation - 0.91).abs() < 1e-9);
        assert_eq!(response.top_pairs[0].count, 3);

        // Negative pair is ranked by absolute value so it sits below the
        // 0.91 pair but above the 0.30 / 0.25 noise.
        assert_eq!(response.top_pairs[1].x, "b");
        assert_eq!(response.top_pairs[1].y, "d");
        assert!((response.top_pairs[1].correlation + 0.60).abs() < 1e-9);
    }

    #[test]
    fn top_pairs_respects_selected_mode() {
        let cached = edatime_store::cache::CorrelationMatrixCacheEntry {
            columns: vec!["a".to_string(), "b".to_string()],
            pearson_raw: vec![vec![Some(1.0), Some(0.5)], vec![Some(0.5), Some(1.0)]],
            spearman_raw: vec![vec![Some(1.0), Some(0.9)], vec![Some(0.9), Some(1.0)]],
            kendall_raw: vec![vec![Some(1.0), Some(0.3)], vec![Some(0.3), Some(1.0)]],
            pearson_diff: vec![vec![Some(1.0), Some(0.1)], vec![Some(0.1), Some(1.0)]],
            spearman_diff: vec![vec![Some(1.0), Some(0.2)], vec![Some(0.2), Some(1.0)]],
            kendall_diff: vec![vec![Some(1.0), Some(0.4)], vec![Some(0.4), Some(1.0)]],
            counts: vec![vec![3, 3], vec![3, 3]],
            diff_counts: vec![vec![2, 2], vec![2, 2]],
        };

        let pearson = build_scatter_correlations_from_cached_matrix(
            cached.clone(),
            Some("a"),
            0.0,
            CorrelationMode::PearsonRaw,
        )
        .expect("pearson build should succeed");
        assert!((pearson.top_pairs[0].correlation - 0.5).abs() < 1e-9);

        let spearman = build_scatter_correlations_from_cached_matrix(
            cached,
            Some("a"),
            0.0,
            CorrelationMode::SpearmanRaw,
        )
        .expect("spearman build should succeed");
        // Spearman value is higher than Pearson so it wins under |r| ordering.
        assert!((spearman.top_pairs[0].correlation - 0.9).abs() < 1e-9);
    }

    #[test]
    fn top_pairs_returns_empty_when_matrix_has_no_pairs() {
        let cached = edatime_store::cache::CorrelationMatrixCacheEntry {
            columns: vec!["only".to_string()],
            pearson_raw: vec![vec![Some(1.0)]],
            spearman_raw: vec![vec![Some(1.0)]],
            kendall_raw: vec![vec![Some(1.0)]],
            pearson_diff: vec![vec![Some(1.0)]],
            spearman_diff: vec![vec![Some(1.0)]],
            kendall_diff: vec![vec![Some(1.0)]],
            counts: vec![vec![3]],
            diff_counts: vec![vec![2]],
        };
        let response = build_scatter_correlations_from_cached_matrix(
            cached,
            Some("only"),
            0.5,
            CorrelationMode::PearsonRaw,
        )
        .expect("singleton matrix should still build");
        assert!(response.top_pairs.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn warm_correlation_matrix_cache_populates_current_revision() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
                Series::new("c".into(), [3.0_f64, 2.0, 1.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let revision = state.dataset_revision();

        spawn_correlation_matrix_warmup(state.clone())
            .await
            .expect("warmup task should join");

        let cached = state
            .cached_correlation_matrix(revision)
            .expect("warmup should populate matrix cache");
        assert_eq!(cached.columns, vec!["a", "b", "c"]);
        assert_eq!(cached.pearson_raw[0][1], Some(1.0));
        assert_eq!(cached.pearson_raw[0][2], Some(-1.0));
        assert_eq!(cached.spearman_raw[0][1], Some(1.0));
        assert_eq!(cached.kendall_raw[0][1], Some(1.0));
        assert_eq!(cached.counts[0][1], 3);
    }

    #[test]
    fn correlation_matrix_returns_empty_payload_when_no_numeric_columns_exist() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("label".into(), ["a", "b", "c"]).into(),
                Series::new("group".into(), ["x", "y", "z"]).into(),
            ],
        )
        .expect("dataframe should build");

        let result =
            compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix should not error");

        assert!(result.columns.is_empty());
        assert!(result.pearson_raw.is_empty());
        assert!(result.spearman_raw.is_empty());
        assert!(result.kendall_raw.is_empty());
        assert!(result.pearson_diff.is_empty());
        assert!(result.spearman_diff.is_empty());
        assert!(result.kendall_diff.is_empty());
        assert!(result.counts.is_empty());
    }

    #[test]
    fn correlation_matrix_returns_singleton_diagonal_when_one_numeric_column_exists() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("only".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("label".into(), ["x", "y", "z"]).into(),
            ],
        )
        .expect("dataframe should build");

        let result =
            compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix should not error");

        assert_eq!(result.columns, vec!["only"]);
        assert_eq!(result.pearson_raw, vec![vec![Some(1.0)]]);
        assert_eq!(result.spearman_raw, vec![vec![Some(1.0)]]);
        assert_eq!(result.kendall_raw, vec![vec![Some(1.0)]]);
        assert_eq!(result.pearson_diff, vec![vec![None]]);
        assert_eq!(result.spearman_diff, vec![vec![None]]);
        assert_eq!(result.kendall_diff, vec![vec![None]]);
        assert_eq!(result.counts, vec![vec![3]]);
    }

    #[test]
    fn correlation_diagonals_follow_pairwise_validity_and_variance_rules() {
        let df = DataFrame::new(
            4,
            vec![
                Series::new("constant".into(), [5.0_f64, 5.0, 5.0, 5.0]).into(),
                Series::new("all_null".into(), [None::<f64>, None, None, None]).into(),
                Series::new(
                    "all_invalid".into(),
                    [
                        Some(f64::NAN),
                        Some(f64::INFINITY),
                        Some(f64::NEG_INFINITY),
                        None,
                    ],
                )
                .into(),
                Series::new("singleton".into(), [None, None, Some(5.0_f64), None]).into(),
                Series::new("ramp".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
                Series::new("varying".into(), [1.0_f64, 2.0, 4.0, 8.0]).into(),
            ],
        )
        .expect("diagonal fixture");
        let matrix = compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix");
        for (name, expected_count) in [
            ("constant", 4),
            ("all_null", 0),
            ("all_invalid", 0),
            ("singleton", 1),
            ("ramp", 4),
            ("varying", 4),
        ] {
            let index = matrix
                .columns
                .iter()
                .position(|column| column == name)
                .expect("diagonal column");
            assert_eq!(matrix.counts[index][index], expected_count, "{name} count");
            if matches!(name, "ramp" | "varying") {
                assert_eq!(matrix.pearson_raw[index][index], Some(1.0), "{name} raw");
                assert_eq!(
                    matrix.spearman_raw[index][index],
                    Some(1.0),
                    "{name} raw rank"
                );
                assert_eq!(
                    matrix.kendall_raw[index][index],
                    Some(1.0),
                    "{name} raw tau"
                );
            } else {
                assert_eq!(matrix.pearson_raw[index][index], None, "{name} raw");
                assert_eq!(matrix.spearman_raw[index][index], None, "{name} raw rank");
                assert_eq!(matrix.kendall_raw[index][index], None, "{name} raw tau");
            }
            if name == "varying" {
                assert_eq!(matrix.pearson_diff[index][index], Some(1.0));
                assert_eq!(matrix.spearman_diff[index][index], Some(1.0));
                assert_eq!(matrix.kendall_diff[index][index], Some(1.0));
            } else {
                assert_eq!(matrix.pearson_diff[index][index], None, "{name} difference");
                assert_eq!(
                    matrix.spearman_diff[index][index], None,
                    "{name} difference rank"
                );
                assert_eq!(
                    matrix.kendall_diff[index][index], None,
                    "{name} difference tau"
                );
            }
        }
    }

    #[test]
    fn correlation_matrix_computes_first_difference_modes_from_aligned_pairs() {
        let df = DataFrame::new(
            4,
            vec![
                Series::new("a".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
                Series::new("b".into(), [10.0_f64, 9.0, 8.0, 7.0]).into(),
            ],
        )
        .expect("dataframe should build");

        let result =
            compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix should not error");

        assert_eq!(result.pearson_raw[0][1], Some(-1.0));
        assert_eq!(result.spearman_raw[0][1], Some(-1.0));
        assert_eq!(result.kendall_raw[0][1], Some(-1.0));
        assert_eq!(result.pearson_diff[0][1], None);
        assert_eq!(result.spearman_diff[0][1], None);
        assert_eq!(result.kendall_diff[0][1], None);
    }

    #[test]
    fn first_differences_preserve_adjacent_row_gaps_and_counts() {
        let x = vec![Some(0.0), None, Some(100.0), Some(101.0), Some(103.0)];
        let y = vec![Some(0.0), Some(3.0), Some(-100.0), Some(-99.0), Some(-97.0)];
        assert_eq!(
            first_difference_pairs(&x, &y),
            vec![[1.0, 1.0], [2.0, 2.0]],
            "a missing row must invalidate neighboring differences, not create a longer bridge"
        );

        let x = vec![
            Some(0.0),
            None,
            Some(100.0),
            Some(101.0),
            Some(103.0),
            Some(105.0),
            Some(108.0),
        ];
        let y = vec![
            Some(0.0),
            Some(3.0),
            Some(-100.0),
            Some(-99.0),
            None,
            Some(-95.0),
            Some(-90.0),
        ];
        assert_eq!(
            first_difference_pairs(&x, &y),
            vec![[1.0, 1.0], [3.0, 5.0]],
            "asymmetric masks should keep only shared adjacent valid intervals"
        );

        let df = DataFrame::new(
            7,
            vec![
                Series::new("x".into(), x).into(),
                Series::new("y".into(), y).into(),
            ],
        )
        .expect("masked frame");
        let matrix = compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix");
        let x_index = matrix
            .columns
            .iter()
            .position(|name| name == "x")
            .expect("x index");
        let y_index = matrix
            .columns
            .iter()
            .position(|name| name == "y")
            .expect("y index");
        assert_eq!(matrix.counts[x_index][y_index], 5);
        assert_eq!(matrix.diff_counts[x_index][y_index], 2);
        assert_eq!(matrix.pearson_diff[x_index][y_index], Some(1.0));

        let response = build_scatter_correlations_from_matrix_data(
            &matrix,
            Some("x"),
            0.0,
            CorrelationMode::PearsonDiff,
        )
        .expect("difference response");
        assert_eq!(response.correlations[0].count, 2);
    }

    #[test]
    fn correlation_projection_excludes_unused_columns_before_collection() {
        let frame = DataFrame::new(
            2,
            vec![
                Series::new("value".into(), [1.0_f64, 2.0]).into(),
                Series::new("unused_payload".into(), ["large text", "more text"]).into(),
            ],
        )
        .expect("frame");
        let projected = select_correlation_columns(frame.lazy(), &["value".to_string()])
            .collect()
            .expect("projected frame");
        assert_eq!(
            projected
                .get_column_names()
                .iter()
                .map(|name| name.as_str())
                .collect::<Vec<_>>(),
            vec!["value"]
        );
    }

    #[test]
    fn correlation_input_sorts_by_selected_time_before_differencing() {
        let frame = DataFrame::new(
            4,
            vec![
                Series::new("event_time".into(), [3_i64, 1, 4, 2]).into(),
                Series::new("signal".into(), [30.0_f64, 10.0, 40.0, 20.0]).into(),
            ],
        )
        .expect("unsorted frame");
        let sorted = chronologically_ordered_frame(frame.lazy(), "event_time")
            .collect()
            .expect("chronological sort");
        let timestamps = sorted
            .column("event_time")
            .expect("time column")
            .i64()
            .expect("integer timestamps");
        assert_eq!(
            timestamps.into_no_null_iter().collect::<Vec<_>>(),
            vec![1, 2, 3, 4]
        );
    }

    #[test]
    fn masking_one_trace_does_not_reduce_other_pair_counts() {
        let df = DataFrame::new(
            4,
            vec![
                Series::new("a".into(), [None, Some(2.0_f64), None, Some(4.0)]).into(),
                Series::new("b".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
                Series::new("c".into(), [40.0_f64, 30.0, 20.0, 10.0]).into(),
            ],
        )
        .expect("frame");
        let matrix = compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix");
        assert_eq!(matrix.counts[0][1], 2);
        assert_eq!(matrix.counts[1][2], 4);
        assert_eq!(matrix.pearson_raw[1][2], Some(-1.0));
        assert_eq!(matrix.spearman_raw[1][2], Some(-1.0));
    }

    #[test]
    fn correlation_matrix_does_not_shift_rows_after_non_finite_values() {
        let df = DataFrame::new(
            4,
            vec![
                Series::new("a".into(), [1.0_f64, f64::NAN, 3.0, 4.0]).into(),
                Series::new("b".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
            ],
        )
        .expect("dataframe should build");

        let result =
            compute_correlation_matrix(df.lazy(), test_metrics()).expect("matrix should not error");

        assert_eq!(result.counts[0][1], 3);
        assert_eq!(result.pearson_raw[0][1], Some(1.0));
    }

    #[test]
    fn correlation_matrix_for_selected_mode_only_populates_requested_matrix() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("b".into(), [3.0_f64, 2.0, 1.0]).into(),
            ],
        )
        .expect("dataframe should build");

        let metrics = test_metrics();
        let response = compute_correlation_matrix_for_mode(
            df.lazy(),
            CorrelationMode::KendallDiff,
            Arc::clone(&metrics),
        )
        .expect("selected-mode matrix should build");

        assert_eq!(response.columns, vec!["a", "b"]);
        assert!(response.pearson_raw.is_none());
        assert!(response.spearman_raw.is_none());
        assert!(response.kendall_raw.is_none());
        assert!(response.pearson_diff.is_none());
        assert!(response.spearman_diff.is_none());
        assert_eq!(
            response.kendall_diff,
            Some(vec![vec![None, None], vec![None, None]])
        );
        let snapshot = metrics.snapshot(0, 0);
        assert_eq!(snapshot.correlations_stages.numeric_columns_total, 2);
        assert_eq!(snapshot.correlations_stages.input_rows_total, 3);
        assert!(snapshot.correlations_stages.collect_ns_total > 0);
        assert!(snapshot.correlations_stages.extract_ns_total > 0);
        assert!(snapshot.correlations_stages.pair_calc_ns_total > 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn warm_correlation_matrix_cache_stores_empty_payload_for_insufficient_numeric_columns() {
        let df = DataFrame::new(3, vec![Series::new("label".into(), ["x", "y", "z"]).into()])
            .expect("dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let revision = state.dataset_revision();

        spawn_correlation_matrix_warmup(state.clone())
            .await
            .expect("warmup task should join");

        let cached = state
            .cached_correlation_matrix(revision)
            .expect("warmup should cache empty matrix payload");
        assert!(cached.columns.is_empty());
        assert!(cached.pearson_raw.is_empty());
        assert!(cached.spearman_raw.is_empty());
        assert!(cached.kendall_raw.is_empty());
        assert!(cached.pearson_diff.is_empty());
        assert!(cached.spearman_diff.is_empty());
        assert!(cached.kendall_diff.is_empty());
        assert!(cached.counts.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_correlations_execute_the_canonical_plan_without_active_cache_pollution() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("ts".into(), [1_i64, 2, 3]).into(),
                Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
                Series::new("c".into(), [3.0_f64, 2.0, 1.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let revision = state.dataset_revision();

        let response = scatter_correlations_response(
            state.clone(),
            ScatterCorrelationsQuery {
                base: Some("a".to_string()),
                threshold: Some(0.7),
                mode: Some(CorrelationMode::SpearmanDiff),
                include_global_top_pairs: true,
                cleaning_plan: empty_envelope(&state),
            },
        )
        .await
        .expect("scatter correlations request should succeed");

        assert_eq!(
            response
                .headers()
                .get("x-edatime-source-version")
                .and_then(|value| value.to_str().ok()),
            Some("source-0")
        );
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body");
        let response: serde_json::Value = serde_json::from_slice(&body).expect("response JSON");
        assert_eq!(response["base_column"], "a");
        assert_eq!(response["mode"], "spearman_diff");
        assert!(
            state.cached_correlation_matrix(revision).is_none(),
            "a canonical plan must not populate the unplanned active-dataset cache"
        );
    }

    fn budget_frame(rows: usize) -> DataFrame {
        DataFrame::new(
            rows,
            vec![
                Series::new("ts".into(), (0..rows as i64).collect::<Vec<_>>()).into(),
                Series::new(
                    "a".into(),
                    (0..rows).map(|row| row as f64).collect::<Vec<_>>(),
                )
                .into(),
            ],
        )
        .expect("budget fixture")
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn correlation_budget_rejects_large_retained_source_when_active_source_is_small() {
        let mut config = AppConfig::default();
        config.budgets.max_correlation_work_units = 12;
        let state = AppState::new(budget_frame(10), config);
        let retained = empty_envelope(&state);
        state
            .replace_dataset(budget_frame(1))
            .await
            .expect("replace active source");
        let error = correlation_matrix_response(
            state.clone(),
            CorrelationMatrixQuery {
                mode: Some(CorrelationMode::PearsonRaw),
                cleaning_plan: retained.clone(),
            },
        )
        .await
        .expect_err("retained source exceeds row-pair budget");
        assert!(error.to_string().contains("correlation row-pair work"));
        let error = scatter_correlations_response(
            state,
            ScatterCorrelationsQuery {
                base: Some("a".to_string()),
                threshold: None,
                mode: Some(CorrelationMode::PearsonRaw),
                include_global_top_pairs: false,
                cleaning_plan: retained,
            },
        )
        .await
        .expect_err("base-only work must also use the requested source");
        assert!(error.to_string().contains("correlation row-pair work"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn correlation_budget_accepts_small_retained_source_when_active_source_is_large() {
        let mut config = AppConfig::default();
        config.budgets.max_correlation_work_units = 12;
        let state = AppState::new(budget_frame(2), config);
        let retained = empty_envelope(&state);
        state
            .replace_dataset(budget_frame(10))
            .await
            .expect("replace active source");
        correlation_matrix_response(
            state,
            CorrelationMatrixQuery {
                mode: Some(CorrelationMode::PearsonRaw),
                cleaning_plan: retained,
            },
        )
        .await
        .expect("small retained source remains within budget");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn correlation_budget_counts_filtered_rows_and_rejects_one_row_over_limit() {
        let mut config = AppConfig::default();
        config.budgets.max_correlation_work_units = 36;
        let state = AppState::new(budget_frame(20), config);
        for (mode, permitted_rows) in [(Some(CorrelationMode::PearsonRaw), 12), (None, 2)] {
            for extra_row in [0, 1] {
                let mut context = empty_envelope(&state);
                context.plan.stages = vec![
                    serde_json::from_value(serde_json::json!({
                        "kind": "timeRange", "id": "window", "enabled": true,
                        "executionClass": "polarsExpression", "scope": "row",
                        "sourcePage": "timeseries", "label": "window",
                        "createdAt": "now", "updatedAt": "now",
                        "startMs": 0.0, "endMs": (permitted_rows + extra_row - 1) as f64,
                        "mode": "keepInside"
                    }))
                    .expect("time-range stage"),
                ];
                let result = correlation_matrix_response(
                    state.clone(),
                    CorrelationMatrixQuery {
                        mode,
                        cleaning_plan: context,
                    },
                )
                .await;
                if extra_row == 1 {
                    let error = result.expect_err("do not return a silently truncated matrix");
                    assert!(error.to_string().contains("correlation row-pair work"));
                } else {
                    let response = result.expect("working rows at the budget remain exact");
                    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                        .await
                        .expect("body");
                    let data: serde_json::Value =
                        serde_json::from_slice(&body).expect("JSON matrix");
                    let value = data["pearson_raw"][0][1].as_f64().expect("coefficient");
                    assert!((value - 1.0).abs() < 1e-12);
                }
            }
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn correlation_cache_does_not_retain_results_with_oversized_column_names() {
        let name = format!("signal_{}", "x".repeat(2_000));
        let frame = DataFrame::new(
            3,
            vec![
                Series::new("ts".into(), [1_i64, 2, 3]).into(),
                Series::new(name.into(), [1.0_f64, 2.0, 3.0]).into(),
            ],
        )
        .expect("long column-name frame");
        let mut config = AppConfig::default();
        config.cache.max_bytes = 1024;
        let state = AppState::new(frame, config);
        for _ in 0..2 {
            correlation_matrix_response(
                state.clone(),
                CorrelationMatrixQuery {
                    mode: Some(CorrelationMode::PearsonRaw),
                    cleaning_plan: empty_envelope(&state),
                },
            )
            .await
            .expect("oversized cache result can still be returned");
        }
        assert_eq!(
            state
                .metrics
                .snapshot(0, 0)
                .correlations_stages
                .cache_hit_total,
            0,
            "result bytes must include complete column names"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn correlation_route_rejects_row_pair_work_above_configured_budget() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("ts".into(), [1_i64, 2, 3]).into(),
                Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let mut config = AppConfig::default();
        config.budgets.max_correlation_work_units = 1;
        let state = AppState::new(df, config);
        let error = scatter_correlations_response(
            state.clone(),
            ScatterCorrelationsQuery {
                base: Some("a".to_string()),
                threshold: Some(0.7),
                mode: Some(CorrelationMode::PearsonRaw),
                include_global_top_pairs: true,
                cleaning_plan: empty_envelope(&state),
            },
        )
        .await
        .expect_err("work over the configured budget must fail before correlation computation");
        assert!(error.to_string().contains("correlation row-pair work"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn base_only_correlations_skip_global_pairs_and_keep_suggestions() {
        let df = DataFrame::new(
            4,
            vec![
                Series::new("ts".into(), [1_i64, 2, 3, 4]).into(),
                Series::new("a".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0, 6.0, 8.0]).into(),
                Series::new("c".into(), [4.0_f64, 3.0, 2.0, 1.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let response = scatter_correlations_response(
            state.clone(),
            ScatterCorrelationsQuery {
                base: Some("a".to_string()),
                threshold: Some(0.9),
                mode: Some(CorrelationMode::PearsonRaw),
                include_global_top_pairs: false,
                cleaning_plan: empty_envelope(&state),
            },
        )
        .await
        .expect("base-only correlation request should succeed");
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body");
        let response: serde_json::Value = serde_json::from_slice(&body).expect("response JSON");
        assert_eq!(response["base_column"], "a");
        assert!(response["top_pairs"].as_array().unwrap().is_empty());
        assert_eq!(response["correlations"].as_array().unwrap().len(), 3);
        assert_eq!(response["suggestions"].as_array().unwrap().len(), 3);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn correlation_route_rejects_pair_work_above_configured_budget() {
        let df = DataFrame::new(
            2,
            vec![
                Series::new("ts".into(), [1_i64, 2]).into(),
                Series::new("a".into(), [1.0_f64, 2.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let mut config = AppConfig::default();
        config.budgets.max_scatter_matrix_pairs = 1;
        let state = AppState::new(df, config);
        let error = scatter_correlations_response(
            state.clone(),
            ScatterCorrelationsQuery {
                base: Some("a".to_string()),
                threshold: Some(0.7),
                mode: Some(CorrelationMode::PearsonRaw),
                include_global_top_pairs: true,
                cleaning_plan: empty_envelope(&state),
            },
        )
        .await
        .expect_err("pair count over the configured limit must fail before collection");
        assert!(error.to_string().contains("correlation pair count"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn planned_scatter_correlations_use_filtered_source_without_polluting_active_cache() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("ts".into(), [1_i64, 2, 3]).into(),
                Series::new("a".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("b".into(), [2.0_f64, 4.0, 6.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let revision = state.dataset_revision();
        let version = state.current_dataset_version().expect("source version");
        let envelope = serde_json::json!({
            "plan": {
                "schemaVersion": 1,
                "id": "correlation-plan",
                "planRevision": 1,
                "sourceVersionId": version.id,
                "datasetRevision": version.revision,
                "datasetFingerprint": version.dataset_fingerprint,
                "schemaFingerprint": version.schema_fingerprint,
                "timeColumn": "ts",
                "sourceName": null,
                "stages": [{
                    "kind": "columnRange",
                    "id": "range-a",
                    "enabled": true,
                    "executionClass": "polarsExpression",
                    "scope": "row",
                    "sourcePage": "scatter",
                    "label": "keep upper rows",
                    "note": null,
                    "createdAt": "2026-07-15T00:00:00Z",
                    "updatedAt": "2026-07-15T00:00:00Z",
                    "column": "a",
                    "from": 2.0,
                    "to": 3.0,
                    "mode": "keepInside"
                }],
                "createdAt": "2026-07-15T00:00:00Z",
                "updatedAt": "2026-07-15T00:00:00Z"
            },
            "expectedPlanHash": null,
            "expectedSourceVersionId": version.id,
            "expectedDatasetRevision": version.revision
        });

        let response = scatter_correlations_response(
            state.clone(),
            ScatterCorrelationsQuery {
                base: Some("a".to_string()),
                threshold: Some(0.0),
                mode: Some(CorrelationMode::PearsonRaw),
                include_global_top_pairs: true,
                cleaning_plan: serde_json::from_value(envelope)
                    .expect("plan envelope should deserialize"),
            },
        )
        .await
        .expect("planned correlations request should succeed");

        assert!(
            response
                .headers()
                .get("x-edatime-plan-hash")
                .and_then(|value| value.to_str().ok())
                .is_some_and(|value| value != "none")
        );
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body");
        let response: serde_json::Value = serde_json::from_slice(&body).expect("response JSON");
        let b = response["correlations"]
            .as_array()
            .expect("correlations")
            .iter()
            .find(|item| item["column"] == "b")
            .expect("b correlation");
        assert_eq!(b["count"], 2);
        assert!(
            state.cached_correlation_matrix(revision).is_none(),
            "a plan-specific matrix must not be stored under the active dataset revision"
        );
    }
}
