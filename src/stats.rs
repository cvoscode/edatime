//! Shared statistical and histogram utilities.

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
    let variance = values.iter().map(|&v| (v - mean).powi(2)).sum::<f64>() / n;
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
