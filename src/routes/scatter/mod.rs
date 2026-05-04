//! Scatter analytics routes — points, correlations, and export.

mod correlations;
mod points;

use polars::prelude::*;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::temporal;

// Re-export filter types used by export.rs and other consumers.
pub use crate::filters::{
    LineFilter as ScatterLineFilterSpec, RangeFilter as ScatterFilterSpec,
    apply_filters as apply_scatter_filters, parse_line_filters as parse_scatter_line_filters,
    parse_range_filters as parse_scatter_filters,
};

// Re-export route handlers for the router.
pub use correlations::{get_correlation_matrix, get_scatter_correlations};
pub use points::{get_scatter_points, post_scatter_export_parquet, post_scatter_points};

// ── Shared types ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct ScatterPointsQuery {
    pub x: String,
    pub y: String,
    pub color: Option<String>,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub filters: Option<String>,
    pub line_filters: Option<String>,
    #[serde(default = "default_scatter_limit")]
    pub limit: usize,
}

#[derive(Debug, Serialize)]
pub struct ScatterPointsResponse {
    pub x: String,
    pub y: String,
    pub color: Option<String>,
    pub total_points: usize,
    pub returned_points: usize,
    pub points: Vec<[f64; 2]>,
    pub color_values: Option<Vec<f64>>,
    pub color_labels: Option<Vec<Option<String>>>,
    pub color_min: Option<f64>,
    pub color_max: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CorrelationItem {
    pub column: String,
    pub count: usize,
    pub pearson: Option<f64>,
    pub spearman: Option<f64>,
}

// ── Shared helpers ───────────────────────────────────────────────────────────

fn default_scatter_limit() -> usize {
    1_000_000
}

fn clamp_limit(limit: usize, validation: &crate::config::ValidationSettings) -> usize {
    limit.clamp(1, validation.max_scatter_limit)
}

fn numeric_columns(df: &DataFrame) -> Vec<String> {
    df.get_column_names()
        .iter()
        .filter_map(|name| {
            let name_str = name.as_str();
            match df.column(name_str) {
                Ok(col) if col.dtype().is_numeric() => Some(name_str.to_string()),
                _ => None,
            }
        })
        .collect()
}

fn validate_scatter_column(df: &DataFrame, name: &str) -> Result<(), AppError> {
    let col = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Unknown column '{}': {}", name, e)))?;

    if !(col.dtype().is_numeric()
        || matches!(col.dtype(), DataType::Datetime(_, _) | DataType::Date))
    {
        return Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            name
        )));
    }

    Ok(())
}

fn validate_existing_column(df: &DataFrame, name: &str) -> Result<(), AppError> {
    df.column(name)
        .map(|_| ())
        .map_err(|e| AppError::bad_request(format!("Unknown column '{}': {}", name, e)))
}

fn series_to_scatter_values(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, AppError> {
    let series = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    match series.dtype() {
        dt if dt.is_numeric() => crate::stats::series_to_finite_f64(series, name),
        DataType::Datetime(_, _) | DataType::Date => {
            let casted = series.cast(&DataType::Int64).map_err(|e| {
                AppError::internal(format!(
                    "Failed to cast temporal '{}' to Int64: {}",
                    name, e
                ))
            })?;
            let vals = casted.i64().map_err(|e| {
                AppError::internal(format!("Failed to read '{}' as Int64: {}", name, e))
            })?;

            let dtype = series.dtype();
            let divisor = temporal::unit_multiplier(dtype);

            Ok(vals
                .into_iter()
                .map(|v| {
                    v.map(|raw| {
                        if matches!(dtype, DataType::Date) {
                            (raw * 86_400_000) as f64
                        } else {
                            (raw / divisor) as f64
                        }
                    })
                })
                .collect())
        }
        _ => Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            name
        ))),
    }
}


fn series_to_label_values(df: &DataFrame, name: &str) -> Result<Vec<Option<String>>, AppError> {
    let series = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    let casted = series
        .cast(&DataType::String)
        .map_err(|e| AppError::internal(format!("Failed to cast '{}' to String: {}", name, e)))?;
    let values = casted
        .str()
        .map_err(|e| AppError::internal(format!("Failed to read '{}' as String: {}", name, e)))?;

    Ok(values
        .into_iter()
        .map(|value| value.map(|text| text.to_string()))
        .collect())
}

fn collect_xy_pairs(df: &DataFrame, x: &str, y: &str) -> Result<Vec<[f64; 2]>, AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;

    let out: Vec<[f64; 2]> = x_vals
        .iter()
        .zip(y_vals.iter())
        .filter_map(|(ox, oy)| {
            if let (Some(xv), Some(yv)) = (ox, oy)
                && xv.is_finite()
                && yv.is_finite()
            {
                Some([*xv, *yv])
            } else {
                None
            }
        })
        .collect();

    Ok(out)
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn collect_filtered_scatter_frame(
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    start: Option<f64>,
    end: Option<f64>,
    filters: &[ScatterFilterSpec],
    line_filters: &[ScatterLineFilterSpec],
) -> Result<DataFrame, AppError> {
    validate_scatter_column(df, x)?;
    validate_scatter_column(df, y)?;
    if let Some(c) = color {
        validate_existing_column(df, c)?;
    }

    let lf = apply_scatter_filters(df, start, end, filters, line_filters)?;

    let mut selected_columns = Vec::with_capacity(3);
    for name in [Some(x), Some(y), color].into_iter().flatten() {
        if !selected_columns.contains(&name) {
            selected_columns.push(name);
        }
    }

    let select_exprs = selected_columns.into_iter().map(col).collect::<Vec<_>>();

    lf.select(select_exprs)
        .collect()
        .map_err(|e| AppError::io(e.to_string()))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use crate::config::ValidationSettings;
    use polars::prelude::{DataFrame, DataType, Series, TimeUnit};

    #[test]
    fn numeric_columns_excludes_temporal_columns() {
        let ts = Series::new("ts".into(), [1_i64, 2])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("cast ts to datetime should succeed in test");
        let value = Series::new("value".into(), [1.0_f64, 2.0]);
        let other = Series::new("other".into(), [3.0_f64, 4.0]);
        let df = DataFrame::new(2, vec![ts.into(), value.into(), other.into()])
            .expect("test dataframe creation should succeed");

        let cols = numeric_columns(&df);
        assert_eq!(cols, vec!["value".to_string(), "other".to_string()]);
    }

    #[test]
    fn clamp_limit_respects_runtime_validation_setting() {
        let validation = ValidationSettings {
            max_scatter_limit: 123,
            ..ValidationSettings::default()
        };

        assert_eq!(clamp_limit(0, &validation), 1);
        assert_eq!(clamp_limit(120, &validation), 120);
        assert_eq!(clamp_limit(1000, &validation), 123);
    }
}
