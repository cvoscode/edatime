//! `GET /api/data` — full dataset

use axum::{Json, extract::State, response::Response};
use serde::Deserialize;

use edatime_core::pipeline::{Pipeline, ProjectStage, TimeFilterStage};

use crate::error::AppError;
use edatime_query::pipeline::{self, Reduction};
use edatime_query::query::{self, DataQuery};
use edatime_query::validation::{
    validate_numeric_columns_lazy, validate_time_window, validate_width,
};
use edatime_store::cache::{CacheReservation, CachedResponse};
use edatime_store::state::AppState;

use super::{
    cleaning::{PlanRequestEnvelope, compile_request_frame},
    shared::ExecutionIdentity,
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

    let (version, plan_hash, lf) = compile_request_frame(&state, cleaning_plan)?;
    let identity = ExecutionIdentity::from_version(version, Some(plan_hash));
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
    let lookaround_ts = lookaround_ms.saturating_mul(ctx.multiplier.abs());
    let start_ts = params
        .start
        .timestamp_millis()
        .saturating_mul(ctx.multiplier)
        .saturating_sub(lookaround_ts);
    let end_ts = params
        .end
        .timestamp_millis()
        .saturating_mul(ctx.multiplier)
        .saturating_add(lookaround_ts);
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
            return Ok(response.into_response(if coalesced { "coalesced" } else { "hit" }));
        }
        CacheReservation::Producer(producer) => {
            state.metrics.record_cache_miss();
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
    let filtered_plan = pipeline.apply(lf);

    let target_points = params.width * 2;
    let candidate_cap = target_points.saturating_mul(4).max(target_points);
    // One bounded probe preserves exact behavior for small windows without a
    // separate full count scan. Large windows then use one shared multi-series
    // envelope scan that also returns the exact filtered-row count.
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
    let (candidates, filtered_rows, envelope_used) = if use_envelope {
        let bucket_count = (candidate_cap / 4).max(1) as i64;
        let span = end_ts.saturating_sub(start_ts).saturating_add(1);
        let bucket_width = (span / bucket_count).max(1);
        let envelope = pipeline::lazy_multi_time_envelope(
            filtered_plan,
            &ts_col,
            &value_cols,
            &extra_cols,
            bucket_width,
        )?;
        let collected = state.query_executor.execute_async(envelope).await?;
        let (expanded, filtered_rows) =
            pipeline::expand_multi_time_envelope(&collected, &ts_col, &value_cols, &extra_cols)?;
        (expanded, filtered_rows, true)
    } else {
        let filtered_rows = bounded_probe.height();
        (bounded_probe, filtered_rows, false)
    };
    let candidate_rows = candidates.height();
    let (reduced, was_downsampled) = pipeline::apply_reduction(
        &candidates,
        &value_cols,
        &extra_cols,
        &Reduction::Lttb { target_points },
        &ts_col,
    )?;
    let returned_rows = reduced.height();

    let cached = match format {
        query::OutputFormat::Arrow => CachedResponse::arrow(
            pipeline::serialize_arrow(reduced, &ts_col)?,
            was_downsampled,
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
                was_downsampled,
                returned_rows,
                target_points,
                Some(ts_col.to_string()),
            )
        }
    };

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
    Ok(cached.into_response("miss"))
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
            Some("2"),
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
