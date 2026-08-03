//! Shared route helpers used across multiple route modules.

use axum::http::{HeaderValue, Response};
use chrono::{DateTime, Utc};

use crate::error::AppError;
use edatime_core::http::ResponseMeta;
use edatime_query::pipeline;
use edatime_query::query;
use edatime_query::validation::{validate_numeric_columns_lazy, validate_time_window};
use edatime_store::state::AppState;

pub(crate) fn enforce_work_budget(
    workload: &str,
    estimated: u128,
    limit: u128,
) -> Result<(), AppError> {
    if estimated > limit {
        return Err(AppError::bad_request_code(
            crate::error::ErrorCode::WorkBudgetExceeded,
            format!(
                "{workload} exceeds the configured work budget: estimated={estimated}, limit={limit}"
            ),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod budget_tests {
    use super::enforce_work_budget;
    use crate::error::ErrorCode;

    #[test]
    fn work_budget_accepts_boundary_and_rejects_one_over() {
        assert!(enforce_work_budget("test", 100, 100).is_ok());
        let error = enforce_work_budget("test", 101, 100).expect_err("one over must reject");
        assert_eq!(error.code, ErrorCode::WorkBudgetExceeded);
        assert!(error.message.contains("estimated=101, limit=100"));
    }
}
use edatime_store::versions::DatasetVersionRecord;
use polars::prelude::{Column, DataFrame, DataType, IdxCa, NamedFrom, Series};
use serde::Serialize;

use crate::handlers::routes::cleaning::{PlanRequestEnvelope, compile_request_frame};

/// Immutable provenance for a dataset-derived response.
///
/// The active dataset can change while a request is in flight. Routes must
/// therefore identify the resolved source snapshot, rather than treating the
/// current session revision as the result identity. `plan_hash` is `None`
/// when the request used the source unchanged; the wire representation uses
/// the explicit `none` sentinel so clients never need to infer that from a
/// missing header.
#[derive(Debug, Clone)]
pub struct ExecutionIdentity {
    pub source_version_id: String,
    pub source_revision: u64,
    pub schema_fingerprint: String,
    pub plan_hash: Option<String>,
}

impl ExecutionIdentity {
    pub fn from_version(version: DatasetVersionRecord, plan_hash: Option<String>) -> Self {
        Self {
            source_version_id: version.id,
            source_revision: version.revision,
            schema_fingerprint: version.schema_fingerprint,
            plan_hash,
        }
    }

    /// Headers which make a cached, exported, or delayed result attributable
    /// to the exact immutable source and cleaning plan used to build it.
    pub fn headers(&self) -> Vec<(String, String)> {
        vec![
            (
                "x-edatime-source-version".to_string(),
                self.source_version_id.clone(),
            ),
            (
                "x-edatime-source-revision".to_string(),
                self.source_revision.to_string(),
            ),
            (
                "x-edatime-schema-fingerprint".to_string(),
                self.schema_fingerprint.clone(),
            ),
            (
                "x-edatime-plan-hash".to_string(),
                self.plan_hash.clone().unwrap_or_else(|| "none".to_string()),
            ),
        ]
    }
}

pub fn current_execution_identity(state: &AppState) -> Result<ExecutionIdentity, AppError> {
    Ok(ExecutionIdentity::from_version(
        state.current_dataset_version()?,
        None,
    ))
}

/// Attach immutable result provenance to a direct Axum response. Cached Arrow
/// responses use `ExecutionIdentity::headers()` before insertion; JSON routes
/// use this helper after serializing their body.
pub fn add_execution_identity_headers<B>(
    mut response: Response<B>,
    identity: &ExecutionIdentity,
) -> Response<B> {
    for (name, value) in identity.headers() {
        let Ok(value) = HeaderValue::from_str(&value) else {
            continue;
        };
        match name.as_str() {
            "x-edatime-source-version" => {
                response
                    .headers_mut()
                    .insert("x-edatime-source-version", value);
            }
            "x-edatime-source-revision" => {
                response
                    .headers_mut()
                    .insert("x-edatime-source-revision", value);
            }
            "x-edatime-schema-fingerprint" => {
                response
                    .headers_mut()
                    .insert("x-edatime-schema-fingerprint", value);
            }
            "x-edatime-plan-hash" => {
                response.headers_mut().insert("x-edatime-plan-hash", value);
            }
            _ => unreachable!("ExecutionIdentity only creates fixed header names"),
        }
    }
    response
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

/// Plan-aware analytics preamble. The canonical envelope is validated against
/// the immutable source before any page-local time/projection work is applied.
pub async fn filter_preamble_with_plan(
    state: &AppState,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    columns: Option<&str>,
    cleaning_plan: &PlanRequestEnvelope,
) -> Result<(Vec<String>, DataFrame, ExecutionIdentity), AppError> {
    validate_time_window(start, end)?;
    let (version, hash, lf) = compile_request_frame(state, cleaning_plan)?;
    let time_column = cleaning_plan.plan.time_column.clone();
    let identity = ExecutionIdentity::from_version(version, Some(hash));
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
        identity,
    ))
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalysisSampling {
    pub method: &'static str,
    pub input_points: usize,
    pub output_points: usize,
    pub aggregation_factor: f64,
}

/// Anti-aliased bounded sampling for frequency-domain analytics. Consecutive
/// buckets are averaged for numeric/time columns; non-numeric columns use the
/// bucket midpoint. This avoids the deterministic spectral aliases introduced
/// by taking every Nth source row.
pub fn downsample_for_analysis(
    df: DataFrame,
    max_pts: usize,
    label: &str,
) -> Result<(DataFrame, AnalysisSampling), AppError> {
    let input_points = df.height();
    if df.height() <= max_pts {
        return Ok((
            df,
            AnalysisSampling {
                method: "exact",
                input_points,
                output_points: input_points,
                aggregation_factor: 1.0,
            },
        ));
    }
    let target = max_pts.max(2).min(input_points);
    let midpoint_indices = (0..target)
        .map(|bucket| {
            let start = bucket.saturating_mul(input_points) / target;
            let end = ((bucket + 1).saturating_mul(input_points) / target).max(start + 1);
            ((start + end - 1) / 2) as u32
        })
        .collect::<Vec<_>>();
    let midpoint_indices = IdxCa::new("__sample_index".into(), &midpoint_indices);
    let mut output = Vec::<Column>::with_capacity(df.width());
    for column in df.materialized_column_iter() {
        let dtype = column.dtype().clone();
        if dtype.is_numeric() || matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            let casted = column.cast(&DataType::Float64).map_err(|error| {
                AppError::internal(format!("{label} sample cast '{}': {error}", column.name()))
            })?;
            let values = casted.f64().map_err(|error| {
                AppError::internal(format!(
                    "{label} sample values '{}': {error}",
                    column.name()
                ))
            })?;
            let means = (0..target)
                .map(|bucket| {
                    let start = bucket.saturating_mul(input_points) / target;
                    let end = ((bucket + 1).saturating_mul(input_points) / target).max(start + 1);
                    let mut sum = 0.0;
                    let mut count = 0usize;
                    for index in start..end {
                        if let Some(value) = values.get(index)
                            && value.is_finite()
                        {
                            sum += value;
                            count += 1;
                        }
                    }
                    (count > 0).then_some(sum / count as f64)
                })
                .collect::<Vec<_>>();
            let averaged = Series::new(column.name().clone(), means);
            let averaged = if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
                averaged.cast(&dtype).map_err(|error| {
                    AppError::internal(format!(
                        "{label} restore sampled dtype '{}': {error}",
                        column.name()
                    ))
                })?
            } else {
                averaged
            };
            output.push(averaged.into());
        } else {
            output.push(
                column
                    .take(&midpoint_indices)
                    .map_err(|error| {
                        AppError::internal(format!("{label} sample '{}': {error}", column.name()))
                    })?
                    .into(),
            );
        }
    }
    let sampled = DataFrame::new(target, output)
        .map_err(|error| AppError::internal(format!("{label} sampled frame: {error}")))?;
    Ok((
        sampled,
        AnalysisSampling {
            method: "block_mean",
            input_points,
            output_points: target,
            aggregation_factor: input_points as f64 / target as f64,
        },
    ))
}

#[cfg(test)]
mod sampling_tests {
    use polars::prelude::{DataFrame, NamedFrom, Series};

    use super::downsample_for_analysis;

    #[test]
    fn analysis_sampling_uses_bucket_means_instead_of_stride_aliasing() {
        let frame = DataFrame::new(
            8,
            vec![
                Series::new("ts".into(), (0_i64..8).collect::<Vec<_>>()).into(),
                Series::new("value".into(), vec![0.0, 2.0, 0.0, 2.0, 0.0, 2.0, 0.0, 2.0]).into(),
                Series::new("label".into(), vec!["a", "b", "c", "d", "e", "f", "g", "h"]).into(),
            ],
        )
        .expect("frame");

        let (sampled, metadata) = downsample_for_analysis(frame, 4, "test").expect("sample frame");
        assert_eq!(metadata.method, "block_mean");
        assert_eq!(metadata.input_points, 8);
        assert_eq!(metadata.output_points, 4);
        assert_eq!(sampled.height(), 4);
        assert_eq!(
            sampled
                .column("value")
                .expect("value")
                .f64()
                .expect("float values")
                .into_no_null_iter()
                .collect::<Vec<_>>(),
            vec![1.0, 1.0, 1.0, 1.0]
        );
        assert_eq!(
            sampled
                .column("label")
                .expect("label")
                .str()
                .expect("labels")
                .into_no_null_iter()
                .collect::<Vec<_>>(),
            vec!["a", "c", "e", "g"]
        );
    }
}
