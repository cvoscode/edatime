use axum::response::Response;

use crate::cache::CachedResponse;
use crate::error::AppError;
use crate::pipeline::{self, Reduction};
use crate::query::{self, DataQuery};
use crate::state::AppState;
use crate::validation::{validate_numeric_columns, validate_time_window, validate_width};

#[derive(Clone)]
pub struct DataService {
    state: AppState,
}

impl DataService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    pub async fn get_data(&self, params: DataQuery) -> Result<Response, AppError> {
        validate_time_window(params.start, params.end)?;
        validate_width(params.width)?;

        let df = self.state.dataset_snapshot().await;
        let value_cols = validate_numeric_columns(&df, &query::parse_columns(&params.columns))?;

        let multiplier = query::unit_multiplier_for_ts(&df)?;
        let dtype = query::ts_dtype(&df)?;
        let start_ts = params.start.timestamp_millis() * multiplier;
        let end_ts = params.end.timestamp_millis() * multiplier;
        let format = query::output_format(&params.format);
        let cache_key = format!(
            "data:v{}:{}:{}:{}:{}:{:?}",
            self.state.dataset_revision(),
            params.start.timestamp_millis(),
            params.end.timestamp_millis(),
            params.width,
            value_cols.join(","),
            format,
        );

        if let Some(cached) = self.state.cache.get(&cache_key).await {
            self.state.metrics.record_cache_hit();
            return Ok(cached.into_response("hit"));
        }
        self.state.metrics.record_cache_miss();

        let filtered = pipeline::filter_time_range(df, start_ts, end_ts, &value_cols)?;
        let target_points = params.width * 2;
        let (reduced, was_downsampled) =
            pipeline::apply_reduction(&filtered, &value_cols, &Reduction::Lttb { target_points })?;
        let returned_rows = reduced.height();

        let cached = match format {
            query::OutputFormat::Arrow => CachedResponse::arrow(
                pipeline::serialize_arrow(reduced)?,
                was_downsampled,
                returned_rows,
                target_points,
            ),
            query::OutputFormat::Json => CachedResponse::json(
                serde_json::to_vec(&pipeline::serialize_json(&reduced, &value_cols, &dtype)?)
                    .map_err(|error| {
                        AppError::internal(format!("Failed to encode JSON response: {error}"))
                    })?,
                was_downsampled,
                returned_rows,
                target_points,
            ),
        };

        self.state.cache.insert(cache_key, cached.clone()).await;
        Ok(cached.into_response("miss"))
    }
}
