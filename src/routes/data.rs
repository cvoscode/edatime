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
use crate::validation::{validate_numeric_columns_lazy, validate_time_window, validate_width};

#[tracing::instrument(skip(state))]
pub async fn get_data(
    State(state): State<AppState>,
    Query(params): Query<DataQuery>,
 ) -> Result<Response, AppError> {
    tracing::info!("get_data called with params: {:?}", params);

    validate_time_window(params.start, params.end)?;
    let limits = &state.config.validation;
    validate_width(params.width, limits)?;

    let lf = state.dataset_snapshot().await.read().await.clone();
    let value_cols = validate_numeric_columns_lazy(&lf, &query::parse_columns(params.columns.as_deref()), limits)?;

    let color_column = params
        .color_column
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let schema = lf.clone().collect_schema().map_err(|e| AppError::internal(e.to_string()))?;
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
    let start_ts = params.start.timestamp_millis() * ctx.multiplier;
    let end_ts = params.end.timestamp_millis() * ctx.multiplier;
    let dtype = ctx.dtype;
    let ts_col = ctx.ts_col;
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

    let filtered = pipeline::filter_time_range(lf.clone(), start_ts, end_ts, &output_cols, &ts_col)?;
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
            )
        },
    };

    state.cache.insert(cache_key, cached.clone()).await;
    Ok(cached.into_response("miss"))
}
