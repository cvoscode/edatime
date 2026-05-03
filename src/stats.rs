//! Shared statistical and histogram utilities.

use polars::prelude::*;

use crate::error::AppError;

/// Cast a series to f64 and collect values, filtering out non-finite entries.
/// Returns `Vec<Option<f64>>` where `None` was either null or non-finite.
pub fn series_to_finite_f64(series: &Series, label: &str) -> Result<Vec<Option<f64>>, AppError> {
    let casted = series
        .cast(&DataType::Float64)
        .map_err(|e| AppError::internal(format!("Cast '{label}': {e}")))?;
    let ca = casted
        .f64()
        .map_err(|e| AppError::internal(format!("Read '{label}': {e}")))?;
    Ok(ca
        .into_iter()
        .map(|v| v.filter(|f| f.is_finite()))
        .collect())
}

/// Histogram with bin edges and counts.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Histogram {
    pub bin_edges: Vec<f64>,
    pub counts: Vec<u64>,
}

const DEFAULT_BINS: usize = 24;

/// Build a histogram from a slice of finite f64 values.
/// Returns `None` when the input is empty.
pub fn build_histogram(values: &[f64], min: f64, max: f64) -> Option<Histogram> {
    build_histogram_with_bins(values, min, max, DEFAULT_BINS)
}

/// Build a histogram with a configurable number of bins (clamped to 2..=max_bins).
pub fn build_histogram_with_bins(
    values: &[f64],
    min: f64,
    max: f64,
    bins: usize,
) -> Option<Histogram> {
    if values.is_empty() {
        return None;
    }

    let bins = bins.clamp(2, 1000);

    if max <= min {
        return Some(Histogram {
            bin_edges: vec![min, max],
            counts: vec![values.len() as u64],
        });
    }

    let span = max - min;
    let mut counts = vec![0u64; bins];
    for &v in values {
        let mut idx = ((v - min) / span * bins as f64).floor() as isize;
        idx = idx.clamp(0, bins as isize - 1);
        counts[idx as usize] += 1;
    }

    let bin_edges: Vec<f64> = (0..=bins)
        .map(|i| min + span * i as f64 / bins as f64)
        .collect();

    Some(Histogram { bin_edges, counts })
}

/// Summary statistics for a numeric column.
#[derive(Debug, serde::Serialize)]
pub struct ColumnStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std_dev: Option<f64>,
    pub median: Option<f64>,
    pub q1: Option<f64>,
    pub q3: Option<f64>,
}

/// Compute summary statistics (min, max, mean, std_dev, median, q1, q3) for a
/// slice of finite f64 values.
pub fn compute_column_stats(values: &[f64]) -> ColumnStats {
    if values.is_empty() {
        return ColumnStats {
            min: None,
            max: None,
            mean: None,
            std_dev: None,
            median: None,
            q1: None,
            q3: None,
        };
    }

    let n = values.len() as f64;
    let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let mean = values.iter().sum::<f64>() / n;
    // Two-pass variance (numerically stable for large/small values).
    let variance = values
        .iter()
        .map(|&v| {
            let d = v - mean;
            d * d
        })
        .sum::<f64>()
        / n;
    let std_dev = variance.sqrt();

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));

    let percentile = |p: f64| -> Option<f64> {
        let idx = p * (sorted.len().saturating_sub(1)) as f64;
        let lo = idx.floor() as usize;
        let hi = idx.ceil() as usize;
        if lo >= sorted.len() {
            return Some(sorted[sorted.len() - 1]);
        }
        if hi >= sorted.len() || lo == hi {
            return Some(sorted[lo]);
        }
        let frac = idx - lo as f64;
        Some(sorted[lo] * (1.0 - frac) + sorted[hi] * frac)
    };

    ColumnStats {
        min: Some(min),
        max: Some(max),
        mean: Some(mean),
        std_dev: Some(std_dev),
        median: percentile(0.5),
        q1: percentile(0.25),
        q3: percentile(0.75),
    }
}

/// Pearson correlation coefficient from x-y pairs.
pub fn pearson(pairs: &[[f64; 2]]) -> Option<f64> {
    if pairs.len() < 2 {
        return None;
    }

    let n = pairs.len() as f64;
    let mut sum_x = 0.0f64;
    let mut sum_y = 0.0f64;
    let mut sum_xy = 0.0f64;
    let mut sum_x2 = 0.0f64;
    let mut sum_y2 = 0.0f64;

    for [x, y] in pairs {
        sum_x += *x;
        sum_y += *y;
        sum_xy += *x * *y;
        sum_x2 += *x * *x;
        sum_y2 += *y * *y;
    }

    let cov = n * sum_xy - sum_x * sum_y;
    let var_x = n * sum_x2 - sum_x * sum_x;
    let var_y = n * sum_y2 - sum_y * sum_y;
    let denom = (var_x * var_y).sqrt();

    if !denom.is_finite() || denom <= f64::EPSILON {
        return None;
    }

    Some((cov / denom).clamp(-1.0, 1.0))
}

/// Spearman rank correlation from x-y pairs.
pub fn spearman(pairs: &[[f64; 2]]) -> Option<f64> {
    if pairs.len() < 2 {
        return None;
    }

    let xs: Vec<f64> = pairs.iter().map(|p| p[0]).collect();
    let ys: Vec<f64> = pairs.iter().map(|p| p[1]).collect();
    let rx = rank_with_ties(&xs);
    let ry = rank_with_ties(&ys);

    let ranked_pairs: Vec<[f64; 2]> = rx.into_iter().zip(ry).map(|(x, y)| [x, y]).collect();
    pearson(&ranked_pairs)
}

fn rank_with_ties(values: &[f64]) -> Vec<f64> {
    let mut indexed: Vec<(usize, f64)> = values.iter().copied().enumerate().collect();
    indexed.sort_by(|a, b| a.1.total_cmp(&b.1));

    let mut ranks = vec![0.0f64; values.len()];
    let mut i = 0usize;

    while i < indexed.len() {
        let mut j = i + 1;
        while j < indexed.len() && indexed[j].1 == indexed[i].1 {
            j += 1;
        }

        let avg_rank = ((i + 1 + j) as f64) / 2.0;
        for k in i..j {
            ranks[indexed[k].0] = avg_rank;
        }
        i = j;
    }

    ranks
}

/// Two-sample Kolmogorov-Smirnov test statistic.
///
/// Returns `(ks_statistic, p_value_approx)`.
/// The p-value is an asymptotic approximation via the Kolmogorov distribution.
pub fn ks_test_2sample(a: &[f64], b: &[f64]) -> (f64, f64) {
    if a.is_empty() || b.is_empty() {
        return (f64::NAN, f64::NAN);
    }

    let mut sa = a.to_vec();
    let mut sb = b.to_vec();
    sa.sort_by(|x, y| x.total_cmp(y));
    sb.sort_by(|x, y| x.total_cmp(y));

    let n1 = sa.len() as f64;
    let n2 = sb.len() as f64;

    // Merge sorted arrays and compute KS statistic
    let mut i = 0usize;
    let mut j = 0usize;
    let mut max_diff = 0.0f64;

    while i < sa.len() || j < sb.len() {
        let v = if j >= sb.len() || (i < sa.len() && sa[i] <= sb[j]) {
            i += 1;
            sa[i - 1]
        } else {
            j += 1;
            sb[j - 1]
        };
        // Advance past duplicates
        while i < sa.len() && sa[i] == v {
            i += 1;
        }
        while j < sb.len() && sb[j] == v {
            j += 1;
        }
        let cdf1 = i as f64 / n1;
        let cdf2 = j as f64 / n2;
        let diff = (cdf1 - cdf2).abs();
        if diff > max_diff {
            max_diff = diff;
        }
    }

    // Asymptotic p-value: P(D > d) ≈ 2 * exp(-2 * lambda^2)
    // where lambda = D * sqrt(n1*n2 / (n1+n2))
    let n_eff = (n1 * n2 / (n1 + n2)).sqrt();
    let lambda = max_diff * n_eff;
    let p_value = if lambda <= 0.0 {
        1.0
    } else {
        // Kolmogorov distribution CDF approximation (two-sided)
        let mut p = 0.0f64;
        for k in 1..=100i64 {
            let term = (k as f64).powi(2) * lambda * lambda;
            let sign = if k % 2 == 0 { 1.0 } else { -1.0 };
            p += sign * (-2.0 * term).exp();
        }
        (2.0 * p.abs()).min(1.0)
    };

    (max_diff, p_value)
}

/// Approximate Epps–Singleton two-sample test.
/// Returns (statistic, p_value_estimate).
/// P-value is estimated via permutation (up to 200 permutations).
pub fn epps_singleton_test(a: &[f64], b: &[f64]) -> (f64, f64) {
    use rand::seq::SliceRandom;

    if a.is_empty() || b.is_empty() {
        return (f64::NAN, f64::NAN);
    }

    // Prepare t grid for numeric integration
    let mut combined: Vec<f64> = Vec::with_capacity(a.len() + b.len());
    combined.extend_from_slice(a);
    combined.extend_from_slice(b);

    // scale t range based on pooled std
    let pooled_std = {
        let mean = combined.iter().sum::<f64>() / combined.len() as f64;
        let var = combined.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / combined.len() as f64;
        var.sqrt().max(1e-6)
    };

    let t_max = (5.0 / pooled_std).min(50.0);

    let compute_stat = |x: &[f64], y: &[f64], n_t: usize, dt: f64| -> f64 {
        let n = x.len() as f64;
        let m = y.len() as f64;
        let mut acc = 0.0f64;
        for k in 0..n_t {
            let t = (k as f64 + 0.5) * dt;
            // weight function
            let w = (-0.5 * t * t).exp();
            let (re_x, im_x) = x.iter().fold((0.0f64, 0.0f64), |(re, im), &v| {
                (re + (t * v).cos(), im + (t * v).sin())
            });
            let (re_y, im_y) = y.iter().fold((0.0f64, 0.0f64), |(re, im), &v| {
                (re + (t * v).cos(), im + (t * v).sin())
            });
            let re_x = re_x / n;
            let im_x = im_x / n;
            let re_y = re_y / m;
            let im_y = im_y / m;
            let diff_sq = (re_x - re_y) * (re_x - re_y) + (im_x - im_y) * (im_x - im_y);
            acc += w * diff_sq;
        }
        // scale by effective sample size
        
        (n * m / (n + m)) * acc * dt
    };

    // Permutation test for p-value estimation.
    // Adaptively reduce permutation count and t-grid size for large arrays so
    // the test stays fast even when called inside a per-window loop.  For
    // combined sizes > 50 we use n_t=16 and max_perm=20; the p-value
    // estimate is still a useful order-of-magnitude signal.
    let _total = combined.len();
    let (n_t, max_perm) = if _total > 50 {
        (16usize, 20usize)
    } else {
        (64usize, 200usize)
    };
    let dt = t_max / (n_t as f64);
    let observed = compute_stat(a, b, n_t, dt);
    let mut rng = rand::thread_rng();
    let mut pooled = combined.clone();
    let mut count_ge = 0usize;
    for _ in 0..max_perm {
        pooled.shuffle(&mut rng);
        let x_perm = &pooled[..a.len()];
        let y_perm = &pooled[a.len()..];
        let stat = compute_stat(x_perm, y_perm, n_t, dt);
        if stat >= observed {
            count_ge += 1;
        }
    }
    let p = ((count_ge as f64) + 1.0) / ((max_perm as f64) + 1.0);
    (observed, p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ks_identical_and_different() {
        let a = vec![0.0, 0.1, 0.2, 0.3, 0.4];
        let b = a.clone();
        let (stat_same, p_same) = ks_test_2sample(&a, &b);
        assert!(stat_same >= 0.0 && stat_same < 1.0);
        assert!(p_same >= 0.0 && p_same <= 1.0);

        let c = vec![10.0, 10.1, 10.2, 10.3, 10.4];
        let (stat_diff, p_diff) = ks_test_2sample(&a, &c);
        assert!(stat_diff > 0.0);
        assert!(p_diff >= 0.0 && p_diff <= 1.0);
    }

    #[test]
    fn test_epps_singleton_basic_properties() {
        let a = vec![0.0f64; 8];
        let b = vec![1.0f64; 8];
        let (stat, p) = epps_singleton_test(&a, &b);
        assert!(stat.is_finite());
        assert!(p >= 0.0 && p <= 1.0);

        let x = vec![0.0f64, 0.1, 0.2, 0.3, 0.4, 0.5];
        let y = x.clone();
        let (stat_same, p_same) = epps_singleton_test(&x, &y);
        assert!(stat_same >= 0.0);
        assert!(p_same >= 0.0 && p_same <= 1.0);
    }
}
