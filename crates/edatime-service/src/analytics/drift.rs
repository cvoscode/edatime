//! Temporal drift analysis — KS test, Wasserstein-1 distance, PSI, Epps-Singleton test,
//! and Jensen-Shannon divergence.

use chrono::{DateTime, Utc};
use polars::prelude::*;
use serde::Serialize;

use super::shared::{extract_f64_column_opt, extract_ts_epoch_ms};
use crate::error::AppError;

/// Two-sample Kolmogorov-Smirnov test. Both slices must be pre-sorted.
pub fn ks_test_2sample(a: &[f64], b: &[f64]) -> (f64, f64) {
    if a.is_empty() || b.is_empty() {
        return (0.0, 1.0);
    }
    let n1 = a.len() as f64;
    let n2 = b.len() as f64;

    let mut i = 0usize;
    let mut j = 0usize;
    let mut max_diff = 0.0_f64;

    while i < a.len() || j < b.len() {
        let next_a = a.get(i).copied().unwrap_or(f64::INFINITY);
        let next_b = b.get(j).copied().unwrap_or(f64::INFINITY);
        let x = next_a.min(next_b);

        while i < a.len() && a[i] <= x {
            i += 1;
        }
        while j < b.len() && b[j] <= x {
            j += 1;
        }

        let f1 = i as f64 / n1;
        let f2 = j as f64 / n2;
        let diff = (f1 - f2).abs();
        if diff > max_diff {
            max_diff = diff;
        }
    }

    let n_eff = (n1 * n2 / (n1 + n2)).sqrt();
    let z = (max_diff + 1.0 / (6.0 * n_eff)) * (n_eff + 0.12 + 0.11 / n_eff);
    let p_value = ks_pvalue_asymptotic(z);

    (max_diff, p_value)
}

fn ks_pvalue_asymptotic(z: f64) -> f64 {
    if z < 0.2 {
        return 1.0;
    }
    let mut sum = 0.0_f64;
    for k in 1_i64..=100 {
        let term = (-2.0 * (k as f64).powi(2) * z * z).exp();
        if k % 2 == 1 {
            sum += term;
        } else {
            sum -= term;
        }
        if term.abs() < 1e-12 {
            break;
        }
    }
    (2.0 * sum).clamp(0.0, 1.0)
}

/// 1D Wasserstein-1 distance (Earth Mover's Distance). Both slices must be pre-sorted.
pub fn wasserstein_distance_1d(a: &[f64], b: &[f64]) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let n1 = a.len() as f64;
    let n2 = b.len() as f64;

    let mut i = 0usize;
    let mut j = 0usize;
    let mut dist = 0.0_f64;
    let mut cdf1 = 0.0_f64;
    let mut cdf2 = 0.0_f64;
    let mut prev_x = f64::NEG_INFINITY;

    while i < a.len() || j < b.len() {
        let next_a = a.get(i).copied().unwrap_or(f64::INFINITY);
        let next_b = b.get(j).copied().unwrap_or(f64::INFINITY);
        let x = next_a.min(next_b);

        if prev_x.is_finite() {
            dist += (cdf1 - cdf2).abs() * (x - prev_x);
        }
        prev_x = x;

        while i < a.len() && a[i] <= x {
            i += 1;
            cdf1 += 1.0 / n1;
        }
        while j < b.len() && b[j] <= x {
            j += 1;
            cdf2 += 1.0 / n2;
        }
    }
    dist
}

/// Population Stability Index (PSI) using reference-quantile-based binning.
pub fn compute_psi(reference: &[f64], current: &[f64], n_bins: usize) -> f64 {
    if reference.is_empty() || current.is_empty() || n_bins < 2 {
        return 0.0;
    }

    let mut ref_sorted = reference.to_vec();
    ref_sorted.sort_by(|a, b| a.total_cmp(b));

    let edges: Vec<f64> = (0..=n_bins)
        .map(|i| {
            let frac = i as f64 / n_bins as f64;
            let idx = ((ref_sorted.len() - 1) as f64 * frac) as usize;
            ref_sorted[idx.min(ref_sorted.len() - 1)]
        })
        .collect();

    let ref_props = psi_ref_props_from_sorted(&ref_sorted, &edges);
    compute_psi_with_ref_props(&ref_props, current, &edges)
}

/// Pre-compute reference bin proportions. `ref_sorted` must be sorted.
pub fn psi_ref_props_from_sorted(ref_sorted: &[f64], edges: &[f64]) -> Vec<f64> {
    let n_bins = edges.len().saturating_sub(1);
    if n_bins == 0 || ref_sorted.is_empty() {
        return vec![];
    }
    let hist = histogram_from_edges(ref_sorted, edges);
    let ref_n = ref_sorted.len() as f64;
    let eps = 1e-10_f64;
    hist.iter().map(|&c| (c as f64 / ref_n).max(eps)).collect()
}

/// PSI using pre-computed reference proportions.
pub fn compute_psi_with_ref_props(ref_props: &[f64], current: &[f64], edges: &[f64]) -> f64 {
    let n_bins = ref_props.len();
    if n_bins == 0 || current.is_empty() || edges.len() < 2 {
        return 0.0;
    }
    let curr_n = current.len() as f64;
    let eps = 1e-10_f64;
    let hist = histogram_from_edges(current, edges);
    let mut psi = 0.0_f64;
    for b in 0..n_bins {
        let ref_prop = ref_props[b];
        let curr_prop = (hist[b] as f64 / curr_n).max(eps);
        psi += (curr_prop - ref_prop) * (curr_prop / ref_prop).ln();
    }
    psi.max(0.0)
}

fn normalized_histogram_props(data: &[f64], edges: &[f64]) -> Vec<f64> {
    if data.is_empty() || edges.len() < 2 {
        return vec![];
    }
    let counts = histogram_from_edges(data, edges);
    let total = counts.iter().sum::<u64>() as f64;
    let eps = 1e-10_f64;
    if total <= 0.0 {
        return vec![eps; counts.len()];
    }
    counts
        .iter()
        .map(|count| ((*count as f64) / total).max(eps))
        .collect()
}

pub fn jensen_shannon_divergence_with_ref_props(
    ref_props: &[f64],
    current: &[f64],
    edges: &[f64],
) -> f64 {
    if ref_props.is_empty() || current.is_empty() || edges.len() < 2 {
        return 0.0;
    }
    let curr_props = normalized_histogram_props(current, edges);
    if curr_props.len() != ref_props.len() {
        return 0.0;
    }

    let kl_div = |p: &[f64], q: &[f64]| -> f64 {
        p.iter()
            .zip(q.iter())
            .map(|(p_i, q_i)| {
                if *p_i <= 0.0 || *q_i <= 0.0 {
                    0.0
                } else {
                    p_i * (p_i / q_i).log2()
                }
            })
            .sum::<f64>()
    };

    let midpoint: Vec<f64> = ref_props
        .iter()
        .zip(curr_props.iter())
        .map(|(ref_prop, curr_prop)| (ref_prop + curr_prop) / 2.0)
        .collect();

    (0.5 * kl_div(ref_props, &midpoint) + 0.5 * kl_div(&curr_props, &midpoint)).max(0.0)
}

/// Compute quantiles from a sorted slice at the given fractions (0.0–1.0).
fn compute_quantiles_sorted(sorted: &[f64], qs: &[f64]) -> Vec<f64> {
    if sorted.is_empty() {
        return vec![f64::NAN; qs.len()];
    }
    let n = sorted.len() - 1;
    qs.iter()
        .map(|&q| {
            let idx = (q.clamp(0.0, 1.0) * n as f64).round() as usize;
            sorted[idx.min(n)]
        })
        .collect()
}

/// Build histogram counts using the given bin edges.
fn histogram_from_edges(data: &[f64], edges: &[f64]) -> Vec<u64> {
    if edges.len() < 2 {
        return vec![];
    }
    let n_bins = edges.len() - 1;
    let mut counts = vec![0u64; n_bins];
    for &v in data {
        if !v.is_finite() {
            continue;
        }
        match edges.binary_search_by(|e| e.total_cmp(&v)) {
            Ok(idx) => {
                let b = idx.min(n_bins - 1);
                counts[b] += 1;
            }
            Err(idx) => {
                if idx > 0 && idx <= n_bins {
                    counts[idx - 1] += 1;
                }
            }
        }
    }
    counts
}

/// Build a downsampled ECDF (x, y) from sorted data with at most `max_pts` points.
fn ecdf_downsampled(sorted: &[f64], max_pts: usize) -> (Vec<f64>, Vec<f64>) {
    let n = sorted.len();
    if n == 0 {
        return (vec![], vec![]);
    }
    let step = (n / max_pts.max(1)).max(1);
    let xs: Vec<f64> = sorted.iter().copied().step_by(step).collect();
    let ys: Vec<f64> = xs
        .iter()
        .enumerate()
        .map(|(i, _)| {
            let raw_idx = i * step;
            (raw_idx + 1) as f64 / n as f64
        })
        .collect();
    (xs, ys)
}

/// Distribution statistics for a single window.
#[derive(Debug, Serialize)]
pub struct WindowDistributionStats {
    pub start_ms: f64,
    pub end_ms: f64,
    pub label: String,
    pub count: usize,
    pub null_count: usize,
    pub completeness: f64,
    pub mean: f64,
    pub std: f64,
    pub min: f64,
    pub max: f64,
    pub quantiles: Vec<f64>,
    pub hist_bins: Vec<f64>,
    pub hist_counts: Vec<u64>,
    pub ecdf_x: Vec<f64>,
    pub ecdf_y: Vec<f64>,
}

/// Drift statistics for a single current window compared to the reference.
#[derive(Debug, Serialize)]
pub struct DriftWindowStats {
    #[serde(flatten)]
    pub distribution: WindowDistributionStats,
    pub ks_stat: f64,
    pub ks_pvalue: f64,
    pub es_stat: f64,
    pub es_pvalue: f64,
    pub wasserstein: f64,
    pub psi: f64,
    pub jensen_shannon: f64,
    pub drift_level: String,
    pub trigger_reasons: Vec<String>,
    pub completeness_delta: f64,
    pub low_sample_warning: bool,
}

/// Thresholds used for drift alerting.
#[derive(Debug, Serialize)]
pub struct DriftThresholds {
    pub ks_pvalue_threshold: f64,
    pub es_pvalue_threshold: f64,
    pub wasserstein_threshold: f64,
    pub psi_minor_threshold: f64,
    pub psi_major_threshold: f64,
}

/// Metadata about the drift computation.
#[derive(Debug, Serialize)]
pub struct DriftMetadata {
    pub computation_time_ms: u64,
    pub num_windows: usize,
    pub reference_samples: usize,
    pub bin_count_warning: bool,
    pub effective_bins: usize,
    pub psi_sample_ratio_warning: bool,
    pub avg_window_samples: f64,
}

/// Full response for a temporal drift analysis request.
#[derive(Debug, Serialize)]
pub struct DriftResponse {
    pub column: String,
    pub reference: WindowDistributionStats,
    pub windows: Vec<DriftWindowStats>,
    pub thresholds: DriftThresholds,
    pub metadata: DriftMetadata,
}

fn build_distribution_stats(
    values: &[f64],
    all_values_including_nulls: usize,
    start_ms: f64,
    end_ms: f64,
    label: String,
    hist_edges: &[f64],
) -> WindowDistributionStats {
    let null_count = all_values_including_nulls.saturating_sub(values.len());
    let completeness = if all_values_including_nulls > 0 {
        values.len() as f64 / all_values_including_nulls as f64
    } else {
        1.0
    };

    if values.is_empty() {
        return WindowDistributionStats {
            start_ms,
            end_ms,
            label,
            count: 0,
            null_count,
            completeness,
            mean: f64::NAN,
            std: f64::NAN,
            min: f64::NAN,
            max: f64::NAN,
            quantiles: vec![f64::NAN; 5],
            hist_bins: hist_edges.to_vec(),
            hist_counts: vec![0; hist_edges.len().saturating_sub(1)],
            ecdf_x: vec![],
            ecdf_y: vec![],
        };
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));

    let n = sorted.len() as f64;
    let mean = sorted.iter().sum::<f64>() / n;
    let variance = sorted.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
    let std = variance.sqrt();
    let min = sorted[0];
    let max = sorted[sorted.len() - 1];

    let quantiles = compute_quantiles_sorted(&sorted, &[0.05, 0.25, 0.50, 0.75, 0.95]);
    let hist_counts = histogram_from_edges(&sorted, hist_edges);
    let (ecdf_x, ecdf_y) = ecdf_downsampled(&sorted, 200);

    WindowDistributionStats {
        start_ms,
        end_ms,
        label,
        count: sorted.len(),
        null_count,
        completeness,
        mean,
        std,
        min,
        max,
        quantiles,
        hist_bins: hist_edges.to_vec(),
        hist_counts,
        ecdf_x,
        ecdf_y,
    }
}

pub fn classify_drift_window(
    psi: f64,
    wasserstein: f64,
    ks_pvalue: f64,
    es_pvalue: f64,
    thresholds: &DriftThresholds,
) -> (String, Vec<String>) {
    let mut score = 0usize;
    let mut reasons: Vec<String> = Vec::new();

    if psi >= thresholds.psi_major_threshold {
        score += 2;
        reasons.push("psi_major".to_string());
    } else if psi >= thresholds.psi_minor_threshold {
        score += 1;
        reasons.push("psi_minor".to_string());
    }

    if wasserstein > thresholds.wasserstein_threshold {
        score += 1;
        reasons.push("wasserstein".to_string());
    }

    if ks_pvalue < thresholds.ks_pvalue_threshold {
        score += 1;
        reasons.push("ks".to_string());
    }

    if es_pvalue < thresholds.es_pvalue_threshold {
        score += 1;
        reasons.push("es".to_string());
    }

    let level = if score >= 2 {
        "red"
    } else if score == 1 {
        "yellow"
    } else {
        "green"
    };

    (level.to_string(), reasons)
}

fn format_timestamp(ms: f64) -> String {
    if !ms.is_finite() {
        return "—".to_string();
    }
    DateTime::<Utc>::from_timestamp_millis(ms.round() as i64)
        .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_else(|| "—".to_string())
}

fn format_time_only(ms: f64) -> String {
    if !ms.is_finite() {
        return "—".to_string();
    }
    DateTime::<Utc>::from_timestamp_millis(ms.round() as i64)
        .map(|dt| dt.format("%H:%M").to_string())
        .unwrap_or_else(|| "—".to_string())
}

fn same_utc_day(start_ms: f64, end_ms: f64) -> bool {
    let Some(start) = DateTime::<Utc>::from_timestamp_millis(start_ms.round() as i64) else {
        return false;
    };
    let Some(end) = DateTime::<Utc>::from_timestamp_millis(end_ms.round() as i64) else {
        return false;
    };
    start.date_naive() == end.date_naive()
}

fn format_range_full(start_ms: f64, end_ms: f64) -> String {
    format!(
        "{} - {}",
        format_timestamp(start_ms),
        format_timestamp(end_ms)
    )
}

pub fn format_window_label(start_ms: f64, end_ms: f64, window_ms: i64) -> String {
    if window_ms == 3_600_000 && same_utc_day(start_ms, end_ms) {
        format!(
            "{} - {}",
            format_timestamp(start_ms),
            format_time_only(end_ms)
        )
    } else {
        format_range_full(start_ms, end_ms)
    }
}

/// Compute temporal drift analysis for a given column.
#[allow(clippy::too_many_arguments)]
pub fn compute_temporal_drift(
    df: &DataFrame,
    column: &str,
    window_ms: i64,
    ref_start_ms: f64,
    ref_end_ms: f64,
    curr_start_ms: f64,
    curr_end_ms: f64,
    n_bins: usize,
    ks_pvalue_threshold: f64,
    es_pvalue_threshold: f64,
    wasserstein_threshold: f64,
    psi_minor: f64,
    psi_major: f64,
) -> Result<DriftResponse, AppError> {
    let start_time = std::time::Instant::now();
    let ts_ms = extract_ts_epoch_ms(df)?;
    let raw_values = extract_f64_column_opt(df, column)?;

    let n = ts_ms.len().min(raw_values.len());

    let (mut ref_vals, ref_total) = ts_ms
        .iter()
        .zip(raw_values.iter())
        .filter(|&(t, _)| *t >= ref_start_ms && *t < ref_end_ms)
        .fold((Vec::new(), 0), |(mut vals, mut total), (_, &v)| {
            total += 1;
            if let Some(val) = v {
                vals.push(val);
            }
            (vals, total)
        });

    if ref_vals.len() < 5 {
        return Err(AppError::bad_request(
            "Reference window contains fewer than 5 valid samples. Widen the reference range or select a different column.",
        ));
    }

    ref_vals.sort_by(|a, b| a.total_cmp(b));
    let ref_sorted = ref_vals;

    let effective_bins = n_bins.clamp(4, 50);
    let raw_edges: Vec<f64> = (0..=effective_bins)
        .map(|i| {
            let frac = i as f64 / effective_bins as f64;
            let idx = ((ref_sorted.len() - 1) as f64 * frac).round() as usize;
            ref_sorted[idx.min(ref_sorted.len() - 1)]
        })
        .collect();

    let mut hist_edges: Vec<f64> = vec![raw_edges[0]];
    for &e in &raw_edges[1..] {
        if e > hist_edges[hist_edges.len() - 1] {
            hist_edges.push(e);
        }
    }

    let bin_count_warning: bool;
    if hist_edges.len() < 2 {
        let lo = ref_sorted[0];
        let hi = ref_sorted[ref_sorted.len() - 1];
        let range = (hi - lo).max(f64::EPSILON);
        let width = range / effective_bins as f64;
        hist_edges = (0..=effective_bins)
            .map(|i| lo + width * i as f64)
            .collect();
        bin_count_warning = true;
    } else if hist_edges.len() < effective_bins / 2 + 2 {
        let lo = hist_edges[0];
        let hi = hist_edges[hist_edges.len() - 1];
        let width = (hi - lo).max(f64::EPSILON) / effective_bins as f64;
        hist_edges = (0..=effective_bins)
            .map(|i| lo + width * i as f64)
            .collect();
        bin_count_warning = true;
    } else {
        bin_count_warning = false;
    }
    let effective_bin_count = hist_edges.len().saturating_sub(1);

    let ref_label = format!("Ref ({})", format_range_full(ref_start_ms, ref_end_ms));
    let reference = build_distribution_stats(
        &ref_sorted,
        ref_total,
        ref_start_ms,
        ref_end_ms,
        ref_label,
        &hist_edges,
    );

    let wasserstein_std_multiplier = if wasserstein_threshold < 0.0 {
        wasserstein_threshold.abs()
    } else {
        0.1
    };
    let effective_wasserstein_threshold = if wasserstein_threshold > 0.0 {
        wasserstein_threshold
    } else {
        let candidate = reference.std * wasserstein_std_multiplier;
        if candidate.is_finite() && candidate > 0.0 {
            candidate
        } else {
            1e-9
        }
    };

    let thresholds = DriftThresholds {
        ks_pvalue_threshold,
        es_pvalue_threshold,
        wasserstein_threshold: effective_wasserstein_threshold,
        psi_minor_threshold: psi_minor,
        psi_major_threshold: psi_major,
    };

    let first_curr_bucket = curr_start_ms;
    let last_curr_ms = curr_end_ms;

    let n_buckets = if last_curr_ms >= first_curr_bucket {
        (((last_curr_ms - first_curr_bucket) / window_ms as f64).floor() as usize).saturating_add(1)
    } else {
        1
    };
    let n_buckets = n_buckets.max(1);
    let mut bucket_vals: Vec<Vec<f64>> = vec![Vec::new(); n_buckets];
    let mut bucket_totals: Vec<usize> = vec![0; n_buckets];
    for i in 0..n {
        let t = ts_ms[i];
        if t >= curr_start_ms && t <= last_curr_ms {
            let idx = ((t - first_curr_bucket) / window_ms as f64).floor() as usize;
            if idx < n_buckets {
                bucket_totals[idx] += 1;
                if let Some(v) = raw_values[i] {
                    bucket_vals[idx].push(v);
                }
            }
        }
    }

    const ES_REF_CAP: usize = 400;
    let es_ref_sample: std::borrow::Cow<[f64]> = if ref_sorted.len() > ES_REF_CAP {
        let step = ref_sorted.len().div_ceil(ES_REF_CAP);
        std::borrow::Cow::Owned(ref_sorted.iter().step_by(step).copied().collect())
    } else {
        std::borrow::Cow::Borrowed(&ref_sorted)
    };

    let psi_ref_props = psi_ref_props_from_sorted(&ref_sorted, &hist_edges);

    for bv in &mut bucket_vals {
        bv.sort_by(|a, b| a.total_cmp(b));
    }

    let mut windows: Vec<DriftWindowStats> = Vec::with_capacity(n_buckets);
    for bi in 0..n_buckets {
        let bucket_start_ms = first_curr_bucket + bi as f64 * window_ms as f64;
        let bucket_end_ms = bucket_start_ms + window_ms as f64;
        if bucket_start_ms >= last_curr_ms {
            break;
        }
        let vals = &bucket_vals[bi];
        let low_sample_warning = vals.len() < 5;

        let (ks_stat, ks_pvalue, es_stat, es_pvalue, wasserstein, psi, jensen_shannon) =
            if vals.len() >= 5 {
                let (ks_s, ks_p) = ks_test_2sample(&ref_sorted, vals);
                let (es_s, es_p) = edatime_core::stats::epps_singleton_test(&es_ref_sample, vals);
                let w = wasserstein_distance_1d(&ref_sorted, vals);
                let p = compute_psi_with_ref_props(&psi_ref_props, vals, &hist_edges);
                let js =
                    jensen_shannon_divergence_with_ref_props(&psi_ref_props, vals, &hist_edges);
                (ks_s, ks_p, es_s, es_p, w, p, js)
            } else {
                (0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0)
            };

        let (drift_level, trigger_reasons) = if low_sample_warning {
            ("green".to_string(), Vec::new())
        } else {
            classify_drift_window(psi, wasserstein, ks_pvalue, es_pvalue, &thresholds)
        };

        let label = format_window_label(bucket_start_ms, bucket_end_ms, window_ms);
        let dist = build_distribution_stats(
            vals,
            bucket_totals[bi],
            bucket_start_ms,
            bucket_end_ms,
            label,
            &hist_edges,
        );
        let completeness_delta = dist.completeness - reference.completeness;

        windows.push(DriftWindowStats {
            distribution: dist,
            ks_stat,
            ks_pvalue,
            es_stat,
            es_pvalue,
            wasserstein,
            psi,
            jensen_shannon,
            drift_level,
            trigger_reasons,
            completeness_delta,
            low_sample_warning,
        });
    }

    let num_windows = windows.len();
    let reference_samples = ref_sorted.len();

    let nonempty_windows: Vec<usize> = windows
        .iter()
        .filter(|w| w.distribution.count >= 5)
        .map(|w| w.distribution.count)
        .collect();
    let avg_window_samples = if nonempty_windows.is_empty() {
        0.0
    } else {
        nonempty_windows.iter().sum::<usize>() as f64 / nonempty_windows.len() as f64
    };
    let psi_sample_ratio_warning =
        avg_window_samples > 0.0 && reference_samples as f64 / avg_window_samples > 10.0;

    Ok(DriftResponse {
        column: column.to_string(),
        reference,
        windows,
        thresholds,
        metadata: DriftMetadata {
            computation_time_ms: start_time.elapsed().as_millis() as u64,
            num_windows,
            reference_samples,
            bin_count_warning,
            effective_bins: effective_bin_count,
            psi_sample_ratio_warning,
            avg_window_samples,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::{
        DriftThresholds, classify_drift_window, compute_temporal_drift, format_window_label,
        jensen_shannon_divergence_with_ref_props,
    };
    use polars::prelude::{DataFrame, DataType, NamedFrom, Series, TimeUnit};

    fn drift_df(values: Vec<f64>, start_ms: i64, step_ms: i64) -> DataFrame {
        let ts_values: Vec<i64> = (0..values.len())
            .map(|idx| start_ms + idx as i64 * step_ms)
            .collect();
        let ts = Series::new("ts".into(), ts_values)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("ts should cast to datetime");
        let value = Series::new("value".into(), values);
        DataFrame::new(ts.len(), vec![ts.into(), value.into()])
            .expect("test dataframe should build")
    }

    #[test]
    fn format_window_label_uses_precise_hourly_ranges() {
        let start = 1_735_689_600_000.0; // 2025-01-01 00:00 UTC
        let end = start + 3_600_000.0;
        assert_eq!(
            format_window_label(start, end, 3_600_000),
            "2025-01-01 00:00 - 01:00",
        );
    }

    #[test]
    fn format_window_label_uses_full_daily_ranges() {
        let start = 1_735_689_600_000.0; // 2025-01-01 00:00 UTC
        let end = start + 86_400_000.0;
        assert_eq!(
            format_window_label(start, end, 86_400_000),
            "2025-01-01 00:00 - 2025-01-02 00:00",
        );
    }

    #[test]
    fn format_window_label_uses_full_weekly_ranges() {
        let start = 1_735_689_600_000.0; // 2025-01-01 00:00 UTC
        let end = start + 7.0 * 86_400_000.0;
        assert_eq!(
            format_window_label(start, end, 7 * 86_400_000),
            "2025-01-01 00:00 - 2025-01-08 00:00",
        );
    }

    #[test]
    fn classify_drift_window_scores_composite_triggers() {
        let thresholds = DriftThresholds {
            ks_pvalue_threshold: 0.05,
            es_pvalue_threshold: 0.05,
            wasserstein_threshold: 0.2,
            psi_minor_threshold: 0.1,
            psi_major_threshold: 0.2,
        };

        let (level, reasons) = classify_drift_window(0.15, 0.0, 0.9, 0.9, &thresholds);
        assert_eq!(level, "yellow");
        assert_eq!(reasons, vec!["psi_minor"]);

        let (level, reasons) = classify_drift_window(0.21, 0.0, 0.9, 0.9, &thresholds);
        assert_eq!(level, "red");
        assert_eq!(reasons, vec!["psi_major"]);

        let (level, reasons) = classify_drift_window(0.0, 0.0, 0.01, 0.9, &thresholds);
        assert_eq!(level, "yellow");
        assert_eq!(reasons, vec!["ks"]);

        let (level, reasons) = classify_drift_window(0.0, 0.0, 0.01, 0.01, &thresholds);
        assert_eq!(level, "red");
        assert_eq!(reasons, vec!["ks", "es"]);

        let (level, reasons) = classify_drift_window(0.0, 0.25, 0.9, 0.9, &thresholds);
        assert_eq!(level, "yellow");
        assert_eq!(reasons, vec!["wasserstein"]);
    }

    #[test]
    fn jensen_shannon_divergence_is_positive_for_shifted_histograms() {
        let ref_props = vec![0.5, 0.5];
        let edges = vec![0.0, 1.0, 2.0];
        let current = vec![1.2, 1.4, 1.6, 1.8];
        let js = jensen_shannon_divergence_with_ref_props(&ref_props, &current, &edges);
        assert!(js.is_finite());
        assert!(js > 0.0);
    }

    #[test]
    fn compute_temporal_drift_anchors_windows_at_reference_end_without_overlap() {
        let values: Vec<f64> = (0..30).map(|idx| idx as f64).collect();
        let df = drift_df(values, 1_735_689_600_000, 300_000);

        let response = compute_temporal_drift(
            &df,
            "value",
            3_600_000,
            1_735_689_600_000.0,
            1_735_691_400_000.0,
            1_735_691_400_000.0,
            1_735_698_300_000.0,
            20,
            0.05,
            0.05,
            0.0,
            0.1,
            0.2,
        )
        .expect("drift response should compute");

        assert_eq!(response.reference.count, 6);
        assert_eq!(response.reference.start_ms, 1_735_689_600_000.0);
        assert_eq!(response.reference.end_ms, 1_735_691_400_000.0);

        let first = response
            .windows
            .first()
            .expect("at least one monitoring window");
        assert_eq!(first.distribution.start_ms, 1_735_691_400_000.0);
        assert_eq!(first.distribution.end_ms, 1_735_695_000_000.0);
        assert_eq!(first.distribution.count, 12);
        assert_eq!(first.distribution.label, "2025-01-01 00:30 - 01:30");
    }
}
