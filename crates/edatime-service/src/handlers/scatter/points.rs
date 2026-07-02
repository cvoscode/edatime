//! Scatter points handlers — GET/POST /api/scatter/points.
//!
//! All business logic is delegated to:
//!   - `collect.rs` — `collect_filtered_scatter_frame`
//!   - `sample.rs`  — `collect_sampled_xyc_rows`

use axum::{
    Json,
    extract::{Query, State},
    response::Response,
};
use polars::prelude::*;
use std::sync::Arc;

use crate::error::AppError;
use edatime_query::arrow_export::dataframe_to_arrow_ipc;
use edatime_query::validation::{validate_scatter_limit, validate_time_window};
use edatime_store::cache::CachedResponse;
use edatime_store::state::AppState;

use super::collect::collect_filtered_scatter_frame;
use super::sample::{ScatterColorKind, TimeColorMode, collect_sampled_xyc_rows};
use super::{ScatterPointsQuery, clamp_limit, parse_scatter_filters, parse_scatter_line_filters};

// ── Helpers ──────────────────────────────────────────────────────────────────

fn time_color_mode_label(mode: TimeColorMode) -> &'static str {
    match mode {
        TimeColorMode::Bucket => "bucket",
        TimeColorMode::Raw => "raw",
    }
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

// ── Core response builder ────────────────────────────────────────────────────

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

    let lf = state.dataset_snapshot();

    let x_col = params.x.clone();
    let y_col = params.y.clone();
    let color_col = params.color.clone().filter(|s| !s.trim().is_empty());
    let size_col = params.size.clone().filter(|s| !s.trim().is_empty());

    let x_col_for_headers = x_col.clone();
    let y_col_for_headers = y_col.clone();
    let color_col_for_headers = color_col.clone();
    let size_col_for_headers = size_col.clone();
    let start = params.start;
    let end = params.end;
    let filters = parse_scatter_filters(params.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(params.line_filters.as_deref())?;
    let requires_time_column = start.zip(end).is_some() || !line_filters.is_empty();
    let time_column = if requires_time_column {
        Some(state.ts_context(&lf)?.ts_col)
    } else {
        None
    };
    let limit = clamp_limit(params.limit, &state.config.validation);
    validate_scatter_limit(limit, &state.config.validation)?;
    let time_color_mode = TimeColorMode::from_query(params.time_color_mode.as_deref());
    let cache_key = format!(
        "scatter:v{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
        state.dataset_revision(),
        x_col,
        y_col,
        color_col.as_deref().unwrap_or(""),
        size_col.as_deref().unwrap_or(""),
        start.map(|value| value.to_string()).unwrap_or_default(),
        end.map(|value| value.to_string()).unwrap_or_default(),
        params.filters.as_deref().unwrap_or(""),
        params.line_filters.as_deref().unwrap_or(""),
        limit,
        params.format.as_deref().unwrap_or("arrow"),
        time_color_mode_label(time_color_mode),
    );
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

    if let Some(cached) = state.cache.get(&cache_key).await {
        state.metrics.record_cache_hit();
        return Ok(cached.into_response("hit"));
    }
    state.metrics.record_cache_miss();

    let lazy_frame = collect_filtered_scatter_frame(
        lf,
        &x_col,
        &y_col,
        color_col.as_deref(),
        size_col.as_deref(),
        time_column.as_deref(),
        start,
        end,
        &filters,
        &line_filters,
    )?;

    let (
        total_points,
        returned_points,
        color_min,
        color_max,
        size_min,
        size_max,
        color_kind,
        x_buf,
        y_buf,
        cv_buf,
        color_strings,
        sv_buf,
    ) = tokio::task::spawn_blocking(move || {
        let filtered_df = lazy_frame
            .clone()
            .with_new_streaming(true)
            .collect()
            .map_err(|e| AppError::io(e.to_string()))?;

        let effective_limit = limit.min(state.config.validation.max_scatter_effective_points);

        let (total, sampled_rows, color_kind) = collect_sampled_xyc_rows(
            &filtered_df,
            &x_col,
            &y_col,
            color_col.as_deref(),
            size_col.as_deref(),
            limit,
            effective_limit,
            time_color_mode,
        )?;

        let n = sampled_rows.len();
        let mut x_buf = Vec::with_capacity(n);
        let mut y_buf = Vec::with_capacity(n);
        let mut cv_buf: Vec<f64> = Vec::with_capacity(n);
        let mut color_strings: Vec<String> = Vec::with_capacity(n);
        let mut sv_buf: Vec<f64> = Vec::with_capacity(n);

        let mut cmin = f64::INFINITY;
        let mut cmax = f64::NEG_INFINITY;
        let mut smin = f64::INFINITY;
        let mut smax = f64::NEG_INFINITY;

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
                    cv_buf.push(f64::NAN);
                    color_strings.push(row.color_label.unwrap_or_default());
                }
            }
            if let Some(sv) = row.size_value {
                sv_buf.push(sv);
                if sv < smin {
                    smin = sv;
                }
                if sv > smax {
                    smax = sv;
                }
            }
        }

        let color_min = if cmin.is_finite() { Some(cmin) } else { None };
        let color_max = if cmax.is_finite() { Some(cmax) } else { None };
        let size_min = if smin.is_finite() { Some(smin) } else { None };
        let size_max = if smax.is_finite() { Some(smax) } else { None };

        // NOTE: Arrow serialization happens later, after the format
        // decision. This keeps the buffers available for both
        // `application/vnd.apache.arrow.stream` (Arrow) and
        // `application/json` (point arrays) responses.
        Ok::<_, AppError>((
            total,
            n,
            color_min,
            color_max,
            size_min,
            size_max,
            color_kind,
            x_buf,
            y_buf,
            cv_buf,
            color_strings,
            sv_buf,
        ))
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join scatter points task: {:?}", e)))??;

    metrics.record_scatter_sampling(total_points, returned_points);

    let mut extra_headers = vec![
        (
            "x-edatime-scatter-total".to_string(),
            total_points.to_string(),
        ),
        (
            "x-edatime-scatter-returned".to_string(),
            returned_points.to_string(),
        ),
        ("x-edatime-scatter-x".to_string(), x_col_for_headers.clone()),
        ("x-edatime-scatter-y".to_string(), y_col_for_headers.clone()),
    ];
    if let Some(cm) = color_min {
        extra_headers.push(("x-edatime-color-min".to_string(), cm.to_string()));
    }
    if let Some(cx) = color_max {
        extra_headers.push(("x-edatime-color-max".to_string(), cx.to_string()));
    }
    if let Some(sm) = size_min {
        extra_headers.push(("x-edatime-size-min".to_string(), sm.to_string()));
    }
    if let Some(sx) = size_max {
        extra_headers.push(("x-edatime-size-max".to_string(), sx.to_string()));
    }
    if let Some(ref cc) = color_col_for_headers {
        extra_headers.push(("x-edatime-scatter-color".to_string(), cc.clone()));
    }
    if let Some(kind) = color_kind {
        let kind_str = match kind {
            ScatterColorKind::Continuous => "continuous",
            ScatterColorKind::Categorical => "categorical",
        };
        extra_headers.push((
            "x-edatime-scatter-color-kind".to_string(),
            kind_str.to_string(),
        ));
    }
    if let Some(ref sc) = size_col_for_headers {
        extra_headers.push(("x-edatime-scatter-size".to_string(), sc.clone()));
    }

    let wants_json = params.format.as_deref() == Some("json");

    // Clone the header fields up front so the format-conditional
    // response builder can borrow them without fighting the move
    // semantics of the `if let Some(...) = field` arms above.
    let x_col_for_json = x_col_for_headers.clone();
    let y_col_for_json = y_col_for_headers.clone();
    let color_col_for_json = color_col_for_headers.clone();

    let cached = if wants_json {
        // Build the ScatterPointsResponse JSON payload from the
        // collected buffers. Categorical color renders into
        // `color_labels`; continuous color into `color_values`.
        let response = super::ScatterPointsResponse {
            x: x_col_for_json,
            y: y_col_for_json,
            color: color_col_for_json,
            total_points,
            returned_points,
            points: x_buf
                .iter()
                .zip(y_buf.iter())
                .map(|(xv, yv)| [*xv, *yv])
                .collect(),
            color_values: if matches!(color_kind, Some(ScatterColorKind::Categorical)) {
                None
            } else {
                Some(cv_buf.clone())
            },
            color_labels: if matches!(color_kind, Some(ScatterColorKind::Categorical)) {
                Some(
                    color_strings
                        .iter()
                        .map(|s| if s.is_empty() { None } else { Some(s.clone()) })
                        .collect(),
                )
            } else {
                None
            },
            color_min,
            color_max,
            size_values: if sv_buf.is_empty() { None } else { Some(sv_buf.clone()) },
            size_min,
            size_max,
        };
        let json_bytes = serde_json::to_vec(&response)
            .map_err(|e| AppError::internal(format!("JSON serialization: {}", e)))?;
        CachedResponse::json(json_bytes, false, returned_points, limit, None)
            .with_extra_headers(extra_headers)
    } else {
        // Default: Arrow IPC. We have to rebuild the dataframe here
        // because the buffers have already been moved into this scope.
        let x_s = Series::new(PlSmallStr::from("x"), x_buf.as_slice());
        let y_s = Series::new(PlSmallStr::from("y"), y_buf.as_slice());
        let columns: Vec<Series> = if matches!(color_kind, Some(ScatterColorKind::Categorical)) {
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
        CachedResponse::arrow(arrow_bytes, false, returned_points, limit, None)
            .with_extra_headers(extra_headers)
    };
    state.cache.insert(cache_key, cached.clone()).await;
    Ok(cached.into_response("miss"))
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::post_scatter_points;
    use crate::handlers::scatter::ScatterPointsQuery;
    use axum::{Json, extract::State, http::header};
    use edatime_core::config::AppConfig;
    use edatime_store::state::AppState;
    use polars::prelude::{DataFrame, NamedFrom, Series};

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_points_allow_color_column_matching_axis() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("LULL".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("HULL".into(), [10.0_f64, 20.0, 30.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let params = ScatterPointsQuery {
            x: "LULL".to_string(),
            y: "HULL".to_string(),
            color: Some("LULL".to_string()),
            size: None,
            start: None,
            end: None,
            filters: None,
            line_filters: None,
            limit: 10,
            format: None,
            time_color_mode: None,
        };

        let result = post_scatter_points(State(state), Json(params)).await;

        assert!(
            result.is_ok(),
            "scatter points request should succeed: {result:?}"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_points_cache_reuses_identical_requests() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new("LULL".into(), [1.0_f64, 2.0, 3.0]).into(),
                Series::new("HULL".into(), [10.0_f64, 20.0, 30.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let params = ScatterPointsQuery {
            x: "LULL".to_string(),
            y: "HULL".to_string(),
            color: None,
            size: None,
            start: None,
            end: None,
            filters: None,
            line_filters: None,
            limit: 10,
            format: Some("arrow".to_string()),
            time_color_mode: None,
        };

        let first = post_scatter_points(State(state.clone()), Json(params.clone()))
            .await
            .expect("first scatter points request should succeed");
        let second = post_scatter_points(State(state), Json(params))
            .await
            .expect("second scatter points request should succeed");

        assert_eq!(
            first
                .headers()
                .get("x-edatime-cache")
                .and_then(|v| v.to_str().ok()),
            Some("miss")
        );
        assert_eq!(
            second
                .headers()
                .get("x-edatime-cache")
                .and_then(|v| v.to_str().ok()),
            Some("hit")
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_points_accept_line_filters_with_compatibility_id_field() {
        let df = DataFrame::new(
            3,
            vec![
                Series::new(
                    "ts".into(),
                    [
                        1_467_331_200_000_i64,
                        1_491_469_996_429_i64,
                        1_530_042_300_000_i64,
                    ],
                )
                .into(),
                Series::new("HUFL".into(), [70.0_f64, 80.0, 90.0]).into(),
                Series::new("HULL".into(), [10.0_f64, 20.0, 30.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let params = ScatterPointsQuery {
            x: "HUFL".to_string(),
            y: "HULL".to_string(),
            color: None,
            size: None,
            start: Some(1_467_331_200_000.0),
            end: Some(1_530_042_300_000.0),
            filters: None,
            line_filters: Some(
                r#"[{"id":"adaptive-1781794868781-c3v0r8","column":"HUFL","x1":1491469996428.5715,"y1":76.32572064536755,"x2":1497229179081.6326,"y2":77.28037623208502,"keepAbove":false}]"#
                    .to_string(),
            ),
            limit: 10,
            format: Some("arrow".to_string()),
            time_color_mode: None,
        };

        let result = post_scatter_points(State(state), Json(params)).await;

        assert!(
            result.is_ok(),
            "scatter points request should accept compatibility ids: {result:?}"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn scatter_points_format_json_returns_application_json() {
        // Regression test for audit issue 3.4: previously `format=json`
        // was silently ignored and the response was always Arrow IPC.
        let df = DataFrame::new(
            5,
            vec![
                Series::new("LULL".into(), [1.0_f64, 2.0, 3.0, 4.0, 5.0]).into(),
                Series::new("HULL".into(), [10.0_f64, 20.0, 30.0, 40.0, 50.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());
        let params = ScatterPointsQuery {
            x: "LULL".to_string(),
            y: "HULL".to_string(),
            color: None,
            size: None,
            start: None,
            end: None,
            filters: None,
            line_filters: None,
            limit: 10,
            format: Some("json".to_string()),
            time_color_mode: None,
        };

        let response = post_scatter_points(State(state), Json(params))
            .await
            .expect("scatter points request with format=json should succeed");
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        assert!(
            content_type.starts_with("application/json"),
            "format=json must return application/json, got {content_type}"
        );
        let body = axum::body::to_bytes(response.into_body(), 1_000_000)
            .await
            .expect("read body");
        let parsed: serde_json::Value =
            serde_json::from_slice(&body).expect("body should be valid JSON");
        let points = parsed
            .get("points")
            .and_then(|v| v.as_array())
            .expect("JSON body must include `points` array");
        assert_eq!(points.len(), 5, "all 5 input rows should be returned");
    }
}
