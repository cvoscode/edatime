//! Scatter points handlers — GET/POST /api/scatter/points and export.

use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderValue, header},
    response::Response,
};
use polars::prelude::*;
use std::sync::Arc;

use crate::arrow_export::{dataframe_to_arrow_ipc, dataframe_to_parquet};
use crate::downsample::downsample_xy_pairs;
use crate::error::AppError;
use crate::state::AppState;
use crate::validation::{validate_scatter_limit, validate_time_window};

use super::{
    ScatterPointsQuery, clamp_limit, collect_filtered_scatter_frame, parse_scatter_filters,
    parse_scatter_line_filters, series_to_label_values, series_to_scatter_values,
};

// ── Internal types ───────────────────────────────────────────────────────────

enum ScatterColorColumn {
    Continuous(Vec<Option<f64>>),
    Categorical(Vec<Option<String>>),
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum ScatterColorKind {
    Continuous,
    Categorical,
}

struct SampledScatterRow {
    x: f64,
    y: f64,
    color_value: Option<f64>,
    color_label: Option<String>,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

#[tracing::instrument(skip(state))]
pub async fn get_scatter_points(
    State(state): State<AppState>,
    Query(params): Query<ScatterPointsQuery>,
) -> Result<Response, AppError> {
    scatter_points_response(state, params).await
}

#[tracing::instrument(skip(state))]
pub async fn post_scatter_points(
    State(state): State<AppState>,
    Json(params): Json<ScatterPointsQuery>,
) -> Result<Response, AppError> {
    scatter_points_response(state, params).await
}

#[tracing::instrument(skip(state))]
pub async fn post_scatter_export_parquet(
    State(state): State<AppState>,
    Json(params): Json<ScatterPointsQuery>,
) -> Result<Response, AppError> {
    let lf = state.dataset_snapshot().await.read().await.clone();

    let x = params.x.clone();
    let y = params.y.clone();
    let color = params.color.clone().filter(|s| !s.trim().is_empty());
    let filters = parse_scatter_filters(params.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(params.line_filters.as_deref())?;

    let filtered = tokio::task::spawn_blocking(move || {
        collect_filtered_scatter_frame(
            lf,
            &x,
            &y,
            color.as_deref(),
            params.start,
            params.end,
            &filters,
            &line_filters,
        )
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join scatter export task: {:?}", e)))??;

    let bytes = dataframe_to_parquet(filtered)
        .map_err(|e| AppError::io(format!("Parquet serialization: {}", e)))?;
    let mut response = Response::new(bytes.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-parquet"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=edatime_scatter_filtered.parquet"),
    );
    Ok(response)
}

// ── Core logic ───────────────────────────────────────────────────────────────

async fn scatter_points_response(
    state: AppState,
    params: ScatterPointsQuery,
) -> Result<Response, AppError> {
    tracing::info!(
        "get_scatter_points called with x='{}', y='{}', color={:?}, limit={}",
        params.x,
        params.y,
        params.color,
        params.limit
    );

    let lf = state.dataset_snapshot().await.read().await.clone();

    let x_col = params.x.clone();
    let y_col = params.y.clone();
    let color_col = params.color.clone().filter(|s| !s.trim().is_empty());

    let x_col_for_headers = x_col.clone();
    let y_col_for_headers = y_col.clone();
    let color_col_for_headers = color_col.clone();
    let start = params.start;
    let end = params.end;
    let filters = parse_scatter_filters(params.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(params.line_filters.as_deref())?;
    let limit = clamp_limit(params.limit, &state.config.validation);
    validate_scatter_limit(limit, &state.config.validation)?;
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
    let metrics = Arc::clone(&state.metrics);

    let (total_points, returned_points, color_min, color_max, arrow_bytes) =
        tokio::task::spawn_blocking(move || {
            let filtered_df = collect_filtered_scatter_frame(
                lf,
                &x_col,
                &y_col,
                color_col.as_deref(),
                start,
                end,
                &filters,
                &line_filters,
            )?;
            let (total, sampled_rows, color_kind) = collect_sampled_xyc_rows(
                &filtered_df,
                &x_col,
                &y_col,
                color_col.as_deref(),
                limit,
            )?;

            let n = sampled_rows.len();
            let mut x_buf = Vec::with_capacity(n);
            let mut y_buf = Vec::with_capacity(n);
            let mut cv_buf: Vec<f64> = Vec::with_capacity(n);
            let mut color_strings: Vec<String> = Vec::with_capacity(n);

            let mut cmin = f64::INFINITY;
            let mut cmax = f64::NEG_INFINITY;

            for row in sampled_rows {
                x_buf.push(row.x);
                y_buf.push(row.y);
                match row.color_value {
                    Some(v) if v.is_finite() => {
                        cv_buf.push(v);
                        color_strings.push(String::new());
                        if v < cmin {
                            cmin = v;
                        }
                        if v > cmax {
                            cmax = v;
                        }
                    }
                    _ => {
                        cv_buf.push(0.0);
                        color_strings.push(row.color_label.unwrap_or_default());
                    }
                }
            }

            let color_min = if cmin.is_finite() { Some(cmin) } else { None };
            let color_max = if cmax.is_finite() { Some(cmax) } else { None };

            // Build Arrow IPC: put x, y, color into a DataFrame then serialize.
            // For continuous color the 3rd col is f64; for categorical it's &str.
            let x_s = Series::new(PlSmallStr::from("x"), x_buf.as_slice());
            let y_s = Series::new(PlSmallStr::from("y"), y_buf.as_slice());

            let columns: Vec<Series> = if matches!(color_kind, Some(ScatterColorKind::Categorical))
            {
                let cs = Series::new(PlSmallStr::from("color_label"), color_strings.as_slice());
                vec![x_s, y_s, cs]
            } else {
                let cv_s = Series::new(PlSmallStr::from("color_value"), cv_buf.as_slice());
                vec![x_s, y_s, cv_s]
            };

            let columns: Vec<Column> = columns.into_iter().map(|s| s.into_column()).collect();
            let scatter_df = DataFrame::new(x_buf.len(), columns)
                .map_err(|e| AppError::internal(format!("build scatter dataframe: {}", e)))?;

            let arrow_bytes = dataframe_to_arrow_ipc(scatter_df)
                .map_err(|e| AppError::internal(format!("Arrow serialization: {}", e)))?;

            Ok::<_, AppError>((total, n, color_min, color_max, arrow_bytes))
        })
        .await
        .map_err(|e| {
            AppError::internal(format!("Failed to join scatter points task: {:?}", e))
        })??;

    metrics.record_scatter_sampling(total_points, returned_points);

    let mut response = Response::new(arrow_bytes.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/vnd.apache.arrow.stream"),
    );
    response.headers_mut().insert(
        "x-edatime-scatter-total",
        HeaderValue::from_str(&total_points.to_string())
            .unwrap_or_else(|_| HeaderValue::from_static("0")),
    );
    response.headers_mut().insert(
        "x-edatime-scatter-returned",
        HeaderValue::from_str(&returned_points.to_string())
            .unwrap_or_else(|_| HeaderValue::from_static("0")),
    );
    if let (Some(cm), Some(cx)) = (color_min, color_max)
        && let (Ok(cmv), Ok(cxv)) = (
            HeaderValue::from_str(&cm.to_string()),
            HeaderValue::from_str(&cx.to_string()),
        ) {
        response.headers_mut().insert("x-edatime-color-min", cmv);
        response.headers_mut().insert("x-edatime-color-max", cxv);
    }
    response.headers_mut().insert(
        "x-edatime-scatter-x",
        HeaderValue::from_str(&x_col_for_headers).unwrap_or_else(|_| HeaderValue::from_static("")),
    );
    response.headers_mut().insert(
        "x-edatime-scatter-y",
        HeaderValue::from_str(&y_col_for_headers).unwrap_or_else(|_| HeaderValue::from_static("")),
    );
    if let Some(ref cc) = color_col_for_headers
        && let Ok(cv) = HeaderValue::from_str(cc) {
        response.headers_mut().insert("x-edatime-scatter-color", cv);
    }
    Ok(response)
}

const MAX_EFFECTIVE_POINTS: usize = 200_000;

fn collect_sampled_xyc_rows(
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    limit: usize,
) -> Result<(usize, Vec<SampledScatterRow>, Option<ScatterColorKind>), AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;
    let c_vals = if let Some(c) = color {
        let series = df
            .column(c)
            .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", c, e)))?;
        if series.dtype().is_numeric()
            || matches!(series.dtype(), DataType::Datetime(_, _) | DataType::Date)
        {
            Some(ScatterColorColumn::Continuous(series_to_scatter_values(
                df, c,
            )?))
        } else {
            Some(ScatterColorColumn::Categorical(series_to_label_values(
                df, c,
            )?))
        }
    } else {
        None
    };
    let color_kind = c_vals.as_ref().map(|column| match column {
        ScatterColorColumn::Continuous(_) => ScatterColorKind::Continuous,
        ScatterColorColumn::Categorical(_) => ScatterColorKind::Categorical,
    });

    let mut all_x: Vec<f64> = Vec::new();
    let mut all_y: Vec<f64> = Vec::new();
    let mut all_color_value: Vec<Option<f64>> = Vec::new();
    let mut all_color_label: Vec<Option<String>> = Vec::new();
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
            Some(ScatterColorColumn::Categorical(values)) => {
                (None, values.get(idx).cloned().flatten())
            }
            None => (None, None),
        };

        total_points += 1;
        all_x.push(xv);
        all_y.push(yv);
        all_color_value.push(color_value);
        all_color_label.push(color_label);
    }

    let effective_limit = if limit > MAX_EFFECTIVE_POINTS { MAX_EFFECTIVE_POINTS } else { limit };

    let (sampled_x, sampled_y, sampled_color) = if matches!(c_vals, Some(ScatterColorColumn::Continuous(_))) {
        let color_f64: Vec<f64> = all_color_value.iter().filter_map(|v| *v).collect();
        let (sx, sy, sc) = downsample_xy_pairs(&all_x, &all_y, Some(&color_f64), effective_limit);
        (sx, sy, sc)
    } else {
        let (sx, sy, sc) = downsample_xy_pairs(&all_x, &all_y, None, effective_limit);
        (sx, sy, sc)
    };

    let sampled_len = sampled_x.len();
    let mut sampled = Vec::with_capacity(sampled_len);

    if let Some(cv) = sampled_color {
        for i in 0..sampled_len {
            sampled.push(SampledScatterRow {
                x: sampled_x[i],
                y: sampled_y[i],
                color_value: Some(cv[i]),
                color_label: None,
            });
        }
    } else {
        for i in 0..sampled_len {
            sampled.push(SampledScatterRow {
                x: sampled_x[i],
                y: sampled_y[i],
                color_value: None,
                color_label: all_color_label.get(i).cloned().flatten(),
            });
        }
    }

    Ok((total_points, sampled, color_kind))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use polars::df;

    #[test]
    fn sampled_rows_report_continuous_color_kind() {
        let df = df!(
            "x" => &[1.0_f64, 2.0, 3.0],
            "y" => &[10.0_f64, 20.0, 30.0],
            "color" => &[0.1_f64, 0.5, 0.9],
        )
        .expect("test dataframe should be created");

        let (total, rows, color_kind) = collect_sampled_xyc_rows(&df, "x", "y", Some("color"), 16)
            .expect("sampling should succeed");

        assert_eq!(total, 3);
        assert_eq!(rows.len(), 3);
        assert_eq!(color_kind, Some(ScatterColorKind::Continuous));
        assert!(rows.iter().all(|row| row.color_value.is_some()));
        assert!(rows.iter().all(|row| row.color_label.is_none()));
    }

    #[test]
    fn sampled_rows_report_categorical_color_kind() {
        let df = df!(
            "x" => &[1.0_f64, 2.0, 3.0],
            "y" => &[10.0_f64, 20.0, 30.0],
            "category" => &[Some("alpha"), None, Some("beta")],
        )
        .expect("test dataframe should be created");

        let (total, rows, color_kind) =
            collect_sampled_xyc_rows(&df, "x", "y", Some("category"), 16)
                .expect("sampling should succeed");

        assert_eq!(total, 3);
        assert_eq!(rows.len(), 3);
        assert_eq!(color_kind, Some(ScatterColorKind::Categorical));
        assert!(rows.iter().all(|row| row.color_value.is_none()));
        assert!(rows.iter().any(|row| row.color_label.is_some()));
    }
}
