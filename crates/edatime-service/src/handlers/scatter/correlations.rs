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
use polars::prelude::LazyFrame;

use super::collect::series_to_scatter_values;
use super::{CorrelationItem, SuggestionItem, numeric_columns};
use crate::handlers::routes::cleaning::{PlanRequestEnvelope, compile_request_frame};
use crate::handlers::routes::shared::{ExecutionIdentity, add_execution_identity_headers};

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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScatterCorrelationsQuery {
    pub base: Option<String>,
    pub threshold: Option<f64>,
    pub mode: Option<CorrelationMode>,
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
    let revision = identity.source_revision;
    let metrics = Arc::clone(&state.metrics);

    if identity.plan_hash.is_none()
        && let Some(entry) = state.cached_correlation_matrix(revision)
    {
        let numeric_columns = entry.columns.len() as u64;
        metrics.record_correlation_request(true, mode_telemetry);
        metrics.record_correlation_input(numeric_columns, 0);
        return Ok(json_with_execution_identity(
            build_scatter_correlations_from_cached_matrix(
                entry,
                requested_base.as_deref(),
                threshold,
                mode,
            )?,
            &identity,
        ));
    }

    let _single_flight = if identity.plan_hash.is_none() {
        let guard = state.acquire_correlation_single_flight(revision).await;
        if let Some(entry) = state.cached_correlation_matrix(revision) {
            metrics.record_correlation_single_flight();
            metrics.record_correlation_request(true, mode_telemetry);
            metrics.record_correlation_input(entry.columns.len() as u64, 0);
            return Ok(json_with_execution_identity(
                build_scatter_correlations_from_cached_matrix(
                    entry,
                    requested_base.as_deref(),
                    threshold,
                    mode,
                )?,
                &identity,
            ));
        }
        Some(guard)
    } else {
        None
    };

    metrics.record_correlation_request(false, mode_telemetry);

    let executor = Arc::clone(&state.query_executor);
    let closure_metrics = Arc::clone(&metrics);
    let data = executor
        .run_interactive(CpuStage::Correlations, move || {
            compute_correlation_matrix(lf, Arc::clone(&closure_metrics))
        })
        .await
        .map_err(AppError::from)??;
    if identity.plan_hash.is_none() {
        state.store_correlation_matrix_if_current(revision, data.clone().into_cache());
    }
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

fn correlation_frame_with_plan(
    state: &AppState,
    cleaning_plan: &PlanRequestEnvelope,
) -> Result<(LazyFrame, ExecutionIdentity), AppError> {
    let (version, plan_hash, frame) = compile_request_frame(state, cleaning_plan)?;
    Ok((
        frame,
        ExecutionIdentity::from_version(version, Some(plan_hash)),
    ))
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

fn empty_matrix_response(columns: Vec<String>, mode: CorrelationMode) -> CorrelationMatrixResponse {
    let mut response = CorrelationMatrixResponse {
        columns,
        pearson_raw: None,
        spearman_raw: None,
        kendall_raw: None,
        pearson_diff: None,
        spearman_diff: None,
        kendall_diff: None,
    };

    match mode {
        CorrelationMode::PearsonRaw => response.pearson_raw = Some(vec![]),
        CorrelationMode::SpearmanRaw => response.spearman_raw = Some(vec![]),
        CorrelationMode::KendallRaw => response.kendall_raw = Some(vec![]),
        CorrelationMode::PearsonDiff => response.pearson_diff = Some(vec![]),
        CorrelationMode::SpearmanDiff => response.spearman_diff = Some(vec![]),
        CorrelationMode::KendallDiff => response.kendall_diff = Some(vec![]),
    }

    response
}

fn first_difference_pairs(pairs: &[[f64; 2]]) -> Vec<[f64; 2]> {
    pairs
        .windows(2)
        .map(|window| [window[1][0] - window[0][0], window[1][1] - window[0][1]])
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
}

fn compute_all_pair_correlations(
    i: usize,
    j: usize,
    values: &[CorrelationColumn],
) -> PairCorrelationValues {
    let pairs = collect_aligned_pairs(&values[i], &values[j]);
    let diff_pairs = first_difference_pairs(&pairs);
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
    }
}

fn compute_mode_pair_correlation(
    i: usize,
    j: usize,
    mode: CorrelationMode,
    values: &[CorrelationColumn],
) -> (usize, usize, Option<f64>) {
    let pairs = collect_aligned_pairs(&values[i], &values[j]);
    let diff_pairs = first_difference_pairs(&pairs);
    (i, j, compute_pair_correlation(mode, &pairs, &diff_pairs))
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
    let mut numeric = numeric_columns(lf.clone());
    numeric.sort();

    if numeric.is_empty() {
        return Ok(empty_matrix_response(vec![], mode));
    }

    let n = numeric.len();
    let mut selected = vec![vec![None; n]; n];
    let collect_start = std::time::Instant::now();
    let df = lf
        .with_new_streaming(true)
        .collect()
        .map_err(|e| AppError::internal(format!("correlation matrix collect: {}", e)))?;
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
    for (i, row) in selected.iter_mut().enumerate().take(n) {
        row[i] = Some(1.0);
    }
    for (i, j, value) in map_pair_indices(&upper_triangle_indices(n), |(i, j)| {
        compute_mode_pair_correlation(i, j, mode, &values)
    }) {
        selected[i][j] = value;
        selected[j][i] = value;
    }
    metrics.record_correlation_stage(
        CorrelationStage::PairCalc,
        pair_start.elapsed().as_nanos() as u64,
    );

    let mut response = empty_matrix_response(numeric, mode);
    match mode {
        CorrelationMode::PearsonRaw => response.pearson_raw = Some(selected),
        CorrelationMode::SpearmanRaw => response.spearman_raw = Some(selected),
        CorrelationMode::KendallRaw => response.kendall_raw = Some(selected),
        CorrelationMode::PearsonDiff => response.pearson_diff = Some(selected),
        CorrelationMode::SpearmanDiff => response.spearman_diff = Some(selected),
        CorrelationMode::KendallDiff => response.kendall_diff = Some(selected),
    }
    Ok(response)
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

    let collect_start = std::time::Instant::now();
    let df = lf
        .with_new_streaming(true)
        .collect()
        .map_err(|e| AppError::internal(format!("correlation matrix collect: {}", e)))?;
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
        pearson_raw[i][i] = Some(1.0);
        spearman_raw[i][i] = Some(1.0);
        kendall_raw[i][i] = Some(1.0);
        pearson_diff[i][i] = Some(1.0);
        spearman_diff[i][i] = Some(1.0);
        kendall_diff[i][i] = Some(1.0);
        counts[i][i] = df.height();
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
    }
    let pair_ns = pair_start.elapsed().as_nanos() as u64;
    metrics.record_correlation_stage(CorrelationStage::PairCalc, pair_ns);
    // The all_modes label reflects the work this function performs
    // (every matrix, raw + diff). Single-mode endpoints call this function
    // once and read just one of the matrices back; the request-level
    // label is still "all_modes" because that's how much CPU the cache
    // paid for. The per-request mode label is recorded by the handler
    // before this function runs.
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
            count: data.counts[base_index][index],
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
                count: data.counts[i][j],
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
                compute_correlation_matrix(lf, Arc::clone(&closure_metrics))
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
    let revision = identity.source_revision;
    let metrics = Arc::clone(&state.metrics);
    if identity.plan_hash.is_none()
        && let Some(entry) = state.cached_correlation_matrix(revision)
    {
        let numeric_columns = entry.columns.len() as u64;
        let data = CorrelationMatrixData::from_cache(entry);
        // Cache hit on the matrix endpoint is recorded against the
        // requested mode (or "all_modes" when None).
        let mode_telemetry = mode
            .map(|m| m.telemetry_mode())
            .unwrap_or(CorrelationTelemetryMode::AllModes);
        metrics.record_correlation_request(true, mode_telemetry);
        metrics.record_correlation_input(numeric_columns, 0);
        return Ok(json_with_execution_identity(
            match mode {
                Some(mode) => data.to_response_for_mode(mode),
                None => data.to_response(),
            },
            &identity,
        ));
    }

    let _single_flight = if identity.plan_hash.is_none() {
        let guard = state.acquire_correlation_single_flight(revision).await;
        if let Some(entry) = state.cached_correlation_matrix(revision) {
            let numeric_columns = entry.columns.len() as u64;
            let data = CorrelationMatrixData::from_cache(entry);
            metrics.record_correlation_single_flight();
            let mode_telemetry = mode
                .map(|m| m.telemetry_mode())
                .unwrap_or(CorrelationTelemetryMode::AllModes);
            metrics.record_correlation_request(true, mode_telemetry);
            metrics.record_correlation_input(numeric_columns, 0);
            return Ok(json_with_execution_identity(
                match mode {
                    Some(mode) => data.to_response_for_mode(mode),
                    None => data.to_response(),
                },
                &identity,
            ));
        }
        Some(guard)
    } else {
        None
    };

    if let Some(mode) = mode {
        metrics.record_correlation_request(false, mode.telemetry_mode());
        let closure_metrics = Arc::clone(&metrics);
        let response = state
            .query_executor
            .run_interactive(CpuStage::Correlations, move || {
                compute_correlation_matrix_for_mode(lf, mode, Arc::clone(&closure_metrics))
            })
            .await
            .map_err(AppError::from)??;
        return Ok(json_with_execution_identity(response, &identity));
    }

    metrics.record_correlation_request(false, CorrelationTelemetryMode::AllModes);
    let closure_metrics = Arc::clone(&metrics);
    let data = state
        .query_executor
        .run_interactive(CpuStage::Correlations, move || {
            compute_correlation_matrix(lf, Arc::clone(&closure_metrics))
        })
        .await
        .map_err(AppError::from)??;
    if identity.plan_hash.is_none() {
        state.store_correlation_matrix_if_current(revision, data.clone().into_cache());
    }
    Ok(json_with_execution_identity(data.to_response(), &identity))
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
        assert_eq!(response.correlations[0].count, 3);
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
        assert_eq!(result.pearson_diff, vec![vec![Some(1.0)]]);
        assert_eq!(result.spearman_diff, vec![vec![Some(1.0)]]);
        assert_eq!(result.kendall_diff, vec![vec![Some(1.0)]]);
        assert_eq!(result.counts, vec![vec![3]]);
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
            Some(vec![vec![Some(1.0), None], vec![None, Some(1.0)]])
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
