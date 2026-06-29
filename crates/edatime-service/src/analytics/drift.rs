//! Temporal drift analysis — KS test, Wasserstein-1 distance, PSI, Epps-Singleton test,
//! and Jensen-Shannon divergence.

use chrono::{DateTime, Utc};
use polars::prelude::*;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftInvestigationOverview {
    pub drift_score: u32,
    pub worst_level: String,
    pub columns_flagged: usize,
    pub total_columns: usize,
    pub windows_flagged: usize,
    pub first_change_point: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftFeatureRank {
    pub column: String,
    pub drift_score: u32,
    pub latest_level: String,
    pub flagged_windows: usize,
    pub first_change_point: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftSegmentRank {
    pub segment_value: String,
    pub drift_score: u32,
    pub columns_flagged: usize,
    pub sample_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftChangePointRank {
    pub column: String,
    pub label: String,
    pub iso_time: String,
    pub drift_score: u32,
    pub trigger_reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftQualityIssueRank {
    pub column: String,
    pub issue: String,
    pub label: String,
    pub drift_score: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftRelationshipRank {
    pub left_column: String,
    pub right_column: String,
    pub reference: f64,
    pub comparison: f64,
    pub delta: f64,
    pub aligned_reference_samples: usize,
    pub aligned_comparison_samples: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftRankingSummary {
    pub features: Vec<DriftFeatureRank>,
    pub segments: Vec<DriftSegmentRank>,
    pub change_points: Vec<DriftChangePointRank>,
    pub quality_issues: Vec<DriftQualityIssueRank>,
    pub relationships: Vec<DriftRelationshipRank>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftSegmentGroup {
    pub value: String,
    pub sample_count: usize,
    pub overview: DriftInvestigationOverview,
    pub feature_ranks: Vec<DriftFeatureRank>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftSegmentSummary {
    pub segment_by: String,
    pub groups: Vec<DriftSegmentGroup>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftQualitySummary {
    pub latest_missing_rate: f64,
    pub latest_completeness_delta: f64,
    pub latest_zero_rate: f64,
    pub flatline: bool,
    pub low_sample_warning: bool,
    pub issues: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftQualitySection {
    pub by_column: BTreeMap<String, DriftQualitySummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftRelationshipSection {
    pub mode: String,
    pub pairs: Vec<DriftRelationshipRank>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftInvestigationResponse {
    pub overview: DriftInvestigationOverview,
    pub columns: BTreeMap<String, DriftResponse>,
    pub rankings: DriftRankingSummary,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segments: Option<DriftSegmentSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<DriftQualitySection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relationships: Option<DriftRelationshipSection>,
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

fn zero_rate(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().filter(|value| value.abs() <= f64::EPSILON).count() as f64 / values.len() as f64
}

fn constant_value_share(stats: &WindowDistributionStats) -> f64 {
    let total: u64 = stats.hist_counts.iter().sum();
    if total == 0 {
        return 0.0;
    }
    stats.hist_counts.iter().copied().max().unwrap_or(0) as f64 / total as f64
}

fn compute_window_drift_score(
    prev_level: Option<&str>,
    window: &DriftWindowStats,
) -> u32 {
    let mut score = match window.drift_level.as_str() {
        "red" => 80.0,
        "yellow" => 50.0,
        _ => 0.0,
    };
    score += (window.trigger_reasons.len() as f64 * 3.0).min(10.0);
    if prev_level.is_some_and(|level| level != "green") && window.drift_level != "green" {
        score += 10.0;
    }
    let sample_confidence = (window.distribution.count as f64 / 20.0).min(1.0);
    (score * sample_confidence).clamp(0.0, 100.0).round() as u32
}

fn compute_column_window_scores(response: &DriftResponse) -> Vec<u32> {
    let mut prev_level: Option<&str> = None;
    response
        .windows
        .iter()
        .map(|window| {
            let score = compute_window_drift_score(prev_level, window);
            prev_level = Some(window.drift_level.as_str());
            score
        })
        .collect()
}

fn first_non_green_window(response: &DriftResponse) -> Option<(usize, &DriftWindowStats)> {
    response
        .windows
        .iter()
        .enumerate()
        .find(|(_, window)| window.drift_level != "green")
}

fn first_sustained_non_green_window(response: &DriftResponse) -> Option<(usize, &DriftWindowStats)> {
    response
        .windows
        .windows(2)
        .enumerate()
        .find(|(_, pair)| pair[0].drift_level != "green" && pair[1].drift_level != "green")
        .map(|(idx, pair)| (idx, &pair[0]))
}

fn format_iso_time(ms: f64) -> Option<String> {
    if !ms.is_finite() {
        return None;
    }
    DateTime::<Utc>::from_timestamp_millis(ms.round() as i64).map(|dt| dt.to_rfc3339())
}

fn build_feature_rank(response: &DriftResponse) -> DriftFeatureRank {
    let scores = compute_column_window_scores(response);
    let drift_score = scores.iter().copied().max().unwrap_or(0);
    let latest_level = response
        .windows
        .last()
        .map(|window| window.drift_level.clone())
        .unwrap_or_else(|| "green".to_string());
    let flagged_windows = response
        .windows
        .iter()
        .filter(|window| window.drift_level != "green")
        .count();
    let first_change_point = first_sustained_non_green_window(response)
        .or_else(|| first_non_green_window(response))
        .and_then(|(_, window)| format_iso_time(window.distribution.start_ms));

    DriftFeatureRank {
        column: response.column.clone(),
        drift_score,
        latest_level,
        flagged_windows,
        first_change_point,
    }
}

fn build_change_point_rank(response: &DriftResponse) -> Option<DriftChangePointRank> {
    let scores = compute_column_window_scores(response);
    let candidate = first_sustained_non_green_window(response)
        .or_else(|| first_non_green_window(response));
    candidate.map(|(idx, window)| DriftChangePointRank {
        column: response.column.clone(),
        label: window.distribution.label.clone(),
        iso_time: format_iso_time(window.distribution.start_ms)
            .unwrap_or_else(|| window.distribution.label.clone()),
        drift_score: scores.get(idx).copied().unwrap_or(0),
        trigger_reasons: window.trigger_reasons.clone(),
    })
}

fn build_quality_summary(response: &DriftResponse) -> DriftQualitySummary {
    let latest = response.windows.last();
    let reference_zero_rate = zero_rate(
        &response
            .reference
            .ecdf_x
            .iter()
            .copied()
            .collect::<Vec<f64>>(),
    );
    let mut issues = Vec::new();
    let latest_missing_rate = latest
        .map(|window| 1.0 - window.distribution.completeness)
        .unwrap_or(0.0);
    let latest_completeness_delta = latest.map(|window| window.completeness_delta).unwrap_or(0.0);
    let latest_zero_rate = latest
        .map(|window| zero_rate(&window.distribution.ecdf_x))
        .unwrap_or(0.0);
    let flatline = latest.is_some_and(|window| window.distribution.std <= 1e-12);
    let low_sample_warning = latest.is_some_and(|window| window.low_sample_warning);

    if latest_completeness_delta <= -0.10 {
        issues.push("missingness_jump".to_string());
    }
    if flatline {
        issues.push("flatline".to_string());
    }
    if latest_zero_rate - reference_zero_rate >= 0.20 {
        issues.push("zero_spike".to_string());
    }
    if low_sample_warning {
        issues.push("low_sample".to_string());
    }
    if latest.is_some_and(|window| constant_value_share(&window.distribution) >= 0.8) {
        issues.push("constant_value_share".to_string());
    }

    DriftQualitySummary {
        latest_missing_rate,
        latest_completeness_delta,
        latest_zero_rate,
        flatline,
        low_sample_warning,
        issues,
    }
}

fn build_quality_issue_rank(
    column: &str,
    summary: &DriftQualitySummary,
    feature_score: u32,
) -> Vec<DriftQualityIssueRank> {
    summary
        .issues
        .iter()
        .map(|issue| DriftQualityIssueRank {
            column: column.to_string(),
            issue: issue.clone(),
            label: issue.replace('_', " "),
            drift_score: feature_score,
        })
        .collect()
}

fn extract_segment_values(df: &DataFrame, segment_col: &str) -> Result<Vec<Option<String>>, AppError> {
    let series = df
        .column(segment_col)
        .map(|column| column.as_materialized_series())
        .map_err(|error| AppError::bad_request(format!("Missing segment column '{segment_col}': {error}")))?;
    Ok((0..series.len())
        .map(|idx| series.get(idx).ok())
        .map(|value| match value {
            Some(AnyValue::Null) | None => None,
            Some(other) => Some(other.to_string()),
        })
        .collect())
}

fn top_segment_values(
    ts_ms: &[f64],
    segment_values: &[Option<String>],
    comparison_start_ms: f64,
    comparison_end_ms: f64,
    segment_limit: usize,
) -> Vec<(String, usize)> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for (idx, ts) in ts_ms.iter().enumerate() {
        if !ts.is_finite() || *ts < comparison_start_ms || *ts > comparison_end_ms {
            continue;
        }
        let Some(value) = segment_values.get(idx).and_then(|value| value.clone()) else {
            continue;
        };
        *counts.entry(value).or_default() += 1;
    }
    let mut ranked: Vec<(String, usize)> = counts.into_iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    ranked.truncate(segment_limit);
    ranked
}

fn filter_df_by_segment(
    df: &DataFrame,
    segment_col: &str,
    segment_value: &str,
) -> Result<DataFrame, AppError> {
    let values = extract_segment_values(df, segment_col)?;
    let mask = BooleanChunked::from_iter_values(
        "segment_mask".into(),
        values
            .iter()
            .map(|value| value.as_deref() == Some(segment_value)),
    );
    df.filter(&mask).map_err(AppError::from)
}

fn compute_pearson(
    df: &DataFrame,
    left: &str,
    right: &str,
    start_ms: f64,
    end_ms: f64,
) -> Result<(Option<f64>, usize), AppError> {
    let ts_ms = extract_ts_epoch_ms(df)?;
    let left_values = extract_f64_column_opt(df, left)?;
    let right_values = extract_f64_column_opt(df, right)?;
    let mut pairs = Vec::new();
    for idx in 0..ts_ms.len().min(left_values.len()).min(right_values.len()) {
        let ts = ts_ms[idx];
        if !ts.is_finite() || ts < start_ms || ts > end_ms {
            continue;
        }
        if let (Some(left_value), Some(right_value)) = (left_values[idx], right_values[idx]) {
            pairs.push([left_value, right_value]);
        }
    }
    let count = pairs.len();
    Ok((edatime_core::stats::pearson(&pairs), count))
}

fn build_relationship_rankings(
    df: &DataFrame,
    columns: &[String],
    reference_start_ms: f64,
    reference_end_ms: f64,
    comparison_start_ms: f64,
    comparison_end_ms: f64,
) -> Result<Vec<DriftRelationshipRank>, AppError> {
    let mut pairs = Vec::new();
    for left_idx in 0..columns.len() {
        for right_idx in left_idx + 1..columns.len() {
            let left = &columns[left_idx];
            let right = &columns[right_idx];
            let (reference, reference_count) =
                compute_pearson(df, left, right, reference_start_ms, reference_end_ms)?;
            let (comparison, comparison_count) =
                compute_pearson(df, left, right, comparison_start_ms, comparison_end_ms)?;
            if reference_count < 20 || comparison_count < 20 {
                continue;
            }
            let (Some(reference), Some(comparison)) = (reference, comparison) else {
                continue;
            };
            pairs.push(DriftRelationshipRank {
                left_column: left.clone(),
                right_column: right.clone(),
                reference,
                comparison,
                delta: (comparison - reference).abs(),
                aligned_reference_samples: reference_count,
                aligned_comparison_samples: comparison_count,
            });
        }
    }
    pairs.sort_by(|a, b| {
        b.delta
            .total_cmp(&a.delta)
            .then_with(|| a.left_column.cmp(&b.left_column))
            .then_with(|| a.right_column.cmp(&b.right_column))
    });
    Ok(pairs)
}

fn build_overview(columns: &BTreeMap<String, DriftResponse>) -> DriftInvestigationOverview {
    let feature_ranks: Vec<DriftFeatureRank> = columns.values().map(build_feature_rank).collect();
    let drift_score = feature_ranks
        .iter()
        .map(|rank| rank.drift_score)
        .max()
        .unwrap_or(0);
    let worst_level = feature_ranks
        .iter()
        .map(|rank| rank.latest_level.as_str())
        .fold("green", |current, level| match (current, level) {
            ("red", _) | (_, "red") => "red",
            ("yellow", _) | (_, "yellow") => "yellow",
            _ => "green",
        })
        .to_string();
    let columns_flagged = feature_ranks
        .iter()
        .filter(|rank| rank.flagged_windows > 0)
        .count();
    let windows_flagged = columns
        .values()
        .map(|response| {
            response
                .windows
                .iter()
                .filter(|window| window.drift_level != "green")
                .count()
        })
        .sum();
    let first_change_point = feature_ranks
        .iter()
        .filter_map(|rank| rank.first_change_point.clone())
        .min();
    DriftInvestigationOverview {
        drift_score,
        worst_level,
        columns_flagged,
        total_columns: columns.len(),
        windows_flagged,
        first_change_point,
    }
}

#[allow(clippy::too_many_arguments)]
pub fn compute_drift_investigation(
    df: &DataFrame,
    columns: &[String],
    segment_by: Option<&str>,
    segment_limit: usize,
    window_ms: i64,
    reference_start_ms: f64,
    reference_end_ms: f64,
    comparison_start_ms: f64,
    comparison_end_ms: f64,
    n_bins: usize,
    thresholds: DriftThresholds,
    include_quality: bool,
    include_change_points: bool,
    include_correlations: bool,
) -> Result<DriftInvestigationResponse, AppError> {
    let mut responses = BTreeMap::new();
    for column in columns {
        let response = compute_temporal_drift(
            df,
            column,
            window_ms,
            reference_start_ms,
            reference_end_ms,
            comparison_start_ms,
            comparison_end_ms,
            n_bins,
            thresholds.ks_pvalue_threshold,
            thresholds.es_pvalue_threshold,
            thresholds.wasserstein_threshold,
            thresholds.psi_minor_threshold,
            thresholds.psi_major_threshold,
        )?;
        responses.insert(column.clone(), response);
    }

    let mut feature_ranks: Vec<DriftFeatureRank> = responses.values().map(build_feature_rank).collect();
    feature_ranks.sort_by(|a, b| {
        b.drift_score
            .cmp(&a.drift_score)
            .then_with(|| b.flagged_windows.cmp(&a.flagged_windows))
            .then_with(|| a.column.cmp(&b.column))
    });

    let quality = include_quality.then(|| {
        let by_column = responses
            .values()
            .map(|response| (response.column.clone(), build_quality_summary(response)))
            .collect();
        DriftQualitySection { by_column }
    });

    let mut quality_issues = Vec::new();
    if let Some(quality_section) = quality.as_ref() {
        for feature_rank in &feature_ranks {
            if let Some(summary) = quality_section.by_column.get(&feature_rank.column) {
                quality_issues.extend(build_quality_issue_rank(
                    &feature_rank.column,
                    summary,
                    feature_rank.drift_score,
                ));
            }
        }
    }
    quality_issues.sort_by(|a, b| {
        b.drift_score
            .cmp(&a.drift_score)
            .then_with(|| a.column.cmp(&b.column))
            .then_with(|| a.issue.cmp(&b.issue))
    });

    let mut change_points = if include_change_points {
        responses
            .values()
            .filter_map(build_change_point_rank)
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    change_points.sort_by(|a, b| {
        b.drift_score
            .cmp(&a.drift_score)
            .then_with(|| a.iso_time.cmp(&b.iso_time))
            .then_with(|| a.column.cmp(&b.column))
    });

    let relationships = if include_correlations {
        let pairs = build_relationship_rankings(
            df,
            columns,
            reference_start_ms,
            reference_end_ms,
            comparison_start_ms,
            comparison_end_ms,
        )?;
        Some(DriftRelationshipSection {
            mode: "pearson_raw".to_string(),
            pairs: pairs.clone(),
        })
    } else {
        None
    };

    let mut segment_summary = None;
    let mut segment_rankings = Vec::new();
    if let Some(segment_col) = segment_by {
        let ts_ms = extract_ts_epoch_ms(df)?;
        let segment_values = extract_segment_values(df, segment_col)?;
        let segment_keys = top_segment_values(
            &ts_ms,
            &segment_values,
            comparison_start_ms,
            comparison_end_ms,
            segment_limit.max(1),
        );
        let mut groups = Vec::new();
        for (segment_value, sample_count) in segment_keys {
            let segment_df = filter_df_by_segment(df, segment_col, &segment_value)?;
            if segment_df.height() == 0 {
                continue;
            }
            let group_response = match compute_drift_investigation(
                &segment_df,
                columns,
                None,
                0,
                window_ms,
                reference_start_ms,
                reference_end_ms,
                comparison_start_ms,
                comparison_end_ms,
                n_bins,
                DriftThresholds {
                    ks_pvalue_threshold: thresholds.ks_pvalue_threshold,
                    es_pvalue_threshold: thresholds.es_pvalue_threshold,
                    wasserstein_threshold: thresholds.wasserstein_threshold,
                    psi_minor_threshold: thresholds.psi_minor_threshold,
                    psi_major_threshold: thresholds.psi_major_threshold,
                },
                false,
                false,
                false,
            ) {
                Ok(response) => response,
                Err(_) => continue,
            };
            let overview = group_response.overview;
            let feature_ranks = group_response.rankings.features;
            segment_rankings.push(DriftSegmentRank {
                segment_value: segment_value.clone(),
                drift_score: overview.drift_score,
                columns_flagged: overview.columns_flagged,
                sample_count,
            });
            groups.push(DriftSegmentGroup {
                value: segment_value,
                sample_count,
                overview,
                feature_ranks,
            });
        }
        segment_rankings.sort_by(|a, b| {
            b.drift_score
                .cmp(&a.drift_score)
                .then_with(|| b.columns_flagged.cmp(&a.columns_flagged))
                .then_with(|| a.segment_value.cmp(&b.segment_value))
        });
        segment_summary = Some(DriftSegmentSummary {
            segment_by: segment_col.to_string(),
            groups,
        });
    }

    let relationship_ranks = relationships
        .as_ref()
        .map(|section| section.pairs.clone())
        .unwrap_or_default();

    Ok(DriftInvestigationResponse {
        overview: build_overview(&responses),
        columns: responses,
        rankings: DriftRankingSummary {
            features: feature_ranks,
            segments: segment_rankings,
            change_points,
            quality_issues,
            relationships: relationship_ranks,
        },
        segments: segment_summary,
        quality,
        relationships,
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

    #[test]
    fn investigation_response_includes_rankings_quality_and_relationships() {
        let ts_values: Vec<i64> = (0..24)
            .map(|idx| 1_735_689_600_000 + idx as i64 * 3_600_000)
            .collect();
        let ts = Series::new("ts".into(), ts_values)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("ts should cast to datetime");
        let value_a = Series::new(
            "value_a".into(),
            vec![
                1.0, 1.1, 1.0, 1.2, 1.1, 1.0, 1.2, 1.1, 1.0, 1.1, 1.2, 1.0, 4.0, 4.1, 4.2,
                4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.0, 5.1,
            ],
        );
        let value_b = Series::new(
            "value_b".into(),
            vec![
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            ],
        );
        let segment = Series::new(
            "segment".into(),
            vec![
                "A", "B", "A", "B", "A", "B", "A", "B", "A", "B", "A", "B", "A", "B", "A",
                "B", "A", "B", "A", "B", "A", "B", "A", "B",
            ],
        );
        let df = DataFrame::new(
            ts.len(),
            vec![ts.into(), value_a.into(), value_b.into(), segment.into()],
        )
        .expect("test dataframe should build");

        let response = super::compute_drift_investigation(
            &df,
            &["value_a".to_string(), "value_b".to_string()],
            Some("segment"),
            2,
            21_600_000,
            1_735_689_600_000.0,
            1_735_732_800_000.0,
            1_735_732_800_000.0,
            1_735_776_000_000.0,
            20,
            DriftThresholds {
                ks_pvalue_threshold: 0.5,
                es_pvalue_threshold: 0.5,
                wasserstein_threshold: 0.0,
                psi_minor_threshold: 0.01,
                psi_major_threshold: 0.02,
            },
            true,
            true,
            true,
        )
        .expect("investigation should compute");

        assert_eq!(response.columns.len(), 2);
        assert!(!response.rankings.features.is_empty());
        assert_eq!(response.rankings.features[0].column, "value_a");
        assert!(response.quality.is_some());
        assert!(response.relationships.is_some());
        assert!(response.segments.is_some());
        assert_eq!(response.segments.as_ref().expect("segments").groups.len(), 2);
        assert!(
            response.overview.columns_flagged >= 1,
            "expected at least one flagged column"
        );
    }
}
