//! `POST /api/v1/data` — plan-aware dataset window

use axum::{Json, extract::State, response::Response};
use serde::Deserialize;
use std::time::Instant;

use edatime_core::metrics::{CpuStage, DataStage};
use edatime_core::pipeline::{Pipeline, ProjectStage, TimeFilterStage};
use polars::prelude::SortMultipleOptions;

use crate::error::AppError;
use edatime_query::pipeline::{self, Reduction};
use edatime_query::query::{self, DataQuery};
use edatime_query::validation::{
    validate_numeric_columns_lazy, validate_time_window, validate_width,
};
use edatime_store::cache::{CacheKeyBuilder, CacheReservation, CachedResponse};
use edatime_store::state::AppState;

use super::{
    cleaning_context::{PlanRequestEnvelope, resolve_cleaning_context},
    shared::{ExecutionIdentity, cached_response},
};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlanAwareDataQuery {
    #[serde(flatten)]
    pub query: DataQuery,
    pub cleaning_plan: PlanRequestEnvelope,
}

/// Output of the reduce-and-serialize stage of a data window request.
struct ReducedWindow {
    cached: CachedResponse,
    /// Exact source rows inside the requested window, before any reduction.
    filtered_rows: usize,
    candidate_rows: usize,
    returned_rows: usize,
    envelope_used: bool,
    reduce_elapsed_ns: u64,
    serialize_elapsed_ns: u64,
}

#[tracing::instrument(skip(state, request))]
pub async fn post_data(
    State(state): State<AppState>,
    Json(request): Json<PlanAwareDataQuery>,
) -> Result<Response, AppError> {
    data_response(state, request.query, &request.cleaning_plan).await
}

async fn data_response(
    state: AppState,
    params: DataQuery,
    cleaning_plan: &PlanRequestEnvelope,
) -> Result<Response, AppError> {
    validate_time_window(params.start, params.end)?;
    let limits = &state.config.validation;
    validate_width(params.width, limits)?;

    let context = resolve_cleaning_context(&state, cleaning_plan)?;
    let identity = ExecutionIdentity::from_version(context.version, Some(context.plan_hash));
    let lf = context.frame;
    let resolved_time_column = cleaning_plan.plan.time_column.clone();
    let value_cols = validate_numeric_columns_lazy(
        &lf,
        &query::parse_columns(params.columns.as_deref()),
        limits,
    )?;

    let color_column = params
        .color_column
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let schema = lf
        .clone()
        .collect_schema()
        .map_err(|e| AppError::internal(e.to_string()))?;
    if let Some(color_col) = color_column.as_ref()
        && !schema.contains(color_col.as_str())
    {
        return Err(AppError::bad_request(format!(
            "Color column '{color_col}' is not present in dataset",
        )));
    }

    let mut output_cols = value_cols.clone();
    if let Some(color_col) = color_column.as_ref()
        && !output_cols.iter().any(|c| c == color_col)
    {
        output_cols.push(color_col.clone());
    }

    let ctx = edatime_core::temporal::ts_context(&lf, &resolved_time_column)?;
    let lookaround_ms = params.lookaround_ms.unwrap_or(0).max(0);
    // Transport/window bounds and envelope widths are epoch milliseconds;
    // only the filter bounds cross into the source column's native unit.
    let start_ms = params
        .start
        .timestamp_millis()
        .saturating_sub(lookaround_ms);
    let end_ms = params.end.timestamp_millis().saturating_add(lookaround_ms);
    // Inclusive comparisons require the first native tick at/after the
    // lower bound and the last tick at/before the upper bound. This matters
    // for Date columns when the requested window starts or ends midday.
    let start_ts = edatime_core::temporal::epoch_ms_to_native(start_ms as f64, &ctx.dtype, true)?;
    let end_ts = edatime_core::temporal::epoch_ms_to_native(end_ms as f64, &ctx.dtype, false)?;
    let dtype = ctx.dtype;
    let ts_col = ctx.ts_col;
    let format = query::output_format(params.format.as_deref());
    let cache_key = CacheKeyBuilder::new("data")
        .text("source", &identity.source_version_id)
        .display("revision", identity.source_revision)
        .opt_text("plan", identity.plan_hash.as_deref())
        .display("start", params.start.timestamp_millis())
        .display("end", params.end.timestamp_millis())
        .display("width", params.width)
        .display("lookaround", lookaround_ms)
        .list("columns", &value_cols)
        .opt_text("color", color_column.as_deref())
        .display("format", format!("{format:?}"))
        .build();

    let _cache_producer = match state.cache.reserve(&cache_key).await {
        CacheReservation::Hit {
            response,
            coalesced,
        } => {
            state.metrics.record_cache_hit();
            state.metrics.record_data_request(true);
            state
                .metrics
                .record_data_response(response.body_len() as u64);
            return Ok(cached_response(
                response,
                if coalesced { "coalesced" } else { "hit" },
            ));
        }
        CacheReservation::Producer(producer) => {
            state.metrics.record_cache_miss();
            state.metrics.record_data_request(false);
            producer
        }
    };

    // ── Lazy pipeline: time filter + column projection ───────────────────────
    let time_filter = TimeFilterStage::new(ts_col.clone(), dtype.clone(), start_ts, end_ts);
    // Ensure ts_col is included in the projection (apply_reduction needs it for downsampling)
    let mut project_cols = output_cols.clone();
    if !project_cols.iter().any(|c| c.as_str() == ts_col.as_str()) {
        project_cols.insert(0, ts_col.clone());
    }
    let project = ProjectStage {
        columns: project_cols,
    };

    let pipeline = Pipeline::new().then(time_filter).then(project);
    // Canonical cleaning stages can leave rows in any saved order. Signals
    // always presents time chronologically, and dynamic envelope grouping
    // requires that order as well.
    let filtered_plan = pipeline.apply(lf).sort(
        [ts_col.as_str()],
        SortMultipleOptions::default().with_maintain_order(true),
    );

    let target_points = params.width * 2;
    let candidate_cap = target_points.saturating_mul(4).max(target_points);
    // One bounded probe preserves exact behavior for small windows without a
    // separate full count scan. Large windows then use one shared multi-series
    // envelope scan that also returns the exact filtered-row count.
    let collect_started = Instant::now();
    let bounded_probe = state
        .query_executor
        .execute_async(filtered_plan.clone().slice(0, (candidate_cap + 1) as u32))
        .await?;
    let extra_cols = color_column
        .iter()
        .filter(|color_col| !value_cols.iter().any(|value_col| value_col == *color_col))
        .cloned()
        .collect::<Vec<String>>();
    let use_envelope = bounded_probe.height() > candidate_cap;
    let (candidate_frame, filtered_rows, envelope_used) = if use_envelope {
        let bucket_count = (candidate_cap / 4).max(1) as i64;
        let span = end_ms.saturating_sub(start_ms).saturating_add(1);
        let bucket_width = (span / bucket_count).max(1);
        let envelope = pipeline::lazy_multi_time_envelope(
            filtered_plan,
            &ts_col,
            &value_cols,
            &extra_cols,
            bucket_width,
        )?;
        let collected = state.query_executor.execute_async(envelope).await?;
        (collected, 0, true)
    } else {
        let filtered_rows = bounded_probe.height();
        (bounded_probe, filtered_rows, false)
    };
    state.metrics.record_data_stage(
        DataStage::Collect,
        collect_started.elapsed().as_nanos() as u64,
    );

    let ReducedWindow {
        cached,
        filtered_rows,
        candidate_rows,
        returned_rows,
        envelope_used,
        reduce_elapsed_ns,
        serialize_elapsed_ns,
    } = state
        .query_executor
        .run_interactive(CpuStage::Scatter, move || {
            let reduce_started = Instant::now();
            let (candidates, filtered_rows) = if envelope_used {
                pipeline::expand_multi_time_envelope(
                    &candidate_frame,
                    &ts_col,
                    &value_cols,
                    &extra_cols,
                )
            } else {
                Ok((candidate_frame, filtered_rows))
            }?;
            let candidate_rows = candidates.height();
            let (reduced, was_downsampled) = pipeline::apply_reduction(
                &candidates,
                &value_cols,
                &extra_cols,
                &Reduction::Lttb { target_points },
                &ts_col,
            )?;
            let returned_rows = reduced.height();
            let is_downsampled = envelope_used || was_downsampled;
            let reduce_elapsed_ns = reduce_started.elapsed().as_nanos() as u64;

            let serialize_started = Instant::now();
            let cached = match format {
                query::OutputFormat::Arrow => CachedResponse::arrow(
                    pipeline::serialize_arrow(reduced, &ts_col)?,
                    is_downsampled,
                    returned_rows,
                    target_points,
                    Some(ts_col.to_string()),
                ),
                query::OutputFormat::Json => {
                    let json_bytes = serde_json::to_vec(&pipeline::serialize_json(
                        &reduced,
                        &value_cols,
                        color_column.as_ref(),
                        &dtype,
                        &ts_col,
                    )?)
                    .map_err(|error| {
                        AppError::internal(format!("Failed to encode JSON response: {error}"))
                    })?;
                    CachedResponse::json(
                        json_bytes,
                        is_downsampled,
                        returned_rows,
                        target_points,
                        Some(ts_col.to_string()),
                    )
                }
            };
            Ok::<_, AppError>(ReducedWindow {
                cached,
                filtered_rows,
                candidate_rows,
                returned_rows,
                envelope_used,
                reduce_elapsed_ns,
                serialize_elapsed_ns: serialize_started.elapsed().as_nanos() as u64,
            })
        })
        .await??;
    state
        .metrics
        .record_data_stage(DataStage::Reduce, reduce_elapsed_ns);
    state
        .metrics
        .record_data_stage(DataStage::Serialize, serialize_elapsed_ns);
    state.metrics.record_data_rows(
        filtered_rows as u64,
        candidate_rows as u64,
        returned_rows as u64,
    );
    state.metrics.record_data_response(cached.body_len() as u64);

    // Empty-range signal (audit issue 2.3): when the filtered frame
    // has zero rows, attach an explicit `x-edatime-empty: 1` header so
    // the frontend can distinguish "no data in range" from "load
    // failed silently". Default to "0" so a normal non-empty response
    // carries a stable contract.
    let empty_header = if returned_rows == 0 { "1" } else { "0" };
    // Filter-drop accounting (audit issue 1.4): expose how many rows
    // survived the time filter and how many were dropped relative to
    // the pre-LTTB filtered set. LTTB can also reduce rows; clamp at
    // zero so the contract stays non-negative.
    let dropped_rows = filtered_rows.saturating_sub(returned_rows);
    let mut identity_headers = identity.headers();
    // Compatibility header: it now carries the immutable resolved source
    // revision, matching the new, explicitly named source-revision header.
    identity_headers.push((
        "x-edatime-dataset-revision".to_string(),
        identity.source_revision.to_string(),
    ));
    let mut extra_headers = vec![
        ("x-edatime-empty".to_string(), empty_header.to_string()),
        (
            "x-edatime-sampling-algorithm".to_string(),
            if envelope_used {
                "envelope-lttb-v1"
            } else {
                "lttb-v1"
            }
            .to_string(),
        ),
        (
            "x-edatime-approximate".to_string(),
            if envelope_used { "1" } else { "0" }.to_string(),
        ),
        (
            "x-edatime-filtered-rows".to_string(),
            filtered_rows.to_string(),
        ),
        (
            "x-edatime-candidate-rows".to_string(),
            candidate_rows.to_string(),
        ),
        (
            "x-edatime-dropped-rows".to_string(),
            dropped_rows.to_string(),
        ),
    ];
    extra_headers.append(&mut identity_headers);
    let cached = cached.with_extra_headers(extra_headers);

    state.cache.insert(cache_key, cached.clone()).await;
    Ok(cached_response(cached, "miss"))
}

#[cfg(test)]
mod tests;
