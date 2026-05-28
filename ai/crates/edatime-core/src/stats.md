# crates/edatime-core/src/stats.rs
> Shared statistical and histogram utilities.

## Functions

- `pub fn series_to_finite_f64(series: &Series, label: &str) -> Result<Vec<f64>, AppError>`
  - Casts series to f64, filters out non-finite entries.

- `pub fn build_histogram(values: &[f64], min: f64, max: f64) -> Option<Histogram>`
  - Builds histogram with default 24 bins.

- `pub fn build_histogram_with_bins(values: &[f64], min: f64, max: f64, bins: usize) -> Option<Histogram>`
  - Builds histogram with configurable bin count (clamped to 2..=1000).

- `pub fn compute_column_stats(values: &[f64]) -> ColumnStats`
  - Computes summary stats: min, max, mean, std_dev, median, q1, q3.

- `pub fn pearson(pairs: &[[f64; 2]]) -> Option<f64>`
  - Pearson correlation coefficient from x-y pairs.

- `pub fn spearman(pairs: &[[f64; 2]]) -> Option<f64>`
  - Spearman rank correlation from x-y pairs.

- `pub fn ks_test_2sample(a: &[f64], b: &[f64]) -> (f64, f64)`
  - Two-sample Kolmogorov-Smirnov test. Returns (statistic, p_value_approx).

- `pub fn epps_singleton_test(a: &[f64], b: &[f64]) -> (f64, f64)`
  - Approximate Epps–Singleton two-sample test with permutation p-value.