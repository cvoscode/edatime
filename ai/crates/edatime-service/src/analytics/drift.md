# crates/edatime-service/src/analytics/drift.rs
> Temporal drift analysis — KS test, Wasserstein-1 distance, PSI, Epps-Singleton test.

## Structs
- `WindowDistributionStats { start_ms, end_ms, label, count, null_count, completeness, mean, std, min, max, quantiles, hist_bins, hist_counts, ecdf_x, ecdf_y }`
- `DriftWindowStats { distribution, ks_stat, ks_pvalue, es_stat, es_pvalue, wasserstein, psi, drift_level, low_sample_warning }`
- `DriftThresholds { ks_threshold, wasserstein_threshold, psi_minor_threshold, psi_major_threshold }`
- `DriftMetadata { computation_time_ms, num_windows, reference_samples, bin_count_warning, effective_bins, psi_sample_ratio_warning, avg_window_samples }`
- `DriftResponse { column, reference, windows, thresholds, metadata }`

## Functions
- `pub fn ks_test_2sample(a: &[f64], b: &[f64]) -> (f64, f64)`
- `pub fn wasserstein_distance_1d(a: &[f64], b: &[f64]) -> f64`
- `pub fn compute_psi(reference: &[f64], current: &[f64], n_bins: usize) -> f64`
- `pub fn compute_temporal_drift(df: &DataFrame, column: &str, window_ms: i64, ref_start_ms: f64, ref_end_ms: f64, curr_start_ms: f64, curr_end_ms: f64, n_bins: usize, ks_threshold: f64, wasserstein_threshold: f64, psi_minor: f64, psi_major: f64) -> Result<DriftResponse, AppError>`