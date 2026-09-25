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
use edatime_store::cache::{CacheReservation, CachedResponse};
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

#[tracing::instrument(skip(state))]
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
    tracing::info!("post_data called with params: {:?}", params);

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
    let cache_key = format!(
        "data:source={}:revision={}:plan={}:{}:{}:{}:{}:{}:{}:{:?}",
        identity.source_version_id,
        identity.source_revision,
        identity.plan_hash.as_deref().unwrap_or("none"),
        params.start.timestamp_millis(),
        params.end.timestamp_millis(),
        params.width,
        lookaround_ms,
        value_cols.join(","),
        color_column.as_deref().unwrap_or(""),
        format,
    );

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
    let time_filter = TimeFilterStage::optional(ts_col.clone(), Some(start_ts), Some(end_ts))
        .expect("both start and end are Some");
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

    let (
        cached,
        filtered_rows,
        candidate_rows,
        returned_rows,
        envelope_used,
        reduce_elapsed_ns,
        serialize_elapsed_ns,
    ) = state
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
            Ok::<_, AppError>((
                cached,
                filtered_rows,
                candidate_rows,
                returned_rows,
                envelope_used,
                reduce_elapsed_ns,
                serialize_started.elapsed().as_nanos() as u64,
            ))
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
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::*;
    use axum::{Json, extract::State};
    use edatime_core::config::AppConfig;
    use edatime_store::state::AppState;
    use polars::prelude::{DataFrame, NamedFrom, Series};

    /// Build a small frame with a single numeric column and a datetime
    /// `date` column covering 2018.
    fn build_test_state() -> AppState {
        let ts_ms: Vec<i64> = vec![
            1_514_764_800_000, // 2018-01-01
            1_517_424_000_000, // 2018-01-15
            1_520_169_600_000, // 2018-02-01
        ];
        let xs: Vec<f64> = vec![1.0, 2.0, 3.0];
        let ts_series = Series::new("ts".into(), ts_ms)
            .cast(&polars::prelude::DataType::Datetime(
                polars::prelude::TimeUnit::Milliseconds,
                None,
            ))
            .expect("cast date column");
        let df = DataFrame::new(
            3,
            vec![ts_series.into(), Series::new("HUFL".into(), xs).into()],
        )
        .expect("test dataframe should build");
        AppState::new(df, AppConfig::default())
    }

    fn build_duplicate_timestamp_state() -> AppState {
        let rows = 1_000usize;
        let timestamps = vec![1_514_764_800_000_i64; rows];
        let values = (0..rows).map(|index| index as f64).collect::<Vec<_>>();
        let ts = Series::new("ts".into(), timestamps)
            .cast(&polars::prelude::DataType::Datetime(
                polars::prelude::TimeUnit::Milliseconds,
                None,
            ))
            .expect("duplicate timestamp cast");
        let frame = DataFrame::new(
            rows,
            vec![ts.into(), Series::new("HUFL".into(), values).into()],
        )
        .expect("duplicate timestamp frame");
        AppState::new(frame, AppConfig::default())
    }

    fn build_large_nan_state() -> AppState {
        let rows = 10_000usize;
        let ts_ms: Vec<i64> = (0..rows)
            .map(|index| 1_514_764_800_000_i64 + index as i64 * 1_000)
            .collect();
        let mut values: Vec<f64> = (0..rows).map(|index| (index as f64 * 0.01).sin()).collect();
        values[rows / 2] = f64::NAN;
        let ts_series = Series::new("ts".into(), ts_ms)
            .cast(&polars::prelude::DataType::Datetime(
                polars::prelude::TimeUnit::Milliseconds,
                None,
            ))
            .expect("cast date column");
        let df = DataFrame::new(
            rows,
            vec![ts_series.into(), Series::new("HUFL".into(), values).into()],
        )
        .expect("test dataframe should build");
        AppState::new(df, AppConfig::default())
    }

    fn baseline_data_request(
        state: &AppState,
        start: &str,
        end: &str,
        width: usize,
    ) -> PlanAwareDataQuery {
        let version = state.current_dataset_version().expect("source version");
        serde_json::from_value(serde_json::json!({
            "start": start,
            "end": end,
            "width": width,
            "columns": "HUFL",
            "cleaning_plan": {
                "plan": {
                    "schemaVersion": 1,
                    "id": "baseline-plan",
                    "planRevision": 1,
                    "sourceVersionId": version.id,
                    "datasetRevision": version.revision,
                    "datasetFingerprint": version.dataset_fingerprint,
                    "schemaFingerprint": version.schema_fingerprint,
                    "timeColumn": "ts",
                    "sourceName": null,
                    "stages": [],
                    "createdAt": "2026-07-15T00:00:00Z",
                    "updatedAt": "2026-07-15T00:00:00Z"
                },
                "expectedPlanHash": null,
                "expectedSourceVersionId": version.id,
                "expectedDatasetRevision": version.revision
            }
        }))
        .expect("baseline plan-aware data request")
    }

    #[test]
    fn plan_aware_data_query_requires_a_cleaning_plan() {
        let request = serde_json::json!({
            "start": "2018-01-01T00:00:00Z",
            "end": "2018-01-02T00:00:00Z",
            "width": 400,
            "columns": "HUFL"
        });
        assert!(serde_json::from_value::<PlanAwareDataQuery>(request).is_err());
    }

    /// Regression test for audit issue 2.3: a future time window used
    /// to return an empty Arrow payload without any signal that no
    /// data was found. The handler now sets `x-edatime-empty: 1` on
    /// the response so the frontend can render an explicit
    /// "no data in range" message.
    #[tokio::test(flavor = "multi_thread")]
    async fn post_data_emits_empty_header_when_no_rows_match() {
        let state = build_test_state();
        let request =
            baseline_data_request(&state, "2030-01-01T00:00:00Z", "2031-01-01T00:00:00Z", 400);
        let response = post_data(State(state), Json(request))
            .await
            .expect("future window should be a valid request that returns empty");
        let empty = response
            .headers()
            .get("x-edatime-empty")
            .and_then(|v| v.to_str().ok());
        assert_eq!(
            empty,
            Some("1"),
            "empty future window must set x-edatime-empty: 1"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn post_data_emits_empty_zero_header_when_rows_match() {
        let state = build_test_state();
        let request =
            baseline_data_request(&state, "2018-01-01T00:00:00Z", "2018-02-01T00:00:00Z", 400);
        let response = post_data(State(state), Json(request))
            .await
            .expect("normal window should succeed");
        let empty = response
            .headers()
            .get("x-edatime-empty")
            .and_then(|v| v.to_str().ok());
        assert_eq!(
            empty,
            Some("0"),
            "non-empty window must set x-edatime-empty: 0"
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-downsampled")
                .and_then(|value| value.to_str().ok()),
            Some("0"),
            "an untouched exact window must not be marked downsampled"
        );
    }

    /// Regression test for audit issue 1.4: the response must expose
    /// `x-edatime-filtered-rows` and `x-edatime-dropped-rows` so the
    /// frontend can tell when a range produced zero rows because the
    /// time window itself was empty (filtered_rows == 0) vs. because
    /// filters / non-finite cleanup removed rows after the time
    /// filter. The `build_test_state` fixture has 3 rows total; a
    /// normal in-range request should report filtered_rows == 2 and
    /// dropped_rows == 0 (LTTB `width=400` is far above the row
    /// count so no LTTB reduction kicks in).
    #[tokio::test(flavor = "multi_thread")]
    async fn post_data_emits_filtered_and_dropped_rows_headers() {
        let state = build_test_state();
        let request =
            baseline_data_request(&state, "2018-01-01T00:00:00Z", "2018-02-01T00:00:00Z", 400);
        let response = post_data(State(state), Json(request))
            .await
            .expect("normal window should succeed");

        let filtered = response
            .headers()
            .get("x-edatime-filtered-rows")
            .and_then(|v| v.to_str().ok());
        let dropped = response
            .headers()
            .get("x-edatime-dropped-rows")
            .and_then(|v| v.to_str().ok());
        assert_eq!(
            filtered,
            Some("2"),
            "x-edatime-filtered-rows must equal the pre-LTTB row count"
        );
        assert_eq!(
            dropped,
            Some("0"),
            "x-edatime-dropped-rows must be 0 when the LTTB target is above the filtered row count"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn post_data_keeps_nan_series_at_the_viewport_cap() {
        let state = build_large_nan_state();
        let request =
            baseline_data_request(&state, "2018-01-01T00:00:00Z", "2018-01-02T00:00:00Z", 50);

        let response = post_data(State(state), Json(request))
            .await
            .expect("NaN-containing time series should remain renderable");
        let returned = response
            .headers()
            .get("x-edatime-returned-rows")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<usize>().ok())
            .expect("returned rows");
        assert!(
            returned <= 100,
            "one NaN must not bypass the viewport-derived cap"
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-sampling-algorithm")
                .and_then(|value| value.to_str().ok()),
            Some("envelope-lttb-v1")
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-downsampled")
                .and_then(|value| value.to_str().ok()),
            Some("1")
        );
        assert!(
            response
                .headers()
                .get("x-edatime-candidate-rows")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<usize>().ok())
                .is_some_and(|candidates| candidates <= 400),
            "bounded envelope must cap the collected candidates"
        );
    }

    fn request_with_sort(
        state: &AppState,
        start: &str,
        end: &str,
        width: usize,
        column: &str,
        descending: bool,
    ) -> PlanAwareDataQuery {
        let mut request = baseline_data_request(state, start, end, width);
        request.query.format = Some("json".to_string());
        request.cleaning_plan.plan.stages = vec![
            serde_json::from_value(serde_json::json!({
                "kind": "sort",
                "id": "sort-for-test",
                "enabled": true,
                "executionClass": "polarsExpression",
                "scope": "row",
                "sourcePage": "timeseries",
                "label": "test ordering",
                "note": null,
                "createdAt": "2026-07-15T00:00:00Z",
                "updatedAt": "2026-07-15T00:00:00Z",
                "columns": [column],
                "descending": descending,
                "nullsLast": true
            }))
            .expect("sort stage"),
        ];
        request
    }

    async fn json_timestamps(response: Response, time_column: &str) -> Vec<f64> {
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("JSON body");
        let payload: serde_json::Value = serde_json::from_slice(&bytes).expect("JSON payload");
        payload[time_column]
            .as_array()
            .expect("timestamp array")
            .iter()
            .map(|value| value.as_f64().expect("numeric timestamp"))
            .collect()
    }

    fn build_high_resolution_state(unit: polars::prelude::TimeUnit) -> AppState {
        let rows = 1_000usize;
        let multiplier = match unit {
            polars::prelude::TimeUnit::Milliseconds => 1_i64,
            polars::prelude::TimeUnit::Microseconds => 1_000_i64,
            polars::prelude::TimeUnit::Nanoseconds => 1_000_000_i64,
        };
        let origin_ms = 1_704_067_200_000_i64;
        let timestamps = (0..rows)
            .map(|index| origin_ms * multiplier + index as i64 * 1_000 * multiplier)
            .collect::<Vec<_>>();
        let ts = Series::new("ts".into(), timestamps)
            .cast(&polars::prelude::DataType::Datetime(unit, None))
            .expect("timestamp cast");
        let values = (0..rows)
            .map(|index| (index as f64).sin())
            .collect::<Vec<_>>();
        let frame = DataFrame::new(
            rows,
            vec![ts.into(), Series::new("HUFL".into(), values).into()],
        )
        .expect("high-resolution frame");
        AppState::new(frame, AppConfig::default())
    }

    fn build_daily_date_state() -> AppState {
        let rows = 1_000usize;
        let first_day_since_epoch = 18_262_i32; // 2020-01-01
        let timestamps = (0..rows)
            .map(|index| first_day_since_epoch + index as i32)
            .collect::<Vec<_>>();
        let ts = Series::new("ts".into(), timestamps)
            .cast(&polars::prelude::DataType::Date)
            .expect("daily Date cast");
        let values = (0..rows)
            .map(|index| (index as f64).sin())
            .collect::<Vec<_>>();
        let frame = DataFrame::new(
            rows,
            vec![ts.into(), Series::new("HUFL".into(), values).into()],
        )
        .expect("daily Date frame");
        AppState::new(frame, AppConfig::default())
    }

    fn build_date_state() -> AppState {
        let days_since_epoch = vec![19_723_i32, 19_724, 19_725];
        let ts = Series::new("ts".into(), days_since_epoch)
            .cast(&polars::prelude::DataType::Date)
            .expect("date cast");
        let frame = DataFrame::new(
            3,
            vec![
                ts.into(),
                Series::new("HUFL".into(), vec![1.0_f64, 2.0, 3.0]).into(),
            ],
        )
        .expect("date frame");
        AppState::new(frame, AppConfig::default())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn post_data_restores_chronological_order_after_cleaning_sorts() {
        let state = build_test_state();
        for sort_column in ["ts", "HUFL"] {
            let request = request_with_sort(
                &state,
                "2018-01-01T00:00:00Z",
                "2018-03-01T00:00:00Z",
                400,
                sort_column,
                true,
            );
            let response = post_data(State(state.clone()), Json(request))
                .await
                .expect("sorted Signals response");
            let timestamps = json_timestamps(response, "ts").await;
            assert!(
                timestamps.windows(2).all(|pair| pair[0] <= pair[1]),
                "Signals timestamps should be ascending after a {sort_column} sort"
            );
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn post_data_uses_epoch_ms_envelope_width_for_ms_us_and_ns() {
        let mut candidate_counts = Vec::new();
        for unit in [
            polars::prelude::TimeUnit::Milliseconds,
            polars::prelude::TimeUnit::Microseconds,
            polars::prelude::TimeUnit::Nanoseconds,
        ] {
            let state = build_high_resolution_state(unit);
            let mut unit_candidate_counts = Vec::new();
            for sort_column in ["ts", "HUFL"] {
                let request = request_with_sort(
                    &state,
                    "2024-01-01T00:00:00Z",
                    "2024-01-01T00:16:40Z",
                    50,
                    sort_column,
                    true,
                );
                let response = post_data(State(state.clone()), Json(request))
                    .await
                    .expect("high-resolution Signals response");
                assert_eq!(
                    response
                        .headers()
                        .get("x-edatime-filtered-rows")
                        .and_then(|value| value.to_str().ok()),
                    Some("1000"),
                    "all source units should filter the same requested rows"
                );
                let candidate_count = response
                    .headers()
                    .get("x-edatime-candidate-rows")
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<usize>().ok())
                    .expect("candidate row count");
                assert!(
                    candidate_count > 4 && candidate_count <= 400,
                    "{unit:?} {sort_column} candidate count was {candidate_count}"
                );
                unit_candidate_counts.push(candidate_count);
                let timestamps = json_timestamps(response, "ts").await;
                assert!(timestamps.windows(2).all(|pair| pair[0] <= pair[1]));
            }
            assert_eq!(unit_candidate_counts[0], unit_candidate_counts[1]);
            candidate_counts.push(unit_candidate_counts[0]);
        }
        assert!(
            candidate_counts
                .iter()
                .all(|count| *count == candidate_counts[0]),
            "equivalent ms/us/ns sources should produce comparable envelope sizes: {candidate_counts:?}"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn post_data_date_window_excludes_midnights_outside_requested_bounds() {
        let state = build_date_state();
        for (start, end, expected) in [
            (
                "2024-01-01T12:00:00Z",
                "2024-01-02T12:00:00Z",
                vec![1_704_153_600_000.0],
            ),
            ("2024-01-01T12:00:00Z", "2024-01-01T18:00:00Z", vec![]),
            (
                "2024-01-01T00:00:00Z",
                "2024-01-02T00:00:00Z",
                vec![1_704_067_200_000.0, 1_704_153_600_000.0],
            ),
        ] {
            let mut request = baseline_data_request(&state, start, end, 400);
            request.query.format = Some("json".to_string());
            let response = post_data(State(state.clone()), Json(request))
                .await
                .expect("Date viewport response");
            assert_eq!(
                json_timestamps(response, "ts").await,
                expected,
                "{start} to {end}"
            );
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn post_data_converts_epoch_ms_bounds_for_date_columns() {
        let state = build_date_state();
        let request =
            baseline_data_request(&state, "2024-01-01T00:00:00Z", "2024-01-04T00:00:00Z", 400);
        let response = post_data(State(state), Json(request))
            .await
            .expect("Date column Signals response");
        assert_eq!(
            response
                .headers()
                .get("x-edatime-filtered-rows")
                .and_then(|value| value.to_str().ok()),
            Some("3")
        );

        let state = build_daily_date_state();
        let request = request_with_sort(
            &state,
            "2020-01-01T00:00:00Z",
            "2022-09-27T00:00:00Z",
            50,
            "HUFL",
            true,
        );
        let response = post_data(State(state), Json(request))
            .await
            .expect("downsampled Date column Signals response");
        assert_eq!(
            response
                .headers()
                .get("x-edatime-filtered-rows")
                .and_then(|value| value.to_str().ok()),
            Some("1000")
        );
        let candidates = response
            .headers()
            .get("x-edatime-candidate-rows")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<usize>().ok())
            .expect("Date candidate count");
        assert!(candidates > 4 && candidates <= 408);
        let timestamps = json_timestamps(response, "ts").await;
        assert!(timestamps.windows(2).all(|pair| pair[0] <= pair[1]));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn envelope_only_reduction_is_reported_as_downsampled() {
        let state = build_duplicate_timestamp_state();
        let request =
            baseline_data_request(&state, "2018-01-01T00:00:00Z", "2018-01-01T00:01:00Z", 50);
        let response = post_data(State(state), Json(request))
            .await
            .expect("duplicate timestamp response");
        assert_eq!(
            response
                .headers()
                .get("x-edatime-filtered-rows")
                .and_then(|value| value.to_str().ok()),
            Some("1000")
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-candidate-rows")
                .and_then(|value| value.to_str().ok()),
            Some("4")
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-returned-rows")
                .and_then(|value| value.to_str().ok()),
            Some("4")
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-approximate")
                .and_then(|value| value.to_str().ok()),
            Some("1")
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-downsampled")
                .and_then(|value| value.to_str().ok()),
            Some("1")
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn post_data_applies_cleaning_plan_before_reduction() {
        let state = build_test_state();
        let version = state.current_dataset_version().expect("source version");
        let request: PlanAwareDataQuery = serde_json::from_value(serde_json::json!({
            "start": "2018-01-01T00:00:00Z",
            "end": "2018-04-01T00:00:00Z",
            "width": 400,
            "columns": "HUFL",
            "color_column": null,
            "lookaround_ms": null,
            "format": null,
            "cleaning_plan": {
                "plan": {
                    "schemaVersion": 1,
                    "id": "plan-1",
                    "planRevision": 1,
                    "sourceVersionId": version.id,
                    "datasetRevision": version.revision,
                    "datasetFingerprint": version.dataset_fingerprint,
                    "schemaFingerprint": version.schema_fingerprint,
                    "timeColumn": "ts",
                    "sourceName": null,
                    "stages": [{
                        "kind": "columnRange",
                        "id": "range-1",
                        "enabled": true,
                        "executionClass": "polarsExpression",
                        "scope": "row",
                        "sourcePage": "timeseries",
                        "label": "keep upper values",
                        "note": null,
                        "createdAt": "2026-07-15T00:00:00Z",
                        "updatedAt": "2026-07-15T00:00:00Z",
                        "column": "HUFL",
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
            }
        }))
        .expect("plan-aware data request");

        let response = post_data(State(state), Json(request))
            .await
            .expect("plan-aware data response");

        assert_eq!(
            response
                .headers()
                .get("x-edatime-filtered-rows")
                .and_then(|value| value.to_str().ok()),
            Some("3"),
        );
        assert!(
            response
                .headers()
                .get("x-edatime-plan-hash")
                .and_then(|value| value.to_str().ok())
                .is_some_and(|value| !value.is_empty()),
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-source-version")
                .and_then(|value| value.to_str().ok()),
            Some("source-0"),
        );
        assert!(
            response
                .headers()
                .get("x-edatime-schema-fingerprint")
                .and_then(|value| value.to_str().ok())
                .is_some_and(|value| value.starts_with("fnv1a-"))
        );
    }
}
