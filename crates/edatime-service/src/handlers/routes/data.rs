//! `GET /api/data` — full dataset

use axum::{
    extract::{Query, State},
    response::Response,
};

use edatime_core::pipeline::{Pipeline, ProjectStage, TimeFilterStage};

use crate::error::AppError;
use edatime_query::pipeline::{self, Reduction};
use edatime_query::query::{self, DataQuery};
use edatime_query::validation::{
    validate_numeric_columns_lazy, validate_time_window, validate_width,
};
use edatime_store::cache::CachedResponse;
use edatime_store::state::AppState;

#[tracing::instrument(skip(state))]
pub async fn get_data(
    State(state): State<AppState>,
    Query(params): Query<DataQuery>,
) -> Result<Response, AppError> {
    tracing::info!("get_data called with params: {:?}", params);

    validate_time_window(params.start, params.end)?;
    let limits = &state.config.validation;
    validate_width(params.width, limits)?;

    let lf = state.dataset_snapshot();
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

    let ctx = state.ts_context(&lf)?;
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
        "data:v{}:{}:{}:{}:{}:{}:{}:{:?}",
        state.dataset_revision(),
        params.start.timestamp_millis(),
        params.end.timestamp_millis(),
        params.width,
        lookaround_ms,
        value_cols.join(","),
        color_column.as_deref().unwrap_or(""),
        format,
    );

    if let Some(cached) = state.cache.get(&cache_key).await {
        state.metrics.record_cache_hit();
        return Ok(cached.into_response("hit"));
    }
    state.metrics.record_cache_miss();

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

    // Collect via QueryExecutor — runs on Rayon thread pool via spawn_blocking
    let filtered: edatime_core::types::DataFrame = state
        .query_executor
        .execute_async(pipeline.apply(lf))
        .await?;

    // Audit issue 1.4: capture the row count after the time filter /
    // non-finite cleanup but *before* LTTB so we can surface how many
    // rows were dropped by filtering. The LTTB step may also reduce
    // the row count further; we never let the dropped count go
    // negative.
    let filtered_rows = filtered.height();

    // ── LTTB reduction on collected DataFrame ─────────────────────────────────
    let target_points = params.width * 2;
    let extra_cols = color_column
        .iter()
        .filter(|color_col| !value_cols.iter().any(|value_col| value_col == *color_col))
        .cloned()
        .collect::<Vec<String>>();
    let (reduced, was_downsampled) = pipeline::apply_reduction(
        &filtered,
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
    let empty_header = if returned_rows == 0 {
        "1"
    } else {
        "0"
    };
    // Filter-drop accounting (audit issue 1.4): expose how many rows
    // survived the time filter and how many were dropped relative to
    // the pre-LTTB filtered set. LTTB can also reduce rows; clamp at
    // zero so the contract stays non-negative.
    let dropped_rows = filtered_rows.saturating_sub(returned_rows);
    let cached = cached.with_extra_headers(vec![
        ("x-edatime-empty".to_string(), empty_header.to_string()),
        ("x-edatime-filtered-rows".to_string(), filtered_rows.to_string()),
        (
            "x-edatime-dropped-rows".to_string(),
            dropped_rows.to_string(),
        ),
    ]);

    state.cache.insert(cache_key, cached.clone()).await;
    Ok(cached.into_response("miss"))
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::*;
    use axum::extract::{Query, State};
    use chrono::TimeZone;
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
            vec![
                ts_series.into(),
                Series::new("HUFL".into(), xs).into(),
            ],
        )
        .expect("test dataframe should build");
        AppState::new(df, AppConfig::default())
    }

    /// Regression test for audit issue 2.3: a future time window used
    /// to return an empty Arrow payload without any signal that no
    /// data was found. The handler now sets `x-edatime-empty: 1` on
    /// the response so the frontend can render an explicit
    /// "no data in range" message.
    #[tokio::test(flavor = "multi_thread")]
    async fn get_data_emits_empty_header_when_no_rows_match() {
        let state = build_test_state();
        let params = DataQuery {
            start: chrono::Utc.with_ymd_and_hms(2030, 1, 1, 0, 0, 0).unwrap(),
            end: chrono::Utc.with_ymd_and_hms(2031, 1, 1, 0, 0, 0).unwrap(),
            width: 400,
            columns: Some("HUFL".to_string()),
            color_column: None,
            lookaround_ms: None,
            format: None,
        };
        let response = get_data(State(state), Query(params))
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
    async fn get_data_emits_empty_zero_header_when_rows_match() {
        let state = build_test_state();
        let params = DataQuery {
            start: chrono::Utc.with_ymd_and_hms(2018, 1, 1, 0, 0, 0).unwrap(),
            end: chrono::Utc.with_ymd_and_hms(2018, 2, 1, 0, 0, 0).unwrap(),
            width: 400,
            columns: Some("HUFL".to_string()),
            color_column: None,
            lookaround_ms: None,
            format: None,
        };
        let response = get_data(State(state), Query(params))
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
    async fn get_data_emits_filtered_and_dropped_rows_headers() {
        let state = build_test_state();
        let params = DataQuery {
            start: chrono::Utc.with_ymd_and_hms(2018, 1, 1, 0, 0, 0).unwrap(),
            end: chrono::Utc.with_ymd_and_hms(2018, 2, 1, 0, 0, 0).unwrap(),
            width: 400,
            columns: Some("HUFL".to_string()),
            color_column: None,
            lookaround_ms: None,
            format: None,
        };
        let response = get_data(State(state), Query(params))
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
}
