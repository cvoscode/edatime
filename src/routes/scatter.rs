use axum::{
    Json,
    extract::{Query, State},
};
use polars::prelude::*;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::validation::{MAX_SCATTER_LIMIT, validate_scatter_limit, validate_time_window};

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct ScatterFilterSpec {
    pub column: String,
    pub from: f64,
    pub to: f64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct ScatterLineFilterSpec {
    pub column: String,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    #[serde(default, alias = "keepAbove")]
    pub keep_above: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct ScatterPointsQuery {
    pub x: String,
    pub y: String,
    pub color: Option<String>,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub filters: Option<String>,
    pub line_filters: Option<String>,
    #[serde(default = "default_scatter_limit")]
    pub limit: usize,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScatterCorrelationsQuery {
    pub base: Option<String>,
    pub threshold: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ScatterPointsResponse {
    pub x: String,
    pub y: String,
    pub color: Option<String>,
    pub total_points: usize,
    pub returned_points: usize,
    pub points: Vec<[f64; 2]>,
    pub color_values: Option<Vec<f64>>,
    pub color_labels: Option<Vec<Option<String>>>,
    pub color_min: Option<f64>,
    pub color_max: Option<f64>,
}

enum ScatterColorColumn {
    Continuous(Vec<Option<f64>>),
    Categorical(Vec<Option<String>>),
}

struct SampledScatterRow {
    x: f64,
    y: f64,
    color_value: Option<f64>,
    color_label: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CorrelationItem {
    pub column: String,
    pub count: usize,
    pub pearson: Option<f64>,
    pub spearman: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ScatterCorrelationsResponse {
    pub base_column: String,
    pub threshold: f64,
    pub numeric_columns: Vec<String>,
    pub correlations: Vec<CorrelationItem>,
    pub suggestions: Vec<CorrelationItem>,
}

fn default_scatter_limit() -> usize {
    1_000_000
}

fn clamp_limit(limit: usize) -> usize {
    limit.clamp(1, MAX_SCATTER_LIMIT)
}

fn numeric_columns(df: &DataFrame) -> Vec<String> {
    df.get_column_names()
        .iter()
        .filter_map(|name| {
            let name_str = name.as_str();
            match df.column(name_str) {
                Ok(col)
                    if col.dtype().is_numeric()
                        || matches!(col.dtype(), DataType::Datetime(_, _) | DataType::Date) =>
                {
                    Some(name_str.to_string())
                }
                _ => None,
            }
        })
        .collect()
}

fn validate_scatter_column(df: &DataFrame, name: &str) -> Result<(), AppError> {
    let col = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Unknown column '{}': {}", name, e)))?;

    if !(col.dtype().is_numeric()
        || matches!(col.dtype(), DataType::Datetime(_, _) | DataType::Date))
    {
        return Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            name
        )));
    }

    Ok(())
}

fn validate_existing_column(df: &DataFrame, name: &str) -> Result<(), AppError> {
    df.column(name)
        .map(|_| ())
        .map_err(|e| AppError::bad_request(format!("Unknown column '{}': {}", name, e)))
}

fn temporal_unit_divisor(dtype: &DataType) -> i64 {
    match dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => 1_000_000,
        DataType::Datetime(TimeUnit::Microseconds, _) => 1_000,
        DataType::Datetime(TimeUnit::Milliseconds, _) => 1,
        DataType::Date => 1,
        _ => 1,
    }
}

fn series_to_scatter_values(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, AppError> {
    let series = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    match series.dtype() {
        dt if dt.is_numeric() => {
            let casted = series.cast(&DataType::Float64).map_err(|e| {
                AppError::internal(format!("Failed to cast '{}' to Float64: {}", name, e))
            })?;
            let vals = casted.f64().map_err(|e| {
                AppError::internal(format!("Failed to read '{}' as Float64: {}", name, e))
            })?;
            Ok(vals
                .into_iter()
                .map(|v| v.filter(|f| f.is_finite()))
                .collect())
        }
        DataType::Datetime(_, _) | DataType::Date => {
            let casted = series.cast(&DataType::Int64).map_err(|e| {
                AppError::internal(format!(
                    "Failed to cast temporal '{}' to Int64: {}",
                    name, e
                ))
            })?;
            let vals = casted.i64().map_err(|e| {
                AppError::internal(format!("Failed to read '{}' as Int64: {}", name, e))
            })?;

            let dtype = series.dtype();
            let divisor = temporal_unit_divisor(dtype);

            Ok(vals
                .into_iter()
                .map(|v| {
                    v.map(|raw| {
                        if matches!(dtype, DataType::Date) {
                            (raw * 86_400_000) as f64
                        } else {
                            (raw / divisor) as f64
                        }
                    })
                })
                .collect())
        }
        _ => Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            name
        ))),
    }
}

fn series_to_label_values(df: &DataFrame, name: &str) -> Result<Vec<Option<String>>, AppError> {
    let series = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    let casted = series.cast(&DataType::String).map_err(|e| {
        AppError::internal(format!("Failed to cast '{}' to String: {}", name, e))
    })?;
    let values = casted.str().map_err(|e| {
        AppError::internal(format!("Failed to read '{}' as String: {}", name, e))
    })?;

    Ok(values
        .into_iter()
        .map(|value| value.map(|text| text.to_string()))
        .collect())
}

fn collect_xy_pairs(df: &DataFrame, x: &str, y: &str) -> Result<Vec<[f64; 2]>, AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;

    let mut out = Vec::with_capacity(df.height());
    for (ox, oy) in x_vals.iter().zip(y_vals.iter()) {
        if let (Some(xv), Some(yv)) = (ox, oy) {
            if xv.is_finite() && yv.is_finite() {
                out.push([*xv, *yv]);
            }
        }
    }

    Ok(out)
}

fn stable_sample_slot(total_seen: usize) -> usize {
    let mut x = total_seen as u64;
    x ^= x >> 30;
    x = x.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x ^= x >> 27;
    x = x.wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^= x >> 31;
    (x % total_seen as u64) as usize
}

fn collect_sampled_xyc_rows(
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    limit: usize,
) -> Result<(usize, Vec<SampledScatterRow>), AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;
    let c_vals = if let Some(c) = color {
        let series = df
            .column(c)
            .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", c, e)))?;
        if series.dtype().is_numeric() || matches!(series.dtype(), DataType::Datetime(_, _) | DataType::Date) {
            Some(ScatterColorColumn::Continuous(series_to_scatter_values(df, c)?))
        } else {
            Some(ScatterColorColumn::Categorical(series_to_label_values(df, c)?))
        }
    } else {
        None
    };

    let mut sampled = Vec::with_capacity(limit.min(df.height()));
    let mut total_points = 0usize;

    for idx in 0..df.height() {
        let ox = x_vals.get(idx).copied().flatten();
        let oy = y_vals.get(idx).copied().flatten();
        let (Some(xv), Some(yv)) = (ox, oy) else {
            continue;
        };
        if !(xv.is_finite() && yv.is_finite()) {
            continue;
        }

        let (color_value, color_label) = match c_vals.as_ref() {
            Some(ScatterColorColumn::Continuous(values)) => (
                values
                    .get(idx)
                    .copied()
                    .flatten()
                    .filter(|value| value.is_finite()),
                None,
            ),
            Some(ScatterColorColumn::Categorical(values)) => (
                None,
                values.get(idx).cloned().flatten(),
            ),
            None => (None, None),
        };

        total_points += 1;
        let row = SampledScatterRow {
            x: xv,
            y: yv,
            color_value,
            color_label,
        };
        if sampled.len() < limit {
            sampled.push(row);
        } else {
            let slot = stable_sample_slot(total_points);
            if slot < limit {
                sampled[slot] = row;
            }
        }
    }

    sampled.sort_by(|a, b| a.x.total_cmp(&b.x));
    Ok((total_points, sampled))
}

fn parse_scatter_filters(raw: Option<&str>) -> Result<Vec<ScatterFilterSpec>, AppError> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(Vec::new());
    };

    serde_json::from_str::<Vec<ScatterFilterSpec>>(raw)
        .map_err(|e| AppError::bad_request(format!("Invalid scatter filters payload: {}", e)))
}

fn parse_scatter_line_filters(raw: Option<&str>) -> Result<Vec<ScatterLineFilterSpec>, AppError> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(Vec::new());
    };

    serde_json::from_str::<Vec<ScatterLineFilterSpec>>(raw)
        .map_err(|e| AppError::bad_request(format!("Invalid scatter line filters payload: {}", e)))
}

fn temporal_value_to_native(
    value_ms: f64,
    dtype: &DataType,
    round_up: bool,
) -> Result<i64, AppError> {
    if !value_ms.is_finite() {
        return Err(AppError::bad_request("Temporal range value must be finite"));
    }

    let scaled = match dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => value_ms * 1_000_000.0,
        DataType::Datetime(TimeUnit::Microseconds, _) => value_ms * 1_000.0,
        DataType::Datetime(TimeUnit::Milliseconds, _) => value_ms,
        DataType::Date => value_ms / 86_400_000.0,
        _ => value_ms,
    };

    let rounded = if round_up {
        scaled.ceil()
    } else {
        scaled.floor()
    };
    if rounded < i64::MIN as f64 || rounded > i64::MAX as f64 {
        return Err(AppError::bad_request(
            "Temporal range is outside supported bounds",
        ));
    }

    Ok(rounded as i64)
}

fn build_numeric_range_expr(column: &str, from: f64, to: f64) -> Expr {
    col(column)
        .cast(DataType::Float64)
        .gt_eq(lit(from))
        .and(col(column).cast(DataType::Float64).lt_eq(lit(to)))
}

fn temporal_ms_expr(column: &str, dtype: &DataType) -> Expr {
    match dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => {
            col(column).cast(DataType::Float64) / lit(1_000_000.0)
        }
        DataType::Datetime(TimeUnit::Microseconds, _) => {
            col(column).cast(DataType::Float64) / lit(1_000.0)
        }
        DataType::Datetime(TimeUnit::Milliseconds, _) => col(column).cast(DataType::Float64),
        DataType::Date => col(column).cast(DataType::Float64) * lit(86_400_000.0),
        _ => col(column).cast(DataType::Float64),
    }
}

fn build_temporal_range_expr(
    column: &str,
    dtype: &DataType,
    from: f64,
    to: f64,
) -> Result<Expr, AppError> {
    let start = temporal_value_to_native(from, dtype, false)?;
    let end = temporal_value_to_native(to, dtype, true)?;

    Ok(col(column)
        .cast(DataType::Int64)
        .gt_eq(lit(start))
        .and(col(column).cast(DataType::Int64).lt_eq(lit(end))))
}

fn apply_scatter_filters(
    df: &DataFrame,
    start: Option<f64>,
    end: Option<f64>,
    filters: &[ScatterFilterSpec],
    line_filters: &[ScatterLineFilterSpec],
) -> Result<LazyFrame, AppError> {
    let mut lf = df.clone().lazy();

    if let (Some(start_ms), Some(end_ms)) = (start, end) {
        let ts_col = df.column("ts").map_err(|e| {
            AppError::bad_request(format!("Missing ts column for linked scatter range: {}", e))
        })?;
        let ts_dtype = ts_col.dtype().clone();
        let start_native = temporal_value_to_native(start_ms.min(end_ms), &ts_dtype, false)?;
        let end_native = temporal_value_to_native(start_ms.max(end_ms), &ts_dtype, true)?;
        lf = lf
            .filter(col("ts").cast(DataType::Int64).gt_eq(lit(start_native)))
            .filter(col("ts").cast(DataType::Int64).lt_eq(lit(end_native)));
    }

    for filter in filters {
        let column = filter.column.trim();
        if column.is_empty() {
            continue;
        }

        validate_scatter_column(df, column)?;
        let series = df.column(column).map_err(|e| {
            AppError::bad_request(format!("Unknown filter column '{}': {}", column, e))
        })?;
        let from = filter.from.min(filter.to);
        let to = filter.from.max(filter.to);
        let expr = match series.dtype() {
            dt if dt.is_numeric() => build_numeric_range_expr(column, from, to),
            DataType::Datetime(_, _) | DataType::Date => {
                build_temporal_range_expr(column, series.dtype(), from, to)?
            }
            _ => {
                return Err(AppError::bad_request(format!(
                    "Filter column '{}' is not numeric or temporal",
                    column
                )));
            }
        };
        lf = lf.filter(expr);
    }

    if !line_filters.is_empty() {
        let ts_series = df.column("ts").map_err(|e| {
            AppError::bad_request(format!("Missing ts column for adaptive filter: {}", e))
        })?;
        let ts_expr = temporal_ms_expr("ts", ts_series.dtype());

        for filter in line_filters {
            let column = filter.column.trim();
            if column.is_empty() || filter.x1 == filter.x2 {
                continue;
            }

            let series = df.column(column).map_err(|e| {
                AppError::bad_request(format!(
                    "Unknown adaptive filter column '{}': {}",
                    column, e
                ))
            })?;

            if !series.dtype().is_numeric() {
                return Err(AppError::bad_request(format!(
                    "Adaptive filter column '{}' must be numeric",
                    column
                )));
            }

            let min_x = filter.x1.min(filter.x2);
            let max_x = filter.x1.max(filter.x2);
            let slope = (filter.y2 - filter.y1) / (filter.x2 - filter.x1);
            let line_expr = lit(filter.y1) + ((ts_expr.clone() - lit(filter.x1)) * lit(slope));
            let cmp_expr = if filter.keep_above {
                col(column).cast(DataType::Float64).gt_eq(line_expr)
            } else {
                col(column).cast(DataType::Float64).lt_eq(line_expr)
            };
            let within_expr = ts_expr
                .clone()
                .gt_eq(lit(min_x))
                .and(ts_expr.clone().lt_eq(lit(max_x)));
            lf = lf.filter(within_expr.not().or(cmp_expr));
        }
    }

    Ok(lf)
}

fn collect_filtered_scatter_frame(
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    start: Option<f64>,
    end: Option<f64>,
    filters: &[ScatterFilterSpec],
    line_filters: &[ScatterLineFilterSpec],
) -> Result<DataFrame, AppError> {
    validate_scatter_column(df, x)?;
    validate_scatter_column(df, y)?;
    if let Some(c) = color {
        validate_existing_column(df, c)?;
    }

    let lf = apply_scatter_filters(df, start, end, filters, line_filters)?;

    let mut selected_columns = Vec::with_capacity(3);
    for name in [Some(x), Some(y), color].into_iter().flatten() {
        if !selected_columns.contains(&name) {
            selected_columns.push(name);
        }
    }

    let select_exprs = selected_columns
        .into_iter()
        .map(col)
        .collect::<Vec<_>>();

    lf.select(select_exprs)
        .collect()
        .map_err(|e| AppError::io(e.to_string()))
}

fn pearson_from_pairs(pairs: &[[f64; 2]]) -> Option<f64> {
    if pairs.len() < 2 {
        return None;
    }

    let n = pairs.len() as f64;
    let mut sum_x = 0.0f64;
    let mut sum_y = 0.0f64;
    let mut sum_xy = 0.0f64;
    let mut sum_x2 = 0.0f64;
    let mut sum_y2 = 0.0f64;

    for [x, y] in pairs {
        sum_x += *x;
        sum_y += *y;
        sum_xy += *x * *y;
        sum_x2 += *x * *x;
        sum_y2 += *y * *y;
    }

    let cov = n * sum_xy - sum_x * sum_y;
    let var_x = n * sum_x2 - sum_x * sum_x;
    let var_y = n * sum_y2 - sum_y * sum_y;
    let denom = (var_x * var_y).sqrt();

    if !denom.is_finite() || denom <= f64::EPSILON {
        return None;
    }

    Some((cov / denom).clamp(-1.0, 1.0))
}

fn rank_with_ties(values: &[f64]) -> Vec<f64> {
    let mut indexed: Vec<(usize, f64)> = values.iter().copied().enumerate().collect();
    indexed.sort_by(|a, b| a.1.total_cmp(&b.1));

    let mut ranks = vec![0.0f64; values.len()];
    let mut i = 0usize;

    while i < indexed.len() {
        let mut j = i + 1;
        while j < indexed.len() && indexed[j].1 == indexed[i].1 {
            j += 1;
        }

        let avg_rank = ((i + 1 + j) as f64) / 2.0;
        for k in i..j {
            ranks[indexed[k].0] = avg_rank;
        }
        i = j;
    }

    ranks
}

fn spearman_from_pairs(pairs: &[[f64; 2]]) -> Option<f64> {
    if pairs.len() < 2 {
        return None;
    }

    let xs: Vec<f64> = pairs.iter().map(|p| p[0]).collect();
    let ys: Vec<f64> = pairs.iter().map(|p| p[1]).collect();
    let rx = rank_with_ties(&xs);
    let ry = rank_with_ties(&ys);

    let ranked_pairs: Vec<[f64; 2]> = rx.into_iter().zip(ry).map(|(x, y)| [x, y]).collect();

    pearson_from_pairs(&ranked_pairs)
}

fn build_correlation_item(
    df: &DataFrame,
    base: &str,
    other: &str,
) -> Result<CorrelationItem, AppError> {
    let pairs = collect_xy_pairs(df, base, other)?;
    let pearson = pearson_from_pairs(&pairs);
    let spearman = spearman_from_pairs(&pairs);

    Ok(CorrelationItem {
        column: other.to_string(),
        count: pairs.len(),
        pearson,
        spearman,
    })
}

#[tracing::instrument(skip(state))]
pub async fn get_scatter_points(
    State(state): State<AppState>,
    Query(params): Query<ScatterPointsQuery>,
) -> Result<Json<ScatterPointsResponse>, AppError> {
    scatter_points_response(state, params).await
}

#[tracing::instrument(skip(state))]
pub async fn post_scatter_points(
    State(state): State<AppState>,
    Json(params): Json<ScatterPointsQuery>,
) -> Result<Json<ScatterPointsResponse>, AppError> {
    scatter_points_response(state, params).await
}

async fn scatter_points_response(
    state: AppState,
    params: ScatterPointsQuery,
) -> Result<Json<ScatterPointsResponse>, AppError> {
    tracing::info!(
        "get_scatter_points called with x='{}', y='{}', color={:?}, limit={}",
        params.x,
        params.y,
        params.color,
        params.limit
    );

    let df = state.dataset_snapshot().await;

    let x = params.x.clone();
    let y = params.y.clone();
    let color = params.color.clone().filter(|s| !s.trim().is_empty());
    let start = params.start;
    let end = params.end;
    let filters = parse_scatter_filters(params.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(params.line_filters.as_deref())?;
    let limit = clamp_limit(params.limit);
    validate_scatter_limit(limit)?;
    if let (Some(start_ms), Some(end_ms)) = (start, end) {
        let start_dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(start_ms as i64)
            .ok_or_else(|| {
                AppError::bad_request("Scatter start is outside the supported timestamp range")
            })?;
        let end_dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(end_ms as i64)
            .ok_or_else(|| {
                AppError::bad_request("Scatter end is outside the supported timestamp range")
            })?;
        validate_time_window(start_dt, end_dt)?;
    }
    let metrics = state.metrics.clone();

    let response = tokio::task::spawn_blocking(move || {
        let filtered_df = collect_filtered_scatter_frame(
            &df,
            &x,
            &y,
            color.as_deref(),
            start,
            end,
            &filters,
            &line_filters,
        )?;
        let (total_points, sampled_rows) =
            collect_sampled_xyc_rows(&filtered_df, &x, &y, color.as_deref(), limit)?;

        let mut points: Vec<[f64; 2]> = Vec::with_capacity(sampled_rows.len());
        let mut color_values: Option<Vec<f64>> = color
            .as_ref()
            .map(|_| Vec::with_capacity(sampled_rows.len()));

        let mut cmin = f64::INFINITY;
        let mut cmax = f64::NEG_INFINITY;

        let mut color_labels: Option<Vec<Option<String>>> = color.as_ref().map(|_| Vec::new());

        for row in sampled_rows {
            points.push([row.x, row.y]);
            if let Some(ref mut out_cv) = color_values {
                let v = row.color_value.unwrap_or(f64::NAN);
                out_cv.push(v);
                if v.is_finite() {
                    if v < cmin {
                        cmin = v;
                    }
                    if v > cmax {
                        cmax = v;
                    }
                }
            }
            if let Some(ref mut out_labels) = color_labels {
                out_labels.push(row.color_label);
            }
        }

        if color_values.is_some() {
            color_labels = None;
        }

        Ok::<ScatterPointsResponse, AppError>(ScatterPointsResponse {
            x,
            y,
            color,
            total_points,
            returned_points: points.len(),
            points,
            color_values,
            color_labels,
            color_min: if cmin.is_finite() { Some(cmin) } else { None },
            color_max: if cmax.is_finite() { Some(cmax) } else { None },
        })
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join scatter points task: {:?}", e)))??;

    metrics.record_scatter_sampling(response.total_points, response.returned_points);
    Ok(Json(response))
}

#[tracing::instrument(skip(state))]
pub async fn get_scatter_correlations(
    State(state): State<AppState>,
    Query(params): Query<ScatterCorrelationsQuery>,
) -> Result<Json<ScatterCorrelationsResponse>, AppError> {
    tracing::info!(
        "get_scatter_correlations called with base={:?}, threshold={:?}",
        params.base,
        params.threshold
    );

    let df = state.dataset_snapshot().await;

    let threshold = params.threshold.unwrap_or(0.7).clamp(0.0, 1.0);
    let requested_base = params.base.clone();

    tokio::task::spawn_blocking(move || {
        let mut numeric = numeric_columns(&df);
        numeric.sort();

        if numeric.len() < 2 {
            return Err(AppError::bad_request(
                "Need at least two numeric columns for scatter correlations",
            ));
        }

        let base_column = if let Some(base) = requested_base {
            if !numeric.iter().any(|c| c == &base) {
                return Err(AppError::bad_request(format!(
                    "Base column '{}' is not numeric/temporal",
                    base
                )));
            }
            base
        } else {
            numeric
                .iter()
                .find(|c| c.as_str() != "ts")
                .cloned()
                .unwrap_or_else(|| numeric[0].clone())
        };

        let mut correlations = Vec::new();
        for col in numeric.iter().filter(|c| *c != &base_column) {
            correlations.push(build_correlation_item(&df, &base_column, col)?);
        }

        correlations.sort_by(|a, b| {
            let a_score = a
                .pearson
                .map(|v| v.abs())
                .unwrap_or(0.0)
                .max(a.spearman.map(|v| v.abs()).unwrap_or(0.0));
            let b_score = b
                .pearson
                .map(|v| v.abs())
                .unwrap_or(0.0)
                .max(b.spearman.map(|v| v.abs()).unwrap_or(0.0));
            b_score.total_cmp(&a_score)
        });

        let suggestions: Vec<CorrelationItem> = correlations
            .iter()
            .filter(|item| {
                item.pearson.map(|v| v.abs()).unwrap_or(0.0) >= threshold
                    || item.spearman.map(|v| v.abs()).unwrap_or(0.0) >= threshold
            })
            .cloned()
            .collect();

        Ok(Json(ScatterCorrelationsResponse {
            base_column,
            threshold,
            numeric_columns: numeric,
            correlations,
            suggestions,
        }))
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join scatter correlation task: {:?}", e)))?
}

// ── Distribution histograms ──────────────────────────────────────────────────

const MAX_DISTRIBUTION_BINS: usize = 100;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DistributionsGetQuery {
    pub columns: String,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub filters: Option<String>,
    pub line_filters: Option<String>,
    pub bins: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DistributionsPostBody {
    pub columns: Vec<String>,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub filters: Option<Vec<ScatterFilterSpec>>,
    pub line_filters: Option<Vec<ScatterLineFilterSpec>>,
    pub bins: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct ColumnHistogramData {
    pub bin_edges: Vec<f64>,
    pub counts: Vec<u64>,
}

#[derive(Debug, Serialize)]
pub struct ColumnDistributionResult {
    pub name: String,
    pub dtype: String,
    pub count: usize,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std_dev: Option<f64>,
    pub median: Option<f64>,
    pub q1: Option<f64>,
    pub q3: Option<f64>,
    pub histogram: Option<ColumnHistogramData>,
}

#[derive(Debug, Serialize)]
pub struct DistributionsResponse {
    pub total_rows: usize,
    pub columns: Vec<ColumnDistributionResult>,
}

fn build_distribution_histogram(values: &[f64], min: f64, max: f64, bins: usize) -> Option<ColumnHistogramData> {
    if values.is_empty() {
        return None;
    }

    let bins = bins.clamp(2, MAX_DISTRIBUTION_BINS);

    if max <= min {
        return Some(ColumnHistogramData {
            bin_edges: vec![min, max],
            counts: vec![values.len() as u64],
        });
    }

    let span = max - min;
    let mut counts = vec![0u64; bins];
    for &v in values {
        let mut idx = ((v - min) / span * bins as f64).floor() as isize;
        idx = idx.clamp(0, bins as isize - 1);
        counts[idx as usize] += 1;
    }

    let bin_edges: Vec<f64> = (0..=bins)
        .map(|i| min + span * i as f64 / bins as f64)
        .collect();

    Some(ColumnHistogramData { bin_edges, counts })
}

fn compute_column_stats(
    values: &[f64],
) -> (Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<f64>) {
    if values.is_empty() {
        return (None, None, None, None, None, None, None);
    }

    let n = values.len() as f64;
    let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let mean = values.iter().sum::<f64>() / n;
    let variance = values.iter().map(|&v| (v - mean).powi(2)).sum::<f64>() / n;
    let std_dev = variance.sqrt();

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));

    let percentile = |p: f64| -> Option<f64> {
        let idx = p * (sorted.len().saturating_sub(1)) as f64;
        let lo = idx.floor() as usize;
        let hi = idx.ceil() as usize;
        if lo >= sorted.len() {
            return Some(sorted[sorted.len() - 1]);
        }
        if hi >= sorted.len() || lo == hi {
            return Some(sorted[lo]);
        }
        let frac = idx - lo as f64;
        Some(sorted[lo] * (1.0 - frac) + sorted[hi] * frac)
    };

    (
        Some(min),
        Some(max),
        Some(mean),
        Some(std_dev),
        percentile(0.5),
        percentile(0.25),
        percentile(0.75),
    )
}

#[tracing::instrument(skip(state))]
pub async fn get_distributions(
    State(state): State<AppState>,
    Query(query): Query<DistributionsGetQuery>,
) -> Result<Json<DistributionsResponse>, AppError> {
    let columns: Vec<String> = query
        .columns
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let filters = parse_scatter_filters(query.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(query.line_filters.as_deref())?;
    let bins = query.bins.unwrap_or(24);
    compute_distributions(state, columns, query.start, query.end, filters, line_filters, bins).await
}

#[tracing::instrument(skip(state))]
pub async fn post_distributions(
    State(state): State<AppState>,
    Json(body): Json<DistributionsPostBody>,
) -> Result<Json<DistributionsResponse>, AppError> {
    let bins = body.bins.unwrap_or(24);
    let filters = body.filters.unwrap_or_default();
    let line_filters = body.line_filters.unwrap_or_default();
    compute_distributions(state, body.columns, body.start, body.end, filters, line_filters, bins).await
}

async fn compute_distributions(
    state: AppState,
    columns: Vec<String>,
    start: Option<f64>,
    end: Option<f64>,
    filters: Vec<ScatterFilterSpec>,
    line_filters: Vec<ScatterLineFilterSpec>,
    bins: usize,
) -> Result<Json<DistributionsResponse>, AppError> {
    if columns.is_empty() {
        return Err(AppError::bad_request("At least one column is required"));
    }

    let bins = bins.clamp(2, MAX_DISTRIBUTION_BINS);

    let df = state.dataset_snapshot().await;

    let total_rows = df.height();
    if total_rows == 0 {
        return Ok(Json(DistributionsResponse {
            total_rows: 0,
            columns: vec![],
        }));
    }

    tokio::task::spawn_blocking(move || {
        // Resolve which columns are compatible (numeric or temporal); silently skip others
        let mut valid_columns: Vec<String> = Vec::new();
        for name in &columns {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(series) = df.column(trimmed) {
                let dtype = series.dtype();
                if dtype.is_numeric()
                    || matches!(dtype, DataType::Datetime(_, _) | DataType::Date)
                {
                    if !valid_columns.iter().any(|c: &String| c == trimmed) {
                        valid_columns.push(trimmed.to_string());
                    }
                }
            }
        }

        if valid_columns.is_empty() {
            return Ok(Json(DistributionsResponse {
                total_rows,
                columns: vec![],
            }));
        }

        let lf = apply_scatter_filters(&df, start, end, &filters, &line_filters)?;
        let select_exprs: Vec<Expr> = valid_columns.iter().map(|c| col(c.as_str())).collect();
        let filtered_df = lf
            .select(select_exprs)
            .collect()
            .map_err(|e| AppError::io(e.to_string()))?;

        let filtered_rows = filtered_df.height();
        let mut results = Vec::with_capacity(valid_columns.len());

        for col_name in &valid_columns {
            let dtype_str = df
                .column(col_name)
                .map(|s| format!("{}", s.dtype()))
                .unwrap_or_default();

            let values: Vec<f64> = match series_to_scatter_values(&filtered_df, col_name) {
                Ok(vals) => vals.into_iter().flatten().collect(),
                Err(_) => continue,
            };

            let count = values.len();
            let (min, max, mean, std_dev, median, q1, q3) = compute_column_stats(&values);

            let histogram = match (min, max) {
                (Some(mn), Some(mx)) => build_distribution_histogram(&values, mn, mx, bins),
                _ => None,
            };

            results.push(ColumnDistributionResult {
                name: col_name.clone(),
                dtype: dtype_str,
                count,
                min,
                max,
                mean,
                std_dev,
                median,
                q1,
                q3,
                histogram,
            });
        }

        Ok(Json(DistributionsResponse {
            total_rows: filtered_rows,
            columns: results,
        }))
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join distributions task: {:?}", e)))?
}
