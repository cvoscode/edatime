//! Shared route helpers used across multiple route modules.

use axum::http::{HeaderValue, Response};
use chrono::{DateTime, Utc};

use crate::error::AppError;
use crate::pipeline;
use crate::query;
use crate::state::AppState;
use crate::validation::{validate_numeric_columns_lazy, validate_time_window};
use polars::prelude::DataFrame;

/// Metadata for edatime HTTP response headers.
#[derive(Debug, Clone)]
pub struct ResponseMeta {
    pub is_downsampled: bool,
    pub returned_rows: usize,
    pub target_points: Option<usize>,
}

/// Add the standard edatime headers (`x-edatime-downsampled`, `x-edatime-returned-rows`,
/// `x-edatime-target-points`) to a response. Both `pipeline.rs` and `cache.rs` use this.
pub fn add_edatime_headers<B>(mut response: Response<B>, meta: &ResponseMeta) -> Response<B> {
    response.headers_mut().insert(
        "x-edatime-downsampled",
        HeaderValue::from_static(if meta.is_downsampled { "1" } else { "0" }),
    );
    if let Ok(v) = HeaderValue::from_str(&meta.returned_rows.to_string()) {
        response.headers_mut().insert("x-edatime-returned-rows", v);
    }
    if let Some(tp) = meta.target_points
        && let Ok(v) = HeaderValue::from_str(&tp.to_string())
    {
        response.headers_mut().insert("x-edatime-target-points", v);
    }
    response
}

/// Common preamble: validate time window, snapshot dataset, parse & validate
/// columns, compute time-range filter. Returns `(value_cols, filtered_df)`.
pub async fn filter_preamble(
    state: &AppState,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    columns: Option<&str>,
) -> Result<(Vec<String>, DataFrame), AppError> {
    validate_time_window(start, end)?;
    let lf = state.dataset_snapshot();
    let cols = query::parse_columns(columns);
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns_lazy(&lf, &cols, limits)?;
    let ts_col = state.time_column_display_name_sync()
        .unwrap_or_else(|| "ts".to_string());
    let multiplier = query::unit_multiplier_for_ts_lazy(&lf, &ts_col)?;
    let start_ts = start.timestamp_millis() * multiplier;
    let end_ts = end.timestamp_millis() * multiplier;
    // filter_time_range now returns LazyFrame; collect once here
    let filtered_lf = pipeline::filter_time_range(lf, start_ts, end_ts, &value_cols, &ts_col)?;
    let filtered = tokio::task::block_in_place(|| {
        filtered_lf.with_new_streaming(true).collect()
    })
    .map_err(|e| AppError::io(e.to_string()))?;
    Ok((value_cols, filtered))
}

/// Downsample a DataFrame by taking every Nth row when it exceeds `max_pts`.
pub fn downsample_by_stride(df: DataFrame, max_pts: usize, label: &str) -> Result<DataFrame, AppError> {
    if df.height() <= max_pts {
        return Ok(df);
    }
    let step = df.height() / max_pts;
    let indices: Vec<u32> = (0..df.height())
        .step_by(step.max(1))
        .take(max_pts)
        .map(|i| i as u32)
        .collect();
    use polars::prelude::NamedFrom;
    let idx_ca = polars::prelude::IdxCa::new("idx".into(), &indices);
    df.take(&idx_ca)
        .map_err(|e| AppError::internal(format!("{label} downsample: {e}")))
}