//! `GET /api/aggregate` — bucket-aggregated data for bar / heatmap charts.

use axum::{
    extract::{Query, State},
    response::Response,
};
use chrono::Utc;

use crate::error::AppError;
use crate::pipeline::{self, Reduction, ResponseMeta};
use crate::query::{self, AggregateQuery, AggregateWindowMode, QueryEntry, ReductionSpec, AggFn};
use crate::state::AppState;
use crate::validation::{
    validate_bucket_count, validate_numeric_columns_lazy, validate_time_window, validate_window_ms,
};

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

    let lf = state.dataset_snapshot().await.read().await.clone();
    let value_cols = query::parse_columns(params.columns.as_deref());
    let value_cols = validate_numeric_columns_lazy(&lf, &value_cols, limits)?;

    let ts_col = state.time_column_display_name_sync()
        .unwrap_or_else(|| "ts".to_string());
    let multiplier = query::unit_multiplier_for_ts_lazy(&lf, &ts_col)?;
    let dtype = query::ts_dtype_lazy(&lf, &ts_col)?;
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

    let filtered = pipeline::filter_time_range(lf, start_ts, end_ts, &value_cols, &ts_col)?;
    let (aggregated, _) = pipeline::apply_reduction(&filtered, &value_cols, &[], &reduction, &ts_col)?;
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
        route: "/api/aggregate".to_string(),
        start_ms: Some(params.start.timestamp_millis()),
        end_ms: Some(params.end.timestamp_millis()),
        width: None,
        columns: value_cols.clone(),
        color_column: None,
        format: format!("{:?}", params.format.as_deref().unwrap_or("arrow")),
        reduction: Some(reduction_spec),
        ts_dtype: dtype.to_string(),
    });

    pipeline::build_response(
        aggregated,
        &value_cols,
        query::output_format(params.format.as_deref()),
        &dtype,
        &ts_col,
        ResponseMeta {
            is_downsampled: true,
            returned_rows,
            target_points: params.buckets,
        },
    )
}