//! `GET /api/aggregate` — bucket-aggregated data for bar / heatmap charts.

use axum::{
    extract::{Query, State},
    response::Response,
};

use crate::error::AppError;
use crate::pipeline::{self, Reduction, ResponseMeta};
use crate::query::{self, AggregateQuery, AggregateWindowMode};
use crate::state::AppState;
use crate::validation::{
    validate_bucket_count, validate_numeric_columns, validate_time_window, validate_window_ms,
};
use polars::prelude::IntoLazy;

#[tracing::instrument(skip(state))]
pub async fn get_aggregate(
    State(state): State<AppState>,
    Query(params): Query<AggregateQuery>,
) -> Result<Response, AppError> {
    tracing::info!("get_aggregate called with params: {:?}", params);

    validate_time_window(params.start, params.end)?;
    if matches!(params.window_mode, AggregateWindowMode::Buckets) {
        validate_bucket_count(params.buckets)?;
    }

    let df = state.dataset_snapshot().await;
    let value_cols = validate_numeric_columns(&df, &query::parse_columns(&params.columns))?;

    let multiplier = query::unit_multiplier_for_ts(&df)?;
    let dtype = query::ts_dtype(&df)?;
    let start_ts = params.start.timestamp_millis() * multiplier;
    let end_ts = params.end.timestamp_millis() * multiplier;

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

    let filtered = pipeline::filter_time_range(df.lazy(), start_ts, end_ts, &value_cols)?;
    let (aggregated, _) = pipeline::apply_reduction(&filtered, &value_cols, &[], &reduction)?;
    let returned_rows = aggregated.height();

    pipeline::build_response(
        aggregated,
        &value_cols,
        query::output_format(&params.format),
        &dtype,
        ResponseMeta {
            is_downsampled: true,
            returned_rows,
            target_points: params.buckets,
        },
    )
}
