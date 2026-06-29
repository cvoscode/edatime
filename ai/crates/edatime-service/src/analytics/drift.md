# ai/crates/edatime-service/src/analytics/drift.md
> Temporal drift analysis — KS test, Wasserstein-1 distance, PSI, Epps-Singleton test, and Jensen-Shannon divergence.

## Functions
- `pub fn ks_test_2sample(a: &[f64], b: &[f64]) -> (f64, f64)`
  - Two-sample Kolmogorov-Smirnov test; both slices must be pre-sorted. Returns `(max_diff, p_value)`.

- `pub fn wasserstein_distance_1d(a: &[f64], b: &[f64]) -> f64`
  - Earth Mover's Distance on sorted data.

- `pub fn compute_psi(reference: &[f64], current: &[f64], n_bins: usize) -> f64`
  - Population Stability Index using reference-quantile binning.

- `pub fn psi_ref_props_from_sorted(ref_sorted: &[f64], edges: &[f64]) -> Vec<f64>`
  - Pre-computes reference bin proportions from sorted data and edge boundaries.

- `pub fn compute_psi_with_ref_props(ref_props: &[f64], current: &[f64], edges: &[f64]) -> f64`
  - PSI using pre-computed reference proportions (avoids re-sorting).

- `pub fn jensen_shannon_divergence_with_ref_props(ref_props: &[f64], current: &[f64], edges: &[f64]) -> f64`
  - Jensen-Shannon divergence via KL-divergence against midpoint distribution.

- `pub fn classify_drift_window(psi, wasserstein, ks_pvalue, es_pvalue, thresholds: &DriftThresholds) -> (String, Vec<String>)`
  - Classifies drift as "green"/"yellow"/"red" and returns trigger reasons.

- `pub fn format_window_label(start_ms, end_ms, window_ms) -> String`
  - Formats a window label using time-only when same-day hourly windows are detected.

- `pub fn compute_temporal_drift(df: &DataFrame, column: &str, window_ms, ref_start_ms, ref_end_ms, curr_start_ms, curr_end_ms, n_bins, ks_pvalue_threshold, es_pvalue_threshold, wasserstein_threshold, psi_minor, psi_major) -> Result<DriftResponse, AppError>`
  - Full temporal drift analysis pipeline: splits data into windows, computes statistics and drift metrics per window.

- `pub fn compute_drift_investigation(df: &DataFrame, columns: &[&str], column_label_map: &HashMap<String, String>, window_ms, ref_start_ms, ref_end_ms, curr_start_ms, curr_end_ms, n_bins, ks_pvalue_threshold, es_pvalue_threshold, wasserstein_threshold, psi_minor, psi_major) -> Result<DriftInvestigationResponse, AppError>`
  - Comprehensive drift investigation across multiple columns; includes segment analysis, quality checks, and relationship analysis.

## Structs
- `pub struct WindowDistributionStats` — Distribution statistics for a single window (count, mean, std, quantiles, histogram, ECDF).
- `pub struct DriftWindowStats` extends `WindowDistributionStats` — Per-window drift metrics: KS stat/p-value, Epps-Singleton stat/p-value, Wasserstein, PSI, JSD, level, trigger reasons.
- `pub struct DriftThresholds` — Thresholds for drift alerting (KS, ES, Wasserstein, PSI minor/major).
- `pub struct DriftMetadata` — Computation metadata: time_ms, num_windows, reference_samples, bin_count_warning, effective_bins, psi_sample_ratio_warning, avg_window_samples.
- `pub struct DriftResponse { column, reference, windows, thresholds, metadata }` — Full response for a single-column drift analysis.
- `pub struct DriftInvestigationOverview { drift_score, worst_level, columns_flagged, total_columns, windows_flagged, first_change_point }` — Summary overview of investigation.
- `pub struct DriftFeatureRank { column, drift_score, latest_level, flagged_windows, first_change_point }` — Ranked feature drift info.
- `pub struct DriftSegmentRank { segment_value, drift_score, columns_flagged, sample_count }` — Segment-level drift rank.
- `pub struct DriftChangePointRank { column, label, iso_time, drift_score, trigger_reasons }` — Change point rank.
- `pub struct DriftQualityIssueRank { column, issue, label, drift_score }` — Quality issue rank.
- `pub struct DriftRelationshipRank { left_column, right_column, reference, comparison, delta, aligned_reference_samples, aligned_comparison_samples }` — Relationship drift between two columns.
- `pub struct DriftRankingSummary { features, segments, change_points, quality_issues, relationships }` — Aggregated ranking summary.
- `pub struct DriftSegmentGroup { value, sample_count, overview, feature_ranks }` — Segment group with overview and feature ranks.
- `pub struct DriftSegmentSummary { segment_by, groups }` — Summary of segments by a grouping column.
- `pub struct DriftQualitySummary { latest_missing_rate, latest_completeness_delta, latest_zero_rate, flatline, low_sample_warning, issues }` — Quality summary for one column.
- `pub struct DriftQualitySection { by_column: BTreeMap<String, DriftQualitySummary> }` — Grouped quality section.
- `pub struct DriftRelationshipSection { mode, pairs }` — Relationship analysis section.
- `pub struct DriftInvestigationResponse { overview, columns, rankings, segments?, quality?, relationships? }` — Full investigation response with optional segment/quality/relationship sections.

### Private Helpers
- `fn ks_pvalue_asymptotic(z: f64) -> f64` — Asymptotic KS p-value computation via series expansion.
- `fn normalized_histogram_props(data, edges) -> Vec<f64>` — Normalized histogram proportions with epsilon floor.
- `fn compute_quantiles_sorted(sorted, qs) -> Vec<f64>` — Quantile extraction from sorted slice at given fractions (0.0–1.0).
- `fn histogram_from_edges(data, edges) -> Vec<u64>` — Histogram count array using binary search for bin assignment.
- `fn ecdf_downsampled(sorted, max_pts) -> (Vec<f64>, Vec<f64>)` — Downsampled ECDF with at most `max_pts` points.
- `fn build_distribution_stats(values, all_values_including_nulls, start_ms, end_ms, label, hist_edges) -> WindowDistributionStats` — Builds distribution stats from raw values and null count.
- `fn format_timestamp(ms) -> String`, `fn format_time_only(ms) -> String`, `fn same_utc_day(start_ms, end_ms) -> bool`, `fn format_range_full(start_ms, end_ms) -> String` — Timestamp formatting helpers.

[deps: [extract_f64_column_opt][1], [extract_ts_epoch_ms][2]]

---
[1]: mod.md#extract_f64_column_opt
[2]: mod.md#extract_ts_epoch_ms