//! Shared route helpers used across multiple route modules.

use axum::http::{HeaderValue, Response};
use chrono::{DateTime, Utc};

use crate::error::AppError;
use edatime_query::pipeline;
use edatime_query::query;
use edatime_query::validation::{validate_numeric_columns_lazy, validate_time_window};
use edatime_store::state::AppState;
use polars::prelude::DataFrame;

use crate::handlers::routes::cleaning::{PlanRequestEnvelope, compile_request_frame};

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
    let ctx = state.ts_context(&lf)?;
    let ts_col = ctx.ts_col;
    let start_ts = start.timestamp_millis() * ctx.multiplier;
    let end_ts = end.timestamp_millis() * ctx.multiplier;
    let filtered_lf = pipeline::filter_time_range(lf, start_ts, end_ts, &value_cols, &ts_col)?;
    let filtered = state.query_executor.execute_async(filtered_lf).await?;
    Ok((value_cols, filtered))
}

/// Plan-aware variant for analytics GET routes. The envelope is URL-encoded
/// JSON solely for transport compatibility; it is still validated against the
/// immutable source before any page-local time/projection work is applied.
pub async fn filter_preamble_with_plan(
    state: &AppState,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    columns: Option<&str>,
    cleaning_plan: Option<&str>,
) -> Result<(Vec<String>, DataFrame), AppError> {
    validate_time_window(start, end)?;
    let (lf, time_column) = match cleaning_plan.filter(|raw| !raw.trim().is_empty()) {
        Some(raw) => {
            let envelope: PlanRequestEnvelope = serde_json::from_str(raw).map_err(|error| {
                AppError::bad_request(format!("Invalid cleaning plan query: {error}"))
            })?;
            let (_version, _hash, frame) = compile_request_frame(state, &envelope)?;
            (frame, envelope.plan.time_column)
        }
        None => (
            state.dataset_snapshot(),
            state
                .time_column_display_name_sync()
                .unwrap_or_else(|| "ts".to_string()),
        ),
    };
    let cols = query::parse_columns(columns);
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns_lazy(&lf, &cols, limits)?;
    let ctx = edatime_core::temporal::ts_context(&lf, &time_column)?;
    let filtered_lf = pipeline::filter_time_range(
        lf,
        start.timestamp_millis() * ctx.multiplier,
        end.timestamp_millis() * ctx.multiplier,
        &value_cols,
        &ctx.ts_col,
    )?;
    Ok((
        value_cols,
        state.query_executor.execute_async(filtered_lf).await?,
    ))
}

/// Downsample a DataFrame by taking every Nth row when it exceeds `max_pts`.
pub fn downsample_by_stride(
    df: DataFrame,
    max_pts: usize,
    label: &str,
) -> Result<DataFrame, AppError> {
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
