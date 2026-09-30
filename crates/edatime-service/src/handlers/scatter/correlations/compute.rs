//! Correlation computation: column selection, aligned-pair extraction, the
//! per-metric matrix kernels and the mapping from cached matrices to response
//! rows. HTTP handlers and DTOs live in the parent module.

use std::sync::Arc;

use rayon::prelude::*;

use super::super::collect::series_to_scatter_values;
use super::super::{CorrelationItem, SuggestionItem, numeric_columns};
use super::*;
use crate::error::AppError;
use edatime_core::metrics::{AppMetrics, CorrelationStage};
use edatime_core::stats;
use polars::prelude::{LazyFrame, col};

pub(super) struct BaseCorrelationData {
    columns: Vec<String>,
    base_index: usize,
    mode_values: Vec<Option<f64>>,
    counts: Vec<usize>,
    diff_counts: Vec<usize>,
}

pub(super) fn select_correlation_columns(frame: LazyFrame, columns: &[String]) -> LazyFrame {
    frame.select(
        columns
            .iter()
            .map(|name| col(name.as_str()))
            .collect::<Vec<_>>(),
    )
}

pub(super) fn correlation_time_range(df: &polars::prelude::DataFrame) -> Option<[f64; 2]> {
    let times = crate::analytics::extract_ts_epoch_ms(df).ok()?;
    let mut valid = times.into_iter().filter(|value| value.is_finite());
    let first = valid.next()?;
    Some(valid.fold([first, first], |range, value| {
        [range[0].min(value), range[1].max(value)]
    }))
}

pub(super) fn collect_correlation_frame(
    frame: LazyFrame,
    columns: &[String],
    budget: Option<CorrelationWorkBudget>,
) -> Result<polars::prelude::DataFrame, AppError> {
    let mut frame = frame;
    let mut selected_columns = columns.to_vec();
    if let Ok(schema) = frame.collect_schema() {
        for (name, dtype) in schema.iter() {
            if matches!(dtype, polars::prelude::DataType::Datetime(_, _))
                && !selected_columns
                    .iter()
                    .any(|column| column == name.as_str())
            {
                selected_columns.push(name.to_string());
                break;
            }
        }
    }
    let selected = select_correlation_columns(frame, &selected_columns);
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

pub(super) fn compute_base_correlation_data(
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

pub(super) fn build_scatter_correlations_from_base_data(
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

pub(super) fn first_difference_pairs(
    x_values: &[Option<f64>],
    y_values: &[Option<f64>],
) -> Vec<[f64; 2]> {
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

pub(super) fn compute_pair_correlation(
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

pub(super) type CorrelationColumn = Vec<Option<f64>>;

/// Materialize each correlation column once, preserving row alignment for
/// nulls and non-finite values. Before this extraction phase, every pair
/// independently cast both source columns, multiplying conversion/allocation
/// work by the number of pairs.
pub(super) fn extract_correlation_columns(
    df: &polars::prelude::DataFrame,
    columns: &[String],
) -> Result<Vec<CorrelationColumn>, AppError> {
    columns
        .iter()
        .map(|column| series_to_scatter_values(df, column))
        .collect()
}

pub(super) fn collect_aligned_pairs(
    x_values: &[Option<f64>],
    y_values: &[Option<f64>],
) -> Vec<[f64; 2]> {
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
pub(super) struct PairCorrelationValues {
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

pub(super) fn compute_all_pair_correlations(
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

pub(super) fn compute_mode_pair_correlation(
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

pub(super) fn upper_triangle_indices(column_count: usize) -> Vec<(usize, usize)> {
    (0..column_count)
        .flat_map(|i| ((i + 1)..column_count).map(move |j| (i, j)))
        .collect()
}

/// Small and medium matrices are faster without Rayon scheduling overhead.
/// Wide matrices (at least 256 independent pairs, or 24 columns) use Rayon’s
/// bounded global pool; results are applied serially so no matrix locks or
/// shared mutable state enter the hot path.
pub(super) fn map_pair_indices<T: Send>(
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

pub(super) fn compute_correlation_data_for_mode(
    lf: LazyFrame,
    mode: CorrelationMode,
    metrics: Arc<AppMetrics>,
) -> Result<CorrelationMatrixData, AppError> {
    compute_correlation_data_for_mode_with_budget(lf, mode, metrics, None)
}

pub(super) fn compute_correlation_data_for_mode_with_budget(
    lf: LazyFrame,
    mode: CorrelationMode,
    metrics: Arc<AppMetrics>,
    budget: Option<CorrelationWorkBudget>,
) -> Result<CorrelationMatrixData, AppError> {
    let mut numeric = numeric_columns(lf.clone());
    numeric.sort();
    let mut data = CorrelationMatrixData {
        input_rows: 0,
        time_range_ms: None,
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
    data.input_rows = df.height();
    data.time_range_ms = correlation_time_range(&df);
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

pub(super) fn compute_correlation_matrix_with_budget(
    lf: LazyFrame,
    metrics: Arc<AppMetrics>,
    budget: Option<CorrelationWorkBudget>,
) -> Result<CorrelationMatrixData, AppError> {
    let mut numeric = numeric_columns(lf.clone());
    numeric.sort();

    if numeric.is_empty() {
        return Ok(CorrelationMatrixData {
            input_rows: 0,
            time_range_ms: None,
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
        input_rows: df.height(),
        time_range_ms: correlation_time_range(&df),
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

pub(super) fn build_scatter_correlations_from_matrix_data(
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
pub(super) fn top_pairs_from_matrix(
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
pub(super) fn effective_mode_count(
    raw_count: usize,
    diff_count: usize,
    mode: CorrelationMode,
) -> usize {
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
pub(super) fn build_scatter_correlations_from_cached_matrix(
    entry: CorrelationMatrixCacheEntry,
    requested_base: Option<&str>,
    threshold: f64,
    mode: CorrelationMode,
) -> Result<ScatterCorrelationsResponse, AppError> {
    let data = CorrelationMatrixData::from_cache(entry);
    build_scatter_correlations_from_matrix_data(&data, requested_base, threshold, mode)
}
