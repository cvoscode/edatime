//! Shared statistical and histogram utilities.

use polars::prelude::*;

use crate::error::AppError;

/// Cast a series to f64 and collect values, filtering out non-finite entries.
/// Returns `Vec<Option<f64>>` where `None` was either null or non-finite.
pub fn series_to_finite_f64(series: &Series, label: &str) -> Result<Vec<f64>, AppError> {
    let casted = series
        .cast(&DataType::Float64)
        .map_err(|e| AppError::internal(format!("Cast '{label}': {e}")))?;
    let ca = casted
        .f64()
        .map_err(|e| AppError::internal(format!("Read '{label}': {e}")))?;
    Ok(ca
        .into_iter()
        .filter_map(|v| v.filter(|f| f.is_finite()))
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

/// Kendall tau-b rank correlation from x-y pairs.
///
/// Implemented in O(n log n) using a tie-aware merge-sort. Pairs are sorted
/// by (x asc, y asc) so equal-x groups become contiguous with non-decreasing
/// y values inside them. A merge-sort over the resulting y sequence then
/// counts inversions — these are exactly the discordant pairs across
/// x-distinct observations, because pairs inside an x-tie group have y in
/// non-decreasing order (no inversions to count). Tie counts on both axes
/// are accumulated by walking the x-sorted sequence. Matches
/// scipy.stats.kendalltau with `variant='b'`.
pub fn kendall_tau(pairs: &[[f64; 2]]) -> Option<f64> {
    let n = pairs.len();
    if n < 2 {
        return None;
    }

    // Sort indices stably by (x asc, y asc) using total_cmp so that
    // -0.0/0.0 distinctions are preserved consistently with the O(n²)
    // reference impl and with scipy. The secondary y-sort guarantees that
    // within each x-tie group the y values are non-decreasing, which lets the
    // inversion count below correctly ignore x-tied pairs.
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| {
        pairs[a][0]
            .total_cmp(&pairs[b][0])
            .then_with(|| pairs[a][1].total_cmp(&pairs[b][1]))
    });

    // ties_x: count of x-equal pairs whose y values differ. Subtract the
    // x-equal pairs that are also y-equal (i.e. duplicate rows), which the
    // O(n²) reference impl drops entirely. This is symmetric to the
    // `within` subtraction used below for `ties_y`. The dropped dual-tied
    // pairs are accumulated in `dropped` and subtracted from the
    // concordant-plus-discordant count below.
    let mut ties_x: u64 = 0;
    let mut dropped: u64 = 0;
    let mut start = 0usize;
    while start < n {
        let mut end = start + 1;
        while end < n
            && pairs[order[end]][0].total_cmp(&pairs[order[start]][0]) == std::cmp::Ordering::Equal
        {
            end += 1;
        }
        let group = end - start;
        if group > 1 {
            // Count pairs within this x-tied run that are also y-equal
            // (i.e. identical rows). Because `order` sorts by (x, y), the
            // y values within `[start, end)` are non-decreasing — walk the
            // y-equal sub-groups and count their within-group counts.
            let mut within = 0u64;
            let mut k = start;
            while k < end {
                let mut k2 = k + 1;
                while k2 < end
                    && pairs[order[k]][1].total_cmp(&pairs[order[k2]][1])
                        == std::cmp::Ordering::Equal
                {
                    k2 += 1;
                }
                let run = k2 - k;
                if run > 1 {
                    within += (run * (run - 1) / 2) as u64;
                }
                k = k2;
            }
            dropped += within;
            ties_x += (group * (group - 1) / 2) as u64 - within;
        }
        start = end;
    }

    // ties_y: count of y-equal pairs whose x values differ. Build a separate
    // y-major sort so equal-y runs are contiguous regardless of where they
    // appear in the x-sorted sequence.
    let mut y_order: Vec<usize> = (0..n).collect();
    y_order.sort_by(|&a, &b| {
        pairs[a][1]
            .total_cmp(&pairs[b][1])
            .then_with(|| pairs[a][0].total_cmp(&pairs[b][0]))
    });
    let mut ties_y: u64 = 0;
    let mut i = 0usize;
    while i < n {
        let mut j = i + 1;
        while j < n
            && pairs[y_order[j]][1].total_cmp(&pairs[y_order[i]][1]) == std::cmp::Ordering::Equal
        {
            j += 1;
        }
        let run = j - i;
        if run > 1 {
            // Subtract y-equal pairs that are also x-tied (counted in ties_x).
            let mut within = 0u64;
            let mut k = i;
            while k < j {
                let mut k2 = k + 1;
                while k2 < j
                    && pairs[y_order[k]][0].total_cmp(&pairs[y_order[k2]][0])
                        == std::cmp::Ordering::Equal
                {
                    k2 += 1;
                }
                let group = k2 - k;
                if group > 1 {
                    within += (group * (group - 1) / 2) as u64;
                }
                k = k2;
            }
            let total = (run * (run - 1) / 2) as u64;
            ties_y += total - within;
        }
        i = j;
    }

    // y sequence of the x-sorted array; count inversions via merge-sort.
    let mut ys: Vec<f64> = order.iter().map(|&i| pairs[i][1]).collect();
    let mut buf: Vec<f64> = vec![0.0; n];
    let inversions = count_inversions(&mut ys, &mut buf);

    let total_pairs = (n * (n - 1) / 2) as u64;
    // Pairs counted in ties_x or ties_y are NOT concordant/discordant.
    // Pairs with both x and y equal (duplicate rows) are dropped entirely
    // from both tie counts above; subtract them from the available pair
    // total so the formula matches the reference impl.
    let concordant_plus_discordant = (total_pairs - ties_x - ties_y - dropped) as f64;
    let discordant = inversions as f64;
    let concordant = concordant_plus_discordant - discordant;

    // If every pair was a tie or a duplicate, tau-b is undefined.
    if concordant_plus_discordant <= 0.0 {
        return None;
    }
    // Match the reference denom (non-y-tied * non-x-tied), which excludes
    // both single-axis ties and dual-tied (duplicate) pairs.
    let denom =
        ((total_pairs - ties_y - dropped) as f64 * (total_pairs - ties_x - dropped) as f64).sqrt();
    if !denom.is_finite() || denom <= f64::EPSILON {
        return None;
    }

    Some(((concordant - discordant) / denom).clamp(-1.0, 1.0))
}

/// Merge-sort `arr` in place and return the number of inversions (i.e. pairs
/// (i, j) with i < j and arr[i] > arr[j]). Stable. Implemented iteratively
/// bottom-up to keep the scratch buffer straightforward — each merge level
/// overwrites the source half with its sorted result, so the next level
/// always reads a fully sorted run.
fn count_inversions(arr: &mut [f64], buf: &mut [f64]) -> u64 {
    let n = arr.len();
    if n <= 1 {
        return 0;
    }
    let mut inv = 0u64;
    let mut width = 1usize;
    while width < n {
        let mut start = 0usize;
        while start < n {
            let mid = (start + width).min(n);
            let end = (start + 2 * width).min(n);
            // Merge arr[start..mid] and arr[mid..end] (both already sorted) into
            // buf[start..end], counting cross-inversions as we go.
            let mut i = start;
            let mut j = mid;
            let mut k = start;
            while i < mid && j < end {
                // Keep inversion ordering consistent with the tau tie logic:
                // `total_cmp` distinguishes `-0.0` from `0.0`, while `<=`
                // does not.
                if arr[i].total_cmp(&arr[j]) != std::cmp::Ordering::Greater {
                    buf[k] = arr[i];
                    i += 1;
                } else {
                    buf[k] = arr[j];
                    inv += (mid - i) as u64;
                    j += 1;
                }
                k += 1;
            }
            while i < mid {
                buf[k] = arr[i];
                i += 1;
                k += 1;
            }
            while j < end {
                buf[k] = arr[j];
                j += 1;
                k += 1;
            }
            // Copy the merged run back into arr so the next pass sees sorted input.
            arr[start..end].copy_from_slice(&buf[start..end]);
            start += 2 * width;
        }
        width *= 2;
    }
    inv
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

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod correlation_tests {
    use super::{kendall_tau, pearson, spearman};

    /// Reference O(n²) Kendall tau-b implementation. Uses `total_cmp` for tie
    /// detection (matching the production impl's tie semantics) so the
    /// comparison is meaningful rather than testing the old fragile `== 0.0`
    /// tie detection against the new merge-sort.
    fn kendall_tau_reference(pairs: &[[f64; 2]]) -> Option<f64> {
        let n = pairs.len();
        if n < 2 {
            return None;
        }
        let mut concordant = 0.0f64;
        let mut discordant = 0.0f64;
        let mut ties_x = 0.0f64;
        let mut ties_y = 0.0f64;
        for i in 0..n {
            for j in (i + 1)..n {
                let cx = pairs[i][0].total_cmp(&pairs[j][0]);
                let cy = pairs[i][1].total_cmp(&pairs[j][1]);
                if cx == std::cmp::Ordering::Equal && cy == std::cmp::Ordering::Equal {
                    continue;
                }
                if cx == std::cmp::Ordering::Equal {
                    ties_x += 1.0;
                    continue;
                }
                if cy == std::cmp::Ordering::Equal {
                    ties_y += 1.0;
                    continue;
                }
                if cx == cy {
                    concordant += 1.0;
                } else {
                    discordant += 1.0;
                }
            }
        }
        let denom =
            ((concordant + discordant + ties_x) * (concordant + discordant + ties_y)).sqrt();
        if !denom.is_finite() || denom <= f64::EPSILON {
            return None;
        }
        Some(((concordant - discordant) / denom).clamp(-1.0, 1.0))
    }

    fn assert_close(a: Option<f64>, b: Option<f64>, tol: f64) {
        match (a, b) {
            (None, None) => {}
            (Some(x), Some(y)) => assert!((x - y).abs() <= tol, "expected {x} ≈ {y} within {tol}"),
            (x, y) => panic!("mismatch: {x:?} vs {y:?}"),
        }
    }

    #[test]
    fn kendall_tau_returns_one_for_strictly_increasing_pairs() {
        let pairs = [[1.0, 2.0], [2.0, 4.0], [3.0, 6.0], [4.0, 8.0]];

        assert_eq!(pearson(&pairs), Some(1.0));
        assert_eq!(spearman(&pairs), Some(1.0));
        assert_eq!(kendall_tau(&pairs), Some(1.0));
    }

    #[test]
    fn kendall_tau_handles_ties_with_tau_b() {
        let pairs = [[1.0, 1.0], [1.0, 2.0], [2.0, 2.0], [3.0, 3.0]];

        let tau = kendall_tau(&pairs).unwrap();
        // For pairs [[1,1],[1,2],[2,2],[3,3]] with 1 x-tie, no inversions
        // across x-distinct observations, ties_y=1: tau = 4 / sqrt(5*5) = 0.8.
        assert!(
            tau > 0.79 && tau < 0.81,
            "expected tau-b around 0.8, got {tau}"
        );
    }

    #[test]
    fn kendall_tau_treats_signed_zero_as_ordered() {
        let pairs = [[1.0, 0.0], [2.0, -0.0]];
        assert_close(kendall_tau(&pairs), kendall_tau_reference(&pairs), 1e-12);
    }

    #[test]
    fn kendall_tau_matches_reference_on_random_inputs() {
        use rand::seq::SliceRandom;
        use rand::{Rng, SeedableRng};
        let mut rng = rand::rngs::StdRng::seed_from_u64(0xC0FFEE);
        let sizes = [2usize, 3, 4, 8, 17, 32, 64];
        for &n in &sizes {
            for attempt in 0..10 {
                let mut x: Vec<f64> = (0..n).map(|k| (k as f64 * 0.37 + 0.1).sin()).collect();
                let mut y: Vec<f64> = (0..n).map(|k| (k as f64 * 0.91 + 0.2).cos()).collect();
                x.shuffle(&mut rng);
                y.shuffle(&mut rng);
                for v in x.iter_mut() {
                    if rng.gen_bool(0.25) {
                        *v = v.trunc();
                    }
                }
                for v in y.iter_mut() {
                    if rng.gen_bool(0.25) {
                        *v = v.trunc();
                    }
                }
                let pairs: Vec<[f64; 2]> = x
                    .iter()
                    .copied()
                    .zip(y.iter().copied())
                    .map(|(a, b)| [a, b])
                    .collect();
                let reference = kendall_tau_reference(&pairs);
                let fast = kendall_tau(&pairs);
                if fast != reference {
                    tracing::error!(
                        "MISMATCH n={n} attempt={attempt} pairs={pairs:?} ref={reference:?} fast={fast:?}"
                    );
                }
                assert_close(fast, reference, 1e-9);
            }
        }
    }

    #[test]
    fn kendall_tau_matches_reference_on_unsorted_pairs() {
        let pairs = [[3.0, 6.0], [1.0, 2.0], [4.0, 8.0], [2.0, 4.0]];
        assert_close(kendall_tau(&pairs), kendall_tau_reference(&pairs), 1e-12);
    }

    #[test]
    fn kendall_tau_handles_duplicate_rows() {
        // First two rows are identical (both x-tied and y-tied).
        // Reference impl drops them; fast impl must match.
        let pairs = [[1.0, 5.0], [1.0, 5.0], [2.0, 7.0], [3.0, 9.0]];
        assert_close(kendall_tau(&pairs), kendall_tau_reference(&pairs), 1e-9);
    }

    #[test]
    fn kendall_tau_handles_three_way_duplicate() {
        // Three rows identical (one pair counted as both x-tie and y-tie,
        // and one pair counted as both x-tie and y-tie again).
        let pairs = [[1.0, 1.0], [1.0, 1.0], [1.0, 1.0], [2.0, 2.0]];
        assert_close(kendall_tau(&pairs), kendall_tau_reference(&pairs), 1e-9);
    }

    #[test]
    fn kendall_tau_handles_fully_duplicated_set() {
        // All rows identical → tau-b is undefined but the impl must not panic.
        let pairs = [[1.0, 1.0]; 4];
        let _ = kendall_tau(&pairs);
    }

    #[test]
    fn kendall_tau_performance_smoke_test() {
        // O(n log n) should complete a 20k-row Kendall in well under a second.
        // The previous O(n²) impl took ~10s on this size.
        let n = 20_000usize;
        let pairs: Vec<[f64; 2]> = (0..n)
            .map(|i| [i as f64, (i as f64 * 0.001).sin()])
            .collect();
        let start = std::time::Instant::now();
        let _ = kendall_tau(&pairs);
        let elapsed = start.elapsed();
        assert!(
            elapsed < std::time::Duration::from_millis(500),
            "Kendall on 20k rows took {elapsed:?} (expected < 500ms)"
        );
    }
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
        assert!((0.0..1.0).contains(&stat_same));
        assert!((0.0..=1.0).contains(&p_same));

        let c = vec![10.0, 10.1, 10.2, 10.3, 10.4];
        let (stat_diff, p_diff) = ks_test_2sample(&a, &c);
        assert!(stat_diff > 0.0);
        assert!((0.0..=1.0).contains(&p_diff));
    }

    #[test]
    fn test_epps_singleton_basic_properties() {
        let a = vec![0.0f64; 8];
        let b = vec![1.0f64; 8];
        let (stat, p) = epps_singleton_test(&a, &b);
        assert!(stat.is_finite());
        assert!((0.0..=1.0).contains(&p));

        let x = vec![0.0f64, 0.1, 0.2, 0.3, 0.4, 0.5];
        let y = x.clone();
        let (stat_same, p_same) = epps_singleton_test(&x, &y);
        assert!(stat_same >= 0.0);
        assert!((0.0..=1.0).contains(&p_same));
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod proptests {
    //! Property-based tests for the statistics primitives.
    //!
    //! Targets:
    //! - `pearson` / `spearman` / `kendall_tau` invariants
    //!   (`|r| ≤ 1`, constant-input handling, linear-input sign).
    //! - `compute_column_stats` invariants
    //!   (min ≤ median ≤ max, q1 ≤ median ≤ q3, std_dev ≥ 0, mean in range).
    //! - `build_histogram_with_bins` invariants
    //!   (sum of counts equals input length when input spans the bin range).

    use super::*;
    use proptest::prelude::*;

    /// Finite f64 in a small bounded range — keeps arithmetic well-conditioned
    /// and avoids NaN/inf leakage into downstream properties.
    fn bounded_finite() -> impl Strategy<Value = f64> {
        -1_000.0f64..1_000.0f64
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(256))]

        #[test]
        fn pearson_is_bounded_for_any_pairs(
            xs in proptest::collection::vec(bounded_finite(), 2..32),
            ys in proptest::collection::vec(bounded_finite(), 2..32),
        ) {
            let n = xs.len().min(ys.len());
            let pairs: Vec<[f64; 2]> = xs.iter().zip(ys.iter()).take(n).map(|(&x, &y)| [x, y]).collect();
            if let Some(r) = pearson(&pairs) {
                prop_assert!(r.is_finite(), "r must be finite, got {r}");
                prop_assert!((-1.0..=1.0).contains(&r), "|r| must be ≤ 1, got {r}");
            }
        }

        #[test]
        fn pearson_perfect_linear_is_plus_or_minus_one(
            slope in bounded_finite(),
            n in 3usize..32,
            intercept in bounded_finite(),
        ) {
            // y = slope * x + intercept for distinct x.
            let pairs: Vec<[f64; 2]> = (0..n)
                .map(|i| {
                    let x = i as f64 + 1.0;
                    [x, slope * x + intercept]
                })
                .collect();
            let r = pearson(&pairs).unwrap();
            // |r| must be 1.0 for an exact linear relationship.
            prop_assert!((r.abs() - 1.0).abs() < 1e-9, "expected |r| = 1, got {r}");
        }

        #[test]
        fn pearson_zero_on_zero_x(_unused in 0..1i32) {
            // All x = 0, varying y → variance_x = 0, so correlation is undefined.
            let pairs = [[0.0, 1.0], [0.0, 2.0], [0.0, 3.0], [0.0, 4.0]];
            prop_assert_eq!(pearson(&pairs), None);
        }

        #[test]
        fn pearson_is_symmetric(
            xs in proptest::collection::vec(bounded_finite(), 2..32),
            ys in proptest::collection::vec(bounded_finite(), 2..32),
        ) {
            let n = xs.len().min(ys.len());
            let xy: Vec<[f64; 2]> = xs.iter().zip(ys.iter()).take(n).map(|(&x, &y)| [x, y]).collect();
            let yx: Vec<[f64; 2]> = xs.iter().zip(ys.iter()).take(n).map(|(&x, &y)| [y, x]).collect();
            prop_assert_eq!(pearson(&xy), pearson(&yx));
        }

        #[test]
        fn spearman_matches_pearson_on_linear_input(
            slope in bounded_finite(),
            n in 3usize..32,
        ) {
            // Strictly increasing x and y ⇒ Spearman of (x, y) == Pearson
            // because the ranks are a linear transform of the values.
            let pairs: Vec<[f64; 2]> = (0..n)
                .map(|i| {
                    let x = i as f64 + 1.0;
                    [x, slope * x]
                })
                .collect();
            let p = pearson(&pairs).unwrap();
            let s = spearman(&pairs).unwrap();
            prop_assert!((p - s).abs() < 1e-9, "pearson={p} spearman={s}");
        }

        #[test]
        fn kendall_tau_is_bounded_when_defined(
            xs in proptest::collection::vec(bounded_finite(), 2..32),
            ys in proptest::collection::vec(bounded_finite(), 2..32),
        ) {
            let n = xs.len().min(ys.len());
            let pairs: Vec<[f64; 2]> = xs.iter().zip(ys.iter()).take(n).map(|(&x, &y)| [x, y]).collect();
            if let Some(tau) = kendall_tau(&pairs) {
                prop_assert!(tau.is_finite());
                prop_assert!((-1.0..=1.0).contains(&tau), "tau must be in [-1, 1], got {tau}");
            }
        }

        #[test]
        fn kendall_tau_agrees_with_pearson_sign_on_linear_input(
            slope in 0.1f64..10.0f64, // exclude 0 to keep both defined
            n in 3usize..32,
        ) {
            let pairs: Vec<[f64; 2]> = (0..n)
                .map(|i| {
                    let x = i as f64 + 1.0;
                    [x, slope * x]
                })
                .collect();
            let p = pearson(&pairs).unwrap();
            let t = kendall_tau(&pairs).unwrap();
            // Sign must match on a strictly monotone linear map.
            prop_assert_eq!(p.signum(), t.signum());
        }

        #[test]
        fn column_stats_invariants(values in proptest::collection::vec(bounded_finite(), 1..64)) {
            let stats = compute_column_stats(&values);
            let min = stats.min.unwrap();
            let max = stats.max.unwrap();
            let median = stats.median.unwrap();
            let q1 = stats.q1.unwrap();
            let q3 = stats.q3.unwrap();
            let mean = stats.mean.unwrap();
            let std = stats.std_dev.unwrap();

            prop_assert!(min <= max, "min {min} > max {max}");
            prop_assert!(min <= median && median <= max, "median {median} out of [{min}, {max}]");
            prop_assert!(q1 <= q3, "q1 {q1} > q3 {q3}");
            prop_assert!(q1 <= median && median <= q3, "median {median} out of [{q1}, {q3}]");
            prop_assert!(mean >= min && mean <= max, "mean {mean} out of [{min}, {max}]");
            prop_assert!(std >= 0.0, "std_dev must be ≥ 0, got {std}");
            prop_assert!(std.is_finite(), "std_dev must be finite, got {std}");
        }

        #[test]
        fn column_stats_empty_returns_none(_unused in 0..1i32) {
            let stats = compute_column_stats(&[]);
            prop_assert!(stats.min.is_none());
            prop_assert!(stats.max.is_none());
            prop_assert!(stats.mean.is_none());
            prop_assert!(stats.std_dev.is_none());
            prop_assert!(stats.median.is_none());
            prop_assert!(stats.q1.is_none());
            prop_assert!(stats.q3.is_none());
        }

        #[test]
        fn histogram_counts_sum_to_input_length(
            values in proptest::collection::vec(-100.0f64..100.0f64, 0..200),
            bins in 2usize..32,
        ) {
            // Use data-driven bounds so all values fall within [min, max]
            // and the count-total invariant holds exactly.
            if values.is_empty() {
                return Ok(());
            }
            let mut sorted = values.clone();
            sorted.sort_by(|a, b| a.total_cmp(b));
            let lo = sorted[0];
            let hi = sorted[sorted.len() - 1];
            // If all values are equal, the impl returns a single bin with the
            // total count, which is still sum-to-length.
            let h = build_histogram_with_bins(&values, lo, hi, bins).unwrap();
            let total: u64 = h.counts.iter().sum();
            prop_assert_eq!(total, values.len() as u64);
            // bin_edges has either `bins + 1` entries (normal case, max > min)
            // or 2 entries (degenerate case where max <= min ⇒ single bin
            // edge pair). Both shapes preserve the count-total invariant.
            prop_assert!(
                h.bin_edges.len() == bins + 1 || h.bin_edges.len() == 2,
                "unexpected bin_edges.len = {}",
                h.bin_edges.len()
            );
        }
    }
}
