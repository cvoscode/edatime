//! `GET /api/v1/aggregate` — bucket-aggregated data for bar / heatmap charts.

use axum::{
    extract::{Query, State},
    response::Response,
};
use chrono::Utc;

use edatime_core::types;

use crate::error::AppError;
use edatime_query::pipeline::{self, Reduction};
use edatime_query::query::{
    self, AggFn, AggregateQuery, AggregateWindowMode, OutputFormat, QueryEntry, ReductionSpec,
    output_format,
};
use edatime_query::validation::{
    validate_bucket_count, validate_numeric_columns_lazy, validate_time_window, validate_window_ms,
};
use edatime_store::cache::{CacheReservation, CachedResponse};
use edatime_store::state::AppState;

use super::shared::cached_response;

#[tracing::instrument(skip(state))]
pub async fn get_aggregate(
    State(state): State<AppState>,
    Query(params): Query<AggregateQuery>,
) -> Result<Response, AppError> {
    tracing::info!("get_aggregate called with params: {:?}", params);

    validate_time_window(params.start, params.end)?;
    let limits = &state.config.validation;
    if matches!(params.window_mode, AggregateWindowMode::Buckets) {
        validate_bucket_count(params.buckets, limits)?;
    }

    let lf = state.dataset_snapshot();
    let value_cols = query::parse_columns(params.columns.as_deref());
    let value_cols = validate_numeric_columns_lazy(&lf, &value_cols, limits)?;

    let ctx = state.ts_context(&lf)?;
    let start_ts = params.start.timestamp_millis() * ctx.multiplier;
    let end_ts = params.end.timestamp_millis() * ctx.multiplier;
    let ts_col = ctx.ts_col;
    let multiplier = ctx.multiplier;
    let dtype = ctx.dtype;

    let reduction = match params.window_mode {
        AggregateWindowMode::Buckets => Reduction::BucketAgg {
            buckets: params.buckets,
            agg: params.agg,
        },
        AggregateWindowMode::Tumbling | AggregateWindowMode::Sliding => {
            let window_ms = params.window_ms.unwrap_or(60_000);
            let requested_step_ms = params.step_ms;
            validate_window_ms(window_ms, requested_step_ms)?;

            let step_ms = match params.window_mode {
                AggregateWindowMode::Tumbling => window_ms,
                AggregateWindowMode::Sliding => requested_step_ms.unwrap_or(window_ms),
                AggregateWindowMode::Buckets => window_ms,
            };

            let window_native = window_ms.checked_mul(multiplier).ok_or_else(|| {
                AppError::bad_request("Window size is too large for the current timestamp unit")
            })?;
            let step_native = step_ms.checked_mul(multiplier).ok_or_else(|| {
                AppError::bad_request("Window step is too large for the current timestamp unit")
            })?;

            Reduction::WindowAgg {
                window_size_native: window_native,
                step_size_native: step_native,
                agg: params.agg,
            }
        }
    };

    let cache_key = format!(
        "agg:v2:{}:{}:{}:{}:{:?}:{:?}:{}:{}:{}:{}",
        state.dataset_revision(),
        params.start.timestamp_millis(),
        params.end.timestamp_millis(),
        value_cols.join(","),
        params.agg,
        params.window_mode,
        params.buckets,
        params.window_ms.unwrap_or_default(),
        params.step_ms.unwrap_or_default(),
        params.format.as_deref().unwrap_or("arrow"),
    );
    let _cache_producer = match state.cache.reserve(&cache_key).await {
        CacheReservation::Hit {
            response,
            coalesced,
        } => {
            state.metrics.record_cache_hit();
            return Ok(cached_response(
                response,
                if coalesced { "coalesced" } else { "hit" },
            ));
        }
        CacheReservation::Producer(producer) => {
            state.metrics.record_cache_miss();
            producer
        }
    };

    // ── Lazy pipeline: time filter + column projection (with ts_col) ────────
    // Reuse `filter_time_range` so the time column is always projected alongside
    // the requested value columns. `apply_reduction` / `bucket_aggregate` need
    // the ts column to be present, and `filter_time_range` is the single
    // source of truth for the column-projection shape used by the line/scatter
    // paths (see shared::filter_preamble).
    let filtered_lf = pipeline::filter_time_range(lf, start_ts, end_ts, &value_cols, &ts_col)?;

    // Collect via QueryExecutor — runs on Rayon thread pool via spawn_blocking
    let filtered: types::DataFrame = state.query_executor.execute_async(filtered_lf).await?;

    // BucketAgg and WindowAgg use polars' streaming engine internally, which
    // starts its own tokio runtime. Running that on a tokio worker thread
    // raises `Cannot start a runtime from within a runtime`, so we offload the
    // reduction step to a blocking thread (similar to `execute_async`).
    let filtered_for_reduction = filtered.clone();
    let value_cols_for_reduction = value_cols.clone();
    let ts_col_for_reduction = ts_col.clone();
    let (aggregated, _) = state
        .query_executor
        .run_interactive(edatime_core::metrics::CpuStage::Query, move || {
            pipeline::apply_reduction(
                &filtered_for_reduction,
                &value_cols_for_reduction,
                &[],
                &reduction,
                &ts_col_for_reduction,
            )
        })
        .await
        .map_err(AppError::from)??;
    let returned_rows = aggregated.height();

    // Log query
    let qid = state.next_query_id();
    let agg_str = match params.agg {
        AggFn::Mean => "mean",
        AggFn::Sum => "sum",
        AggFn::Min => "min",
        AggFn::Max => "max",
        AggFn::Count => "count",
    };
    let reduction_spec = match params.window_mode {
        AggregateWindowMode::Buckets => ReductionSpec::BucketAgg {
            buckets: params.buckets,
            agg: agg_str.to_string(),
        },
        AggregateWindowMode::Tumbling | AggregateWindowMode::Sliding => {
            let window_ms = params.window_ms.unwrap_or(60_000);
            let step_ms = params.step_ms.unwrap_or(window_ms);
            ReductionSpec::WindowAgg {
                window_ms,
                step_ms,
                agg: agg_str.to_string(),
            }
        }
    };
    state.push_query(QueryEntry {
        id: qid,
        timestamp: Utc::now(),
        route: "/api/v1/aggregate".to_string(),
        start_ms: Some(params.start.timestamp_millis()),
        end_ms: Some(params.end.timestamp_millis()),
        width: None,
        columns: value_cols.clone(),
        color_column: None,
        format: format!("{:?}", params.format.as_deref().unwrap_or("arrow")),
        reduction: Some(reduction_spec),
        ts_dtype: dtype.to_string(),
    });

    let cached = match output_format(params.format.as_deref()) {
        OutputFormat::Json => {
            // JSON variant: emit a summary payload that lists row count,
            // column names, and a flat per-column arrays view. This is a
            // useful drop-in for clients that don't ship an Arrow parser.
            use polars::prelude::DataType;
            let mut column_arrays = serde_json::Map::with_capacity(aggregated.width());
            for name in aggregated.get_column_names() {
                let column = aggregated.column(name.as_str()).map_err(|e| {
                    AppError::internal(format!("aggregate json column '{}': {}", name, e))
                })?;
                let series = column.as_materialized_series().clone();
                let values: Vec<serde_json::Value> = match series.dtype() {
                    DataType::Float64 | DataType::Float32 | DataType::Int64 | DataType::Int32 => {
                        let ca = series
                            .cast(&DataType::Float64)
                            .ok()
                            .and_then(|s| s.f64().ok().cloned());
                        match ca {
                            Some(ca) => ca
                                .into_iter()
                                .map(|v| match v {
                                    Some(f) => serde_json::json!(f),
                                    None => serde_json::Value::Null,
                                })
                                .collect(),
                            None => Vec::new(),
                        }
                    }
                    DataType::Datetime(_, _) | DataType::Date => {
                        let ca = series
                            .cast(&DataType::Int64)
                            .ok()
                            .and_then(|s| s.i64().ok().cloned());
                        match ca {
                            Some(ca) => ca
                                .into_iter()
                                .map(|v| match v {
                                    Some(i) => serde_json::json!(i),
                                    None => serde_json::Value::Null,
                                })
                                .collect(),
                            None => Vec::new(),
                        }
                    }
                    _ => {
                        let ca = series
                            .cast(&DataType::String)
                            .ok()
                            .and_then(|s| s.str().ok().cloned());
                        match ca {
                            Some(ca) => ca
                                .into_iter()
                                .map(|v| match v {
                                    Some(s) => serde_json::json!(s.to_string()),
                                    None => serde_json::Value::Null,
                                })
                                .collect(),
                            None => Vec::new(),
                        }
                    }
                };
                column_arrays.insert(name.to_string(), serde_json::Value::Array(values));
            }
            let payload = serde_json::json!({
                "rows": returned_rows,
                "columns": aggregated.get_column_names(),
                "data": column_arrays,
            });
            let json_bytes = serde_json::to_vec(&payload)
                .map_err(|e| AppError::internal(format!("aggregate json: {}", e)))?;
            CachedResponse::json(
                json_bytes,
                true,
                returned_rows,
                params.buckets,
                Some(ts_col.to_string()),
            )
        }
        OutputFormat::Arrow => CachedResponse::arrow(
            pipeline::serialize_arrow(aggregated.clone(), &ts_col)?,
            true,
            returned_rows,
            params.buckets,
            Some(ts_col.to_string()),
        ),
    };

    state.cache.insert(cache_key, cached.clone()).await;
    Ok(cached_response(cached, "miss"))
}
