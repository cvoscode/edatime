use axum::{
    extract::{Query, State},
    Json,
};
use polars::prelude::*;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize, Clone)]
pub struct ScatterFilterSpec {
    pub column: String,
    pub from: f64,
    pub to: f64,
}

#[derive(Debug, Deserialize, Clone)]
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
    pub color_min: Option<f64>,
    pub color_max: Option<f64>,
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
    limit.clamp(1, 5_000_000)
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
        .map_err(|e| AppError::BadRequest(format!("Unknown column '{}': {}", name, e)))?;

    if !(col.dtype().is_numeric() || matches!(col.dtype(), DataType::Datetime(_, _) | DataType::Date)) {
        return Err(AppError::BadRequest(format!(
            "Column '{}' is not numeric or temporal",
            name
        )));
    }

    Ok(())
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
        .map_err(|e| AppError::BadRequest(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    match series.dtype() {
        dt if dt.is_numeric() => {
            let casted = series
                .cast(&DataType::Float64)
                .map_err(|e| AppError::Internal(format!("Failed to cast '{}' to Float64: {}", name, e)))?;
            let vals = casted
                .f64()
                .map_err(|e| AppError::Internal(format!("Failed to read '{}' as Float64: {}", name, e)))?;
            Ok(vals
                .into_iter()
                .map(|v| v.filter(|f| f.is_finite()))
                .collect())
        }
        DataType::Datetime(_, _) | DataType::Date => {
            let casted = series
                .cast(&DataType::Int64)
                .map_err(|e| AppError::Internal(format!("Failed to cast temporal '{}' to Int64: {}", name, e)))?;
            let vals = casted
                .i64()
                .map_err(|e| AppError::Internal(format!("Failed to read '{}' as Int64: {}", name, e)))?;

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
        _ => Err(AppError::BadRequest(format!(
            "Column '{}' is not numeric or temporal",
            name
        ))),
    }
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

fn collect_xyc_rows(
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
) -> Result<Vec<(f64, f64, Option<f64>)>, AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;
    let c_vals = if let Some(c) = color {
        Some(series_to_scatter_values(df, c)?)
    } else {
        None
    };

    let mut out = Vec::with_capacity(df.height());
    for idx in 0..df.height() {
        let ox = x_vals.get(idx).copied().flatten();
        let oy = y_vals.get(idx).copied().flatten();
        if let (Some(xv), Some(yv)) = (ox, oy) {
            if !(xv.is_finite() && yv.is_finite()) {
                continue;
            }
            let cv = c_vals
                .as_ref()
                .and_then(|vals| vals.get(idx).copied().flatten())
                .filter(|v| v.is_finite());
            out.push((xv, yv, cv));
        }
    }

    Ok(out)
}

fn parse_scatter_filters(raw: Option<&str>) -> Result<Vec<ScatterFilterSpec>, AppError> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(Vec::new());
    };

    serde_json::from_str::<Vec<ScatterFilterSpec>>(raw)
        .map_err(|e| AppError::BadRequest(format!("Invalid scatter filters payload: {}", e)))
}

fn parse_scatter_line_filters(raw: Option<&str>) -> Result<Vec<ScatterLineFilterSpec>, AppError> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(Vec::new());
    };

    serde_json::from_str::<Vec<ScatterLineFilterSpec>>(raw)
        .map_err(|e| AppError::BadRequest(format!("Invalid scatter line filters payload: {}", e)))
}

fn temporal_value_to_native(value_ms: f64, dtype: &DataType, round_up: bool) -> Result<i64, AppError> {
    if !value_ms.is_finite() {
        return Err(AppError::BadRequest("Temporal range value must be finite".into()));
    }

    let scaled = match dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => value_ms * 1_000_000.0,
        DataType::Datetime(TimeUnit::Microseconds, _) => value_ms * 1_000.0,
        DataType::Datetime(TimeUnit::Milliseconds, _) => value_ms,
        DataType::Date => value_ms / 86_400_000.0,
        _ => value_ms,
    };

    let rounded = if round_up { scaled.ceil() } else { scaled.floor() };
    if rounded < i64::MIN as f64 || rounded > i64::MAX as f64 {
        return Err(AppError::BadRequest("Temporal range is outside supported bounds".into()));
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
        DataType::Datetime(TimeUnit::Nanoseconds, _) => col(column).cast(DataType::Float64) / lit(1_000_000.0),
        DataType::Datetime(TimeUnit::Microseconds, _) => col(column).cast(DataType::Float64) / lit(1_000.0),
        DataType::Datetime(TimeUnit::Milliseconds, _) => col(column).cast(DataType::Float64),
        DataType::Date => col(column).cast(DataType::Float64) * lit(86_400_000.0),
        _ => col(column).cast(DataType::Float64),
    }
}

fn build_temporal_range_expr(column: &str, dtype: &DataType, from: f64, to: f64) -> Result<Expr, AppError> {
    let start = temporal_value_to_native(from, dtype, false)?;
    let end = temporal_value_to_native(to, dtype, true)?;

    Ok(col(column)
        .cast(DataType::Int64)
        .gt_eq(lit(start))
        .and(col(column).cast(DataType::Int64).lt_eq(lit(end))))
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
        validate_scatter_column(df, c)?;
    }

    let mut lf = df.clone().lazy();

    if let (Some(start_ms), Some(end_ms)) = (start, end) {
        let ts_col = df
            .column("ts")
            .map_err(|e| AppError::BadRequest(format!("Missing ts column for linked scatter range: {}", e)))?;
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
        let series = df
            .column(column)
            .map_err(|e| AppError::BadRequest(format!("Unknown filter column '{}': {}", column, e)))?;
        let from = filter.from.min(filter.to);
        let to = filter.from.max(filter.to);
        let expr = match series.dtype() {
            dt if dt.is_numeric() => build_numeric_range_expr(column, from, to),
            DataType::Datetime(_, _) | DataType::Date => build_temporal_range_expr(column, series.dtype(), from, to)?,
            _ => {
                return Err(AppError::BadRequest(format!(
                    "Filter column '{}' is not numeric or temporal",
                    column
                )))
            }
        };
        lf = lf.filter(expr);
    }

    if !line_filters.is_empty() {
        let ts_series = df
            .column("ts")
            .map_err(|e| AppError::BadRequest(format!("Missing ts column for adaptive filter: {}", e)))?;
        let ts_expr = temporal_ms_expr("ts", ts_series.dtype());

        for filter in line_filters {
            let column = filter.column.trim();
            if column.is_empty() || filter.x1 == filter.x2 {
                continue;
            }

            let series = df
                .column(column)
                .map_err(|e| AppError::BadRequest(format!("Unknown adaptive filter column '{}': {}", column, e)))?;

            if !series.dtype().is_numeric() {
                return Err(AppError::BadRequest(format!(
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
            let within_expr = ts_expr.clone().gt_eq(lit(min_x)).and(ts_expr.clone().lt_eq(lit(max_x)));
            lf = lf.filter(within_expr.not().or(cmp_expr));
        }
    }

    let mut select_exprs = vec![col(x), col(y)];
    if let Some(color_col) = color {
        if color_col != x && color_col != y {
            select_exprs.push(col(color_col));
        }
    }

    lf.select(select_exprs)
        .collect()
        .map_err(|e| AppError::PolarsError(e.to_string()))
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

    let ranked_pairs: Vec<[f64; 2]> = rx
        .into_iter()
        .zip(ry)
        .map(|(x, y)| [x, y])
        .collect();

    pearson_from_pairs(&ranked_pairs)
}

fn build_correlation_item(df: &DataFrame, base: &str, other: &str) -> Result<CorrelationItem, AppError> {
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

    let df_lock = state.df.read().await;
    let df = df_lock.clone();
    drop(df_lock);

    let x = params.x.clone();
    let y = params.y.clone();
    let color = params.color.clone().filter(|s| !s.trim().is_empty());
    let start = params.start;
    let end = params.end;
    let filters = parse_scatter_filters(params.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(params.line_filters.as_deref())?;
    let limit = clamp_limit(params.limit);

    tokio::task::spawn_blocking(move || {
        let filtered_df = collect_filtered_scatter_frame(&df, &x, &y, color.as_deref(), start, end, &filters, &line_filters)?;

        let mut rows = collect_xyc_rows(&filtered_df, &x, &y, color.as_deref())?;
        rows.sort_by(|a, b| a.0.total_cmp(&b.0));

        let total_points = rows.len();
        let sampled_rows = if rows.len() <= limit {
            rows
        } else {
            let stride = ((rows.len() as f64) / (limit as f64)).ceil() as usize;
            let mut sampled = Vec::with_capacity(limit);
            let mut idx = 0usize;
            while idx < rows.len() && sampled.len() < limit {
                sampled.push(rows[idx]);
                idx = idx.saturating_add(stride);
            }
            sampled
        };

        let mut points: Vec<[f64; 2]> = Vec::with_capacity(sampled_rows.len());
        let mut color_values: Option<Vec<f64>> = color.as_ref().map(|_| Vec::with_capacity(sampled_rows.len()));

        let mut cmin = f64::INFINITY;
        let mut cmax = f64::NEG_INFINITY;

        for (xv, yv, cv) in sampled_rows {
            points.push([xv, yv]);
            if let Some(ref mut out_cv) = color_values {
                let v = cv.unwrap_or(f64::NAN);
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
        }

        Ok(Json(ScatterPointsResponse {
            x,
            y,
            color,
            total_points,
            returned_points: points.len(),
            points,
            color_values,
            color_min: if cmin.is_finite() { Some(cmin) } else { None },
            color_max: if cmax.is_finite() { Some(cmax) } else { None },
        }))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Failed to join scatter points task: {:?}", e)))?
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

    let df_lock = state.df.read().await;
    let df = df_lock.clone();
    drop(df_lock);

    let threshold = params.threshold.unwrap_or(0.7).clamp(0.0, 1.0);
    let requested_base = params.base.clone();

    tokio::task::spawn_blocking(move || {
        let mut numeric = numeric_columns(&df);
        numeric.sort();

        if numeric.len() < 2 {
            return Err(AppError::BadRequest(
                "Need at least two numeric columns for scatter correlations".into(),
            ));
        }

        let base_column = if let Some(base) = requested_base {
            if !numeric.iter().any(|c| c == &base) {
                return Err(AppError::BadRequest(format!(
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
    .map_err(|e| AppError::Internal(format!("Failed to join scatter correlation task: {:?}", e)))?
}
