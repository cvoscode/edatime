//! Scatter points handler — plan-aware POST /api/v1/scatter/points.
//!
//! All business logic is delegated to:
//!   - `collect.rs` — `collect_filtered_scatter_frame`
//!   - `sample.rs`  — `collect_sampled_xyc_rows`

use axum::{Json, extract::State, response::Response};
use polars::prelude::*;
use std::sync::Arc;

use crate::error::AppError;
use edatime_query::arrow_export::dataframe_to_arrow_ipc;
use edatime_query::validation::{validate_scatter_limit, validate_time_window};
use edatime_store::cache::{CacheKeyBuilder, CacheReservation, CachedResponse};
use edatime_store::state::AppState;

use super::collect::collect_filtered_scatter_frame;
use super::sample::{ScatterColorKind, TimeColorMode, collect_sampled_xyc_rows_streaming};
use super::{ColorCardinalityInfo, ScatterPointsQuery, clamp_limit, resolved_scatter_limit};
use crate::handlers::routes::cleaning::compile_request_frame;
use crate::handlers::routes::shared::{ExecutionIdentity, cached_response};

// ── Helpers ──────────────────────────────────────────────────────────────────

fn time_color_mode_label(mode: TimeColorMode) -> &'static str {
    match mode {
        TimeColorMode::Bucket => "bucket",
        TimeColorMode::Raw => "raw",
    }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

#[tracing::instrument(skip(state, params))]
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
        "post_scatter_points called with x='{}', y='{}', color={:?}, limit={}",
        params.x,
        params.y,
        params.color,
        params.limit
    );

    let (version, hash, lf) = compile_request_frame(&state, &params.cleaning_plan)?;
    let identity = ExecutionIdentity::from_version(version, Some(hash));

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
    let requires_time_column = start.zip(end).is_some();
    let time_column = if requires_time_column {
        Some(state.ts_context(&lf)?.ts_col)
    } else {
        None
    };
    // `params.limit == 0` is the sentinel emitted by serde when the client
    // omits the field; substitute the configured default so operators can
    // tune the baseline via `config.toml` (audit issue 2.6). Any explicit
    // value the client sent is preserved before clamping against the
    // configured upper bound.
    let parsed_limit = if params.limit == 0 {
        resolved_scatter_limit(&state.config.validation)
    } else {
        params.limit
    };
    let limit = clamp_limit(parsed_limit, &state.config.validation);
    validate_scatter_limit(limit, &state.config.validation)?;
    let time_color_mode = TimeColorMode::from_query(params.time_color_mode.as_deref());
    let cache_key = CacheKeyBuilder::new("scatter")
        .text("source", &identity.source_version_id)
        .display("revision", identity.source_revision)
        .text("x", &x_col)
        .text("y", &y_col)
        .opt_text("color", color_col.as_deref())
        .opt_text("size", size_col.as_deref())
        .opt_display("start", start)
        .opt_display("end", end)
        .opt_text("plan", identity.plan_hash.as_deref())
        .display("limit", limit)
        .text("format", params.format.as_deref().unwrap_or("arrow"))
        .text("time_color", time_color_mode_label(time_color_mode))
        .build();
    // The seed deliberately excludes response format and requested capacity:
    // equivalent scatter geometry should retain the same source points across
    // Arrow/JSON transports and smaller limits should be a subset of larger
    // samples for the same immutable source/plan/filter identity.
    let sample_seed_scope = format!(
        "scatter-reservoir:source={}:revision={}:x={}:y={}:color={}:size={}:start={}:end={}:plan={}",
        identity.source_version_id,
        identity.source_revision,
        x_col,
        y_col,
        color_col.as_deref().unwrap_or(""),
        size_col.as_deref().unwrap_or(""),
        start.map(|value| value.to_string()).unwrap_or_default(),
        end.map(|value| value.to_string()).unwrap_or_default(),
        identity.plan_hash.as_deref().unwrap_or("none"),
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

    let _cache_producer = match state.cache.reserve(&cache_key).await {
        CacheReservation::Hit {
            response,
            coalesced,
        } => {
            state.metrics.record_cache_hit();
            metrics.record_scatter_cache(true);
            return Ok(cached_response(
                response,
                if coalesced { "coalesced" } else { "hit" },
            ));
        }
        CacheReservation::Producer(producer) => {
            state.metrics.record_cache_miss();
            metrics.record_scatter_cache(false);
            producer
        }
    };

    let lazy_frame = collect_filtered_scatter_frame(
        lf,
        &x_col,
        &y_col,
        color_col.as_deref(),
        size_col.as_deref(),
        time_column.as_deref(),
        start,
        end,
    )?;

    let executor = Arc::clone(&state.query_executor);
    let max_effective_points = state.config.validation.max_scatter_effective_points;
    let max_color_cardinality = state.config.validation.max_color_cardinality;
    let inner_metrics = Arc::clone(&metrics);
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
        color_strings, // Vec<Option<String>>: None for continuous-color rows.
        sv_buf,
        color_cardinality,
    ) = executor
        .run_interactive(edatime_core::metrics::CpuStage::Scatter, move || {
            (|| {
                let collect_start = std::time::Instant::now();
                let effective_limit = limit.min(max_effective_points);

                let (total, sampled_rows, color_kind) = collect_sampled_xyc_rows_streaming(
                    lazy_frame,
                    &x_col,
                    &y_col,
                    color_col.as_deref(),
                    size_col.as_deref(),
                    effective_limit,
                    time_color_mode,
                    &sample_seed_scope,
                )?;
                let collect_ns = collect_start.elapsed().as_nanos() as u64;
                inner_metrics
                    .record_scatter_stage(edatime_core::metrics::ScatterStage::Collect, collect_ns);
                inner_metrics.record_scatter_filtered_rows(total as u64);
                let sample_start = std::time::Instant::now();

                let n = sampled_rows.len();
                let mut x_buf = Vec::with_capacity(n);
                let mut y_buf = Vec::with_capacity(n);
                let mut cv_buf: Vec<f64> = Vec::with_capacity(n);
                // Audit issue 2.2: keep categorical labels as `Option<String>`
                // (None for continuous-color rows) so we can apply the
                // cardinality cap *after* sampling without losing the row
                // alignment with `x_buf` / `cv_buf`.
                let mut color_strings: Vec<Option<String>> = Vec::with_capacity(n);
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
                            color_strings.push(None);
                            if v < cmin {
                                cmin = v;
                            }
                            if v > cmax {
                                cmax = v;
                            }
                        }
                        _ => {
                            cv_buf.push(f64::NAN);
                            color_strings.push(row.color_label);
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

                // Apply the cardinality cap on categorical color so a
                // high-cardinality column doesn't blow up the legend (audit
                // issue 2.2). The cap is a no-op for the continuous path
                // because no row in `color_strings` is `Some` there.
                let (color_strings, color_cardinality) =
                    if matches!(color_kind, Some(ScatterColorKind::Categorical)) {
                        let cap = max_color_cardinality;
                        let (rewritten, info) =
                            super::cap_categorical_cardinality(color_strings, cap);
                        (rewritten, Some(info))
                    } else {
                        (color_strings, None)
                    };

                let color_min = if cmin.is_finite() { Some(cmin) } else { None };
                let color_max = if cmax.is_finite() { Some(cmax) } else { None };
                let size_min = if smin.is_finite() { Some(smin) } else { None };
                let size_max = if smax.is_finite() { Some(smax) } else { None };

                // Phase 0.1: stop the sample timer and emit the valid-points
                // total BEFORE the result tuple is constructed so the counter
                // belongs unambiguously to sampling work.
                let sample_ns = sample_start.elapsed().as_nanos() as u64;
                inner_metrics
                    .record_scatter_stage(edatime_core::metrics::ScatterStage::Sample, sample_ns);
                inner_metrics.record_scatter_valid_points(total as u64);

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
                    color_cardinality,
                ))
            })()
        })
        .await
        .map_err(AppError::from)??;

    metrics.record_scatter_sampling(total_points, returned_points);

    let mut extra_headers = identity.headers();
    extra_headers.extend([
        (
            "x-edatime-sampling-algorithm".to_string(),
            "reservoir-stream-v1".to_string(),
        ),
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
    ]);
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
    // Audit issue 2.2: surface the cardinality summary on the
    // response headers so non-JSON consumers (Arrow, exports) can
    // also render a legend hint without parsing the body.
    if let Some(info) = color_cardinality {
        extra_headers.push((
            "x-edatime-color-cardinality-requested".to_string(),
            info.requested.to_string(),
        ));
        extra_headers.push((
            "x-edatime-color-cardinality-used".to_string(),
            info.used.to_string(),
        ));
        extra_headers.push((
            "x-edatime-color-cardinality-bucketed".to_string(),
            info.bucketed.to_string(),
        ));
    }

    let wants_json = params.format.as_deref() == Some("json");

    // Clone the header fields up front so the format-conditional
    // response builder can borrow them without fighting the move
    // semantics of the `if let Some(...) = field` arms above.
    let x_col_for_json = x_col_for_headers.clone();
    let y_col_for_json = y_col_for_headers.clone();
    let color_col_for_json = color_col_for_headers.clone();

    let serialize_start = std::time::Instant::now();
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
                Some(color_strings.clone())
            } else {
                None
            },
            color_min,
            color_max,
            size_values: if sv_buf.is_empty() {
                None
            } else {
                Some(sv_buf.clone())
            },
            size_min,
            size_max,
            color_cardinality: color_cardinality.map(ColorCardinalityInfo::from),
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
    let serialize_ns = serialize_start.elapsed().as_nanos() as u64;
    metrics.record_scatter_stage(edatime_core::metrics::ScatterStage::Serialize, serialize_ns);
    metrics.record_scatter_response(cached.body_len() as u64, returned_points as u64);
    state.cache.insert(cache_key, cached.clone()).await;
    Ok(cached_response(cached, "miss"))
}

#[cfg(test)]
mod tests;
