use axum::response::Response;

use crate::error::AppError;
use crate::pipeline::{self, Reduction, ResponseMeta};
use crate::query::{self, AggregateQuery};
use crate::state::AppState;
use crate::validation::{validate_bucket_count, validate_numeric_columns, validate_time_window};

#[derive(Clone)]
pub struct AggregateService {
    state: AppState,
}

impl AggregateService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    pub async fn get_aggregate(&self, params: AggregateQuery) -> Result<Response, AppError> {
        validate_time_window(params.start, params.end)?;
        validate_bucket_count(params.buckets)?;

        let df = self.state.dataset_snapshot().await;
        let value_cols = validate_numeric_columns(&df, &query::parse_columns(&params.columns))?;

        let multiplier = query::unit_multiplier_for_ts(&df)?;
        let dtype = query::ts_dtype(&df)?;
        let start_ts = params.start.timestamp_millis() * multiplier;
        let end_ts = params.end.timestamp_millis() * multiplier;

        let filtered = pipeline::filter_time_range(df, start_ts, end_ts, &value_cols)?;
        let (aggregated, _) = pipeline::apply_reduction(
            &filtered,
            &value_cols,
            &Reduction::BucketAgg {
                buckets: params.buckets,
                agg: params.agg,
            },
        )?;
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
}
