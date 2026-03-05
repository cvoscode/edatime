//! `GET /api/aggregate` — bucket-aggregated data for bar / heatmap charts.

use axum::{
    extract::{Query, State},
    response::Response,
};

use crate::error::AppError;
use crate::pipeline::{self, Reduction, ResponseMeta};
use crate::query::{self, AggregateQuery};
use crate::state::AppState;

#[tracing::instrument(skip(state))]
pub async fn get_aggregate(
    State(state): State<AppState>,
    Query(params): Query<AggregateQuery>,
) -> Result<Response, AppError> {
    tracing::info!("get_aggregate called with params: {:?}", params);

    let df_lock = state.df.read().await;
    let df = df_lock.clone();
    drop(df_lock);

    let value_cols = query::parse_columns(&params.columns);
    if value_cols.is_empty() {
        return Err(AppError::BadRequest("No columns provided".into()));
    }

    let multiplier = query::unit_multiplier_for_ts(&df)?;
    let dtype = query::ts_dtype(&df)?;
    let start_ts = params.start.timestamp_millis() * multiplier;
    let end_ts = params.end.timestamp_millis() * multiplier;

    // Stage 1: filter
    let filtered = pipeline::filter_time_range(df, start_ts, end_ts, &value_cols)?;

    // Stage 2: bucket aggregation
    let (aggregated, _) = pipeline::apply_reduction(
        &filtered,
        &value_cols,
        &Reduction::BucketAgg {
            buckets: params.buckets,
            agg: params.agg,
        },
    )?;
    let returned_rows = aggregated.height();

    // Stage 3: serialize
    let format = query::output_format(&params.format);
    pipeline::build_response(
        aggregated,
        &value_cols,
        format,
        &dtype,
        ResponseMeta {
            is_downsampled: true,
            returned_rows,
            target_points: params.buckets,
        },
    )
}
