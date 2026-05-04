//! `GET /api/data` — full dataset

use axum::{
    extract::{Query, State},
    response::Response,
};

use crate::cache::CachedResponse;
use crate::error::AppError;
use crate::pipeline::{self, Reduction};
use crate::query::{self, DataQuery};
use crate::state::AppState;
use crate::validation::{validate_numeric_columns, validate_time_window, validate_width};
use polars::prelude::IntoLazy;

#[tracing::instrument(skip(state))]
pub async fn get_data(
    State(state): State<AppState>,
    Query(params): Query<DataQuery>,
) -> Result<Response, AppError> {
    tracing::info!("get_data called with params: {:?}", params);

    validate_time_window(params.start, params.end)?;
    let limits = &state.config.validation;
    validate_width(params.width, limits)?;

    let df = state.dataset_snapshot().await.read().await.clone();
    let value_cols = validate_numeric_columns(&df, &query::parse_columns(params.columns.as_deref()), limits)?;

    let color_column = params
        .color_column
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if let Some(color_col) = color_column.as_ref()
        && !df.get_column_names().iter().any(|c| *c == color_col) {
            return Err(AppError::bad_request(format!(
                "Color column '{}' is not present in dataset",
                color_col
            )));
        }

    let mut output_cols = value_cols.clone();
    if let Some(color_col) = color_column.as_ref()
        && !output_cols.iter().any(|c| c == color_col) {
            output_cols.push(color_col.clone());
        }

    let multiplier = query::unit_multiplier_for_ts(&df)?;
    let dtype = query::ts_dtype(&df)?;
    let start_ts = params.start.timestamp_millis() * multiplier;
    let end_ts = params.end.timestamp_millis() * multiplier;
    let format = query::output_format(params.format.as_deref());
    let cache_key = format!(
        "data:v{}:{}:{}:{}:{}:{}:{:?}",
        state.dataset_revision(),
        params.start.timestamp_millis(),
        params.end.timestamp_millis(),
        params.width,
        value_cols.join(","),
        color_column.as_deref().unwrap_or(""),
        format,
    );

    if let Some(cached) = state.cache.get(&cache_key).await {
        state.metrics.record_cache_hit();
        return Ok(cached.into_response("hit"));
    }
    state.metrics.record_cache_miss();

    let filtered = pipeline::filter_time_range(df.lazy(), start_ts, end_ts, &output_cols)?;
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
    )?;
    let returned_rows = reduced.height();

    let cached = match format {
        query::OutputFormat::Arrow => CachedResponse::arrow(
            pipeline::serialize_arrow(reduced)?,
            was_downsampled,
            returned_rows,
            target_points,
        ),
        query::OutputFormat::Json => CachedResponse::json(
            serde_json::to_vec(&pipeline::serialize_json(
                &reduced,
                &value_cols,
                color_column.as_ref(),
                &dtype,
            )?)
            .map_err(|error| {
                AppError::internal(format!("Failed to encode JSON response: {error}"))
            })?,
            was_downsampled,
            returned_rows,
            target_points,
        ),
    };

    state.cache.insert(cache_key, cached.clone()).await;
    Ok(cached.into_response("miss"))
}
