//! Scatter sampling — bounded, deterministic point samples from filtered data.
//!
//! The streaming path consumes Polars batches through a callback sink and keeps
//! only a seeded reservoir. This is deliberately not a time-series reducer:
//! arbitrary X/Y scatter geometry needs an unbiased point sample rather than
//! an order-sensitive LTTB envelope.

use polars::prelude::*;
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex};

use crate::error::AppError;

use super::collect::{
    series_to_label_values, series_to_scatter_values, series_to_time_bucket_labels,
};

// ── Color kind ───────────────────────────────────────────────────────────────

enum ScatterColorColumn {
    Continuous(Vec<Option<f64>>),
    Categorical(Vec<Option<String>>),
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum ScatterColorKind {
    Continuous,
    Categorical,
}

/// How a temporal color column should be rendered in the scatter pipeline.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
pub enum TimeColorMode {
    /// Bucket by hour-of-day and emit a categorical label. Default.
    #[default]
    Bucket,
    /// Emit the raw epoch-millisecond value as continuous numeric. Legacy.
    Raw,
}

impl TimeColorMode {
    pub fn from_query(value: Option<&str>) -> Self {
        match value.map(|v| v.to_ascii_lowercase()).as_deref() {
            Some("raw") => Self::Raw,
            _ => Self::Bucket,
        }
    }
}

// ── Row type ─────────────────────────────────────────────────────────────────

pub struct SampledScatterRow {
    pub x: f64,
    pub y: f64,
    pub color_value: Option<f64>,
    pub color_label: Option<String>,
    pub size_value: Option<f64>,
}

pub type SampledScatterCell = (usize, Vec<SampledScatterRow>, Option<ScatterColorKind>);

// ── Core sampling ───────────────────────────────────────────────────────────

const SCATTER_BATCH_ROWS: usize = 16_384;

struct ReservoirEntry {
    priority: u64,
    ordinal: u64,
    row: SampledScatterRow,
}

impl PartialEq for ReservoirEntry {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.ordinal == other.ordinal
    }
}

impl Eq for ReservoirEntry {}

impl PartialOrd for ReservoirEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ReservoirEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority
            .cmp(&other.priority)
            .then_with(|| self.ordinal.cmp(&other.ordinal))
    }
}

/// A stable, inexpensive mix for a source-scope seed and source row ordinal.
/// Keeping the lowest priorities gives a deterministic reservoir without an
/// RNG state or assumptions about upstream streaming partition sizes.
fn reservoir_priority(seed: u64, ordinal: u64) -> u64 {
    let mut value = seed ^ ordinal.wrapping_add(0x9e37_79b9_7f4a_7c15);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

/// FNV-1a is enough here: it only derives a reproducible seed from immutable
/// request identity, not a security boundary.
pub fn scatter_reservoir_seed(scope: &str) -> u64 {
    scope.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

struct ScatterReservoir {
    capacity: usize,
    seed: u64,
    total_points: usize,
    entries: BinaryHeap<ReservoirEntry>,
}

impl ScatterReservoir {
    fn new(capacity: usize, seed: u64) -> Self {
        Self {
            capacity,
            seed,
            total_points: 0,
            entries: BinaryHeap::with_capacity(capacity),
        }
    }

    fn consider(&mut self, row: SampledScatterRow) {
        let ordinal = self.total_points as u64;
        self.total_points += 1;
        if self.capacity == 0 {
            return;
        }

        let entry = ReservoirEntry {
            priority: reservoir_priority(self.seed, ordinal),
            ordinal,
            row,
        };
        if self.entries.len() < self.capacity {
            self.entries.push(entry);
        } else if self.entries.peek().is_some_and(|worst| entry < *worst) {
            let _ = self.entries.pop();
            self.entries.push(entry);
        }
    }

    fn finish(self) -> (usize, Vec<SampledScatterRow>) {
        let mut entries = self.entries.into_vec();
        entries.sort_by_key(|entry| entry.ordinal);
        (
            self.total_points,
            entries.into_iter().map(|entry| entry.row).collect(),
        )
    }
}

fn sample_frame_into_reservoir(
    reservoir: &mut ScatterReservoir,
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    size: Option<&str>,
    time_color_mode: TimeColorMode,
) -> Result<Option<ScatterColorKind>, AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;

    let c_vals = if let Some(c) = color {
        let series = df
            .column(c)
            .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", c, e)))?;
        if series.dtype().is_numeric() {
            Some(ScatterColorColumn::Continuous(series_to_scatter_values(
                df, c,
            )?))
        } else if matches!(series.dtype(), DataType::Datetime(_, _) | DataType::Date) {
            match time_color_mode {
                TimeColorMode::Bucket => Some(ScatterColorColumn::Categorical(
                    series_to_time_bucket_labels(df, c)?,
                )),
                TimeColorMode::Raw => Some(ScatterColorColumn::Continuous(
                    series_to_scatter_values(df, c)?,
                )),
            }
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

        reservoir.consider(SampledScatterRow {
            x: xv,
            y: yv,
            color_value,
            color_label,
            size_value,
        });
    }
    Ok(color_kind)
}

/// Sample a materialized frame. This is kept for small callers and focused
/// unit tests; request handlers should use the streaming helper below.
#[allow(clippy::too_many_arguments)]
pub fn collect_sampled_xyc_rows(
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    size: Option<&str>,
    _limit: usize,
    effective_limit: usize,
    time_color_mode: TimeColorMode,
) -> Result<(usize, Vec<SampledScatterRow>, Option<ScatterColorKind>), AppError> {
    let mut reservoir = ScatterReservoir::new(effective_limit, scatter_reservoir_seed("frame"));
    let color_kind =
        sample_frame_into_reservoir(&mut reservoir, df, x, y, color, size, time_color_mode)?;
    let (total_points, sampled_rows) = reservoir.finish();
    Ok((total_points, sampled_rows, color_kind))
}

/// Sample a filtered lazy frame through Polars' streaming callback sink.
/// Memory is bounded by the stream batch plus `effective_limit` retained rows.
#[allow(clippy::too_many_arguments)]
pub fn collect_sampled_xyc_rows_streaming(
    lazy_frame: LazyFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    size: Option<&str>,
    effective_limit: usize,
    time_color_mode: TimeColorMode,
    seed_scope: &str,
) -> Result<(usize, Vec<SampledScatterRow>, Option<ScatterColorKind>), AppError> {
    let schema = lazy_frame
        .clone()
        .collect_schema()
        .map_err(|error| AppError::bad_request(format!("scatter schema: {error}")))?;
    let color_kind = color
        .map(|color_name| {
            let dtype = schema
                .get(color_name)
                .ok_or_else(|| AppError::bad_request(format!("Unknown column '{color_name}'")))?;
            Ok::<ScatterColorKind, AppError>(
                if dtype.is_numeric()
                    || (matches!(dtype, DataType::Datetime(_, _) | DataType::Date)
                        && matches!(time_color_mode, TimeColorMode::Raw))
                {
                    ScatterColorKind::Continuous
                } else {
                    ScatterColorKind::Categorical
                },
            )
        })
        .transpose()?;

    let reservoir = Arc::new(Mutex::new(ScatterReservoir::new(
        effective_limit,
        scatter_reservoir_seed(seed_scope),
    )));
    let callback_reservoir = Arc::clone(&reservoir);
    let x = x.to_owned();
    let y = y.to_owned();
    let color = color.map(str::to_owned);
    let size = size.map(str::to_owned);
    let callback = PlanCallback::new(move |batch: DataFrame| {
        let mut reservoir = callback_reservoir
            .lock()
            .map_err(|_| PolarsError::ComputeError("scatter reservoir lock poisoned".into()))?;
        sample_frame_into_reservoir(
            &mut reservoir,
            &batch,
            &x,
            &y,
            color.as_deref(),
            size.as_deref(),
            time_color_mode,
        )
        .map_err(|error| PolarsError::ComputeError(error.to_string().into()))?;
        Ok(false)
    });
    lazy_frame
        .with_new_streaming(true)
        .sink_batches(callback, true, NonZeroUsize::new(SCATTER_BATCH_ROWS))
        .map_err(|error| AppError::io(format!("build scatter stream: {error}")))?
        .collect()
        .map_err(|error| AppError::io(format!("stream scatter rows: {error}")))?;
    let reservoir = Arc::try_unwrap(reservoir)
        .map_err(|_| AppError::internal("scatter stream retained its reservoir"))?
        .into_inner()
        .map_err(|_| AppError::internal("scatter reservoir lock poisoned"))?;
    let (total_points, sampled_rows) = reservoir.finish();
    Ok((total_points, sampled_rows, color_kind))
}

/// Feed every scatter-matrix cell from one projected source stream. Memory is
/// bounded by the configured total matrix-point budget across all reservoirs.
pub fn collect_sampled_matrix_rows_streaming(
    lazy_frame: LazyFrame,
    pairs: &[(String, String)],
    color: Option<&str>,
    effective_limit: usize,
    time_color_mode: TimeColorMode,
    seed_scope: &str,
) -> Result<Vec<SampledScatterCell>, AppError> {
    let schema = lazy_frame
        .clone()
        .collect_schema()
        .map_err(|error| AppError::bad_request(format!("scatter matrix schema: {error}")))?;
    let color_kind = color
        .map(|color_name| {
            let dtype = schema
                .get(color_name)
                .ok_or_else(|| AppError::bad_request(format!("Unknown column '{color_name}'")))?;
            Ok::<ScatterColorKind, AppError>(
                if dtype.is_numeric()
                    || (matches!(dtype, DataType::Datetime(_, _) | DataType::Date)
                        && matches!(time_color_mode, TimeColorMode::Raw))
                {
                    ScatterColorKind::Continuous
                } else {
                    ScatterColorKind::Categorical
                },
            )
        })
        .transpose()?;
    let reservoirs = pairs
        .iter()
        .map(|(x, y)| {
            ScatterReservoir::new(
                effective_limit,
                scatter_reservoir_seed(&format!("{seed_scope}:{x}:{y}")),
            )
        })
        .collect::<Vec<_>>();
    let reservoirs = Arc::new(Mutex::new(reservoirs));
    let callback_reservoirs = Arc::clone(&reservoirs);
    let pairs = pairs.to_vec();
    let color = color.map(str::to_owned);
    let callback = PlanCallback::new(move |batch: DataFrame| {
        let mut reservoirs = callback_reservoirs.lock().map_err(|_| {
            PolarsError::ComputeError("scatter matrix reservoirs lock poisoned".into())
        })?;
        for ((x, y), reservoir) in pairs.iter().zip(reservoirs.iter_mut()) {
            sample_frame_into_reservoir(
                reservoir,
                &batch,
                x,
                y,
                color.as_deref(),
                None,
                time_color_mode,
            )
            .map_err(|error| PolarsError::ComputeError(error.to_string().into()))?;
        }
        Ok(false)
    });
    lazy_frame
        .with_new_streaming(true)
        .sink_batches(callback, true, NonZeroUsize::new(SCATTER_BATCH_ROWS))
        .map_err(|error| AppError::io(format!("build scatter matrix stream: {error}")))?
        .collect()
        .map_err(|error| AppError::io(format!("stream scatter matrix rows: {error}")))?;
    let reservoirs = Arc::try_unwrap(reservoirs)
        .map_err(|_| AppError::internal("scatter matrix stream retained its reservoirs"))?
        .into_inner()
        .map_err(|_| AppError::internal("scatter matrix reservoirs lock poisoned"))?;
    Ok(reservoirs
        .into_iter()
        .map(|reservoir| {
            let (total, rows) = reservoir.finish();
            (total, rows, color_kind)
        })
        .collect())
}

#[cfg(test)]
mod tests;
