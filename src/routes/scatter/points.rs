//! Scatter points handlers — GET/POST /api/scatter/points and export.

use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderValue, header},
    response::Response,
};
use polars::prelude::*;

use crate::arrow_export::dataframe_to_parquet;
use crate::error::AppError;
use crate::state::AppState;
use crate::validation::{validate_scatter_limit, validate_time_window};

use super::{
    ScatterPointsQuery, ScatterPointsResponse,
    clamp_limit, collect_filtered_scatter_frame, parse_scatter_filters,
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

#[tracing::instrument(skip(state))]
pub async fn post_scatter_export_parquet(
    State(state): State<AppState>,
    Json(params): Json<ScatterPointsQuery>,
) -> Result<Response, AppError> {
    let df = state.dataset_snapshot().await;

    let x = params.x.clone();
    let y = params.y.clone();
    let color = params.color.clone().filter(|s| !s.trim().is_empty());
    let filters = parse_scatter_filters(params.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(params.line_filters.as_deref())?;

    let filtered = tokio::task::spawn_blocking(move || {
        collect_filtered_scatter_frame(
            &df,
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
        let (total_points, sampled_rows, color_kind) =
            collect_sampled_xyc_rows(&filtered_df, &x, &y, color.as_deref(), limit)?;

        let mut points: Vec<[f64; 2]> = Vec::with_capacity(sampled_rows.len());
        let mut color_values: Option<Vec<f64>> = match color_kind {
            Some(ScatterColorKind::Continuous) => Some(Vec::with_capacity(sampled_rows.len())),
            _ => None,
        };

        let mut cmin = f64::INFINITY;
        let mut cmax = f64::NEG_INFINITY;

        let mut color_labels: Option<Vec<Option<String>>> = match color_kind {
            Some(ScatterColorKind::Categorical) => Some(Vec::with_capacity(sampled_rows.len())),
            _ => None,
        };

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
            Some(ScatterColorColumn::Categorical(values)) => {
                (None, values.get(idx).cloned().flatten())
            }
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
    Ok((total_points, sampled, color_kind))
}

#[cfg(test)]
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
