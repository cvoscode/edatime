//! Scatter sampling — downsample data points and build scatter rows.
//!
//! `collect_sampled_xyc_rows` is the core function that takes an executed
//! DataFrame, applies LTTB downsampling to the xy pairs, and produces
//! `SampledScatterRow` structs with color/size metadata.

use polars::prelude::*;

use edatime_query::downsample::downsample_xy_pairs;
use crate::error::AppError;

use super::collect::{series_to_label_values, series_to_scatter_values};

// ── Color kind ───────────────────────────────────────────────────────────────

enum ScatterColorColumn {
    Continuous(Vec<Option<f64>>),
    Categorical(Vec<Option<String>>),
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub(crate) enum ScatterColorKind {
    Continuous,
    Categorical,
}

// ── Row type ─────────────────────────────────────────────────────────────────

pub(super) struct SampledScatterRow {
    pub x: f64,
    pub y: f64,
    pub color_value: Option<f64>,
    pub color_label: Option<String>,
    pub size_value: Option<f64>,
}

// ── Core sampling ───────────────────────────────────────────────────────────

/// Sample scatter points from an executed DataFrame, applying LTTB downsampling
/// to xy pairs and building `SampledScatterRow` structs with color/size metadata.
///
/// Returns `(total_points, sampled_rows, color_kind)`.
pub(super) fn collect_sampled_xyc_rows(
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    size: Option<&str>,
    _limit: usize,
    effective_limit: usize,
) -> Result<(usize, Vec<SampledScatterRow>, Option<ScatterColorKind>), AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;

    let c_vals = if let Some(c) = color {
        let series = df
            .column(c)
            .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", c, e)))?;
        if series.dtype().is_numeric()
            || matches!(series.dtype(), DataType::Datetime(_, _) | DataType::Date)
        {
            Some(ScatterColorColumn::Continuous(series_to_scatter_values(
                df, c,
            )?))
        } else {
            Some(ScatterColorColumn::Categorical(series_to_label_values(
                df, c,
            )?))
        }
    } else {
        None
    };
    let color_kind = c_vals.as_ref().map(|column| match column {
        ScatterColorColumn::Continuous(_) => ScatterColorKind::Continuous,
        ScatterColorColumn::Categorical(_) => ScatterColorKind::Categorical,
    });

    let s_vals = if let Some(s) = size {
        let _ = df
            .column(s)
            .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", s, e)))?;
        Some(series_to_scatter_values(df, s)?)
    } else {
        None
    };

    let mut all_x: Vec<f64> = Vec::new();
    let mut all_y: Vec<f64> = Vec::new();
    let mut all_color_value: Vec<Option<f64>> = Vec::new();
    let mut all_color_label: Vec<Option<String>> = Vec::new();
    let mut all_size_value: Vec<Option<f64>> = Vec::new();
    let mut total_points = 0usize;

    for idx in 0..df.height() {
        let ox = x_vals.get(idx).copied().flatten();
        let oy = y_vals.get(idx).copied().flatten();
        let (Some(xv), Some(yv)) = (ox, oy) else {
            continue;
        };
        if !(xv.is_finite() && yv.is_finite()) {
            continue;
        }

        let (color_value, color_label) = match c_vals.as_ref() {
            Some(ScatterColorColumn::Continuous(values)) => (
                values
                    .get(idx)
                    .copied()
                    .flatten()
                    .filter(|value| value.is_finite()),
                None,
            ),
            Some(ScatterColorColumn::Categorical(values)) => {
                (None, values.get(idx).cloned().flatten())
            }
            None => (None, None),
        };

        let size_value = s_vals
            .as_ref()
            .and_then(|vals| vals.get(idx).copied().flatten().filter(|v| v.is_finite()));

        total_points += 1;
        all_x.push(xv);
        all_y.push(yv);
        all_color_value.push(color_value);
        all_color_label.push(color_label);
        all_size_value.push(size_value);

        if total_points >= effective_limit {
            break;
        }
    }

    let (sampled_x, sampled_y, sampled_color) =
        if matches!(c_vals, Some(ScatterColorColumn::Continuous(_))) {
            let color_f64: Vec<f64> = all_color_value.iter().filter_map(|v| *v).collect();
            let (sx, sy, sc) =
                downsample_xy_pairs(&all_x, &all_y, Some(&color_f64), effective_limit);
            (sx, sy, sc)
        } else {
            let (sx, sy, sc) = downsample_xy_pairs(&all_x, &all_y, None, effective_limit);
            (sx, sy, sc)
        };

    let sampled_len = sampled_x.len();
    let mut sampled_size_value: Vec<Option<f64>> = Vec::with_capacity(sampled_len);
    for i in 0..sampled_len {
        sampled_size_value.push(all_size_value.get(i).copied().flatten());
    }

    let mut sampled = Vec::with_capacity(sampled_len);

    if let Some(cv) = sampled_color {
        for i in 0..sampled_len {
            sampled.push(SampledScatterRow {
                x: sampled_x[i],
                y: sampled_y[i],
                color_value: Some(cv[i]),
                color_label: None,
                size_value: sampled_size_value[i],
            });
        }
    } else {
        for i in 0..sampled_len {
            sampled.push(SampledScatterRow {
                x: sampled_x[i],
                y: sampled_y[i],
                color_value: None,
                color_label: all_color_label.get(i).cloned().flatten(),
                size_value: sampled_size_value[i],
            });
        }
    }

    Ok((total_points, sampled, color_kind))
}
