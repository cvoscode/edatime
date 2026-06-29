# crates/edatime-service/src/analytics/drift.rs
> Temporal drift analysis — KS test, Wasserstein-1 distance, PSI, Epps-Singleton, Jensen-Shannon divergence. Also provides multi-column drift investigation with ranking and segmentation.

## Structs (Distribution Stats)
- `WindowDistributionStats { start_ms, end_ms, label, count, null_count, completeness, mean, std, min, max, quantiles: f64[], hist_bins: f64[], hist_counts: u64[], ecdf_x: f64[], ecdf_y: f64[] }` — Per-window distribution summary with ECDF and histogram.
- `DriftWindowStats extends WindowDistributionStats { ks_stat, ks_pvalue, es_stat, es_pvalue, wasserstein, psi, jensen_shannon, drift_level: 'green'|'yellow'|'red', trigger_reasons: string[], completeness_delta, low_sample_warning }` — Per-window drift metrics with classification.
- `DriftThresholds { ks_threshold, wasserstein_threshold, psi_minor_threshold, psi_major_threshold }` — Classification thresholds.
- `DriftMetadata { computation_time_ms, num_windows, reference_samples, bin_count_warning, effective_bins, psi_sample_ratio_warning, avg_window_samples }` — Computation diagnostics.
- `DriftResponse { column, reference: WindowDistributionStats, windows: DriftWindowStats[], thresholds, metadata? }` — Single-column drift result.

## Structs (Investigation)
- `DriftInvestigationOverview { driftScore, worstLevel, columnsFlagged, totalColumns, windowsFlagged, firstChangePoint }` — Aggregate drift severity summary.
- `DriftFeatureRank { column, driftScore, latestLevel, flaggedWindows, firstChangePoint }` — Per-column ranking entry.
- `DriftSegmentRank { segmentValue, driftScore, columnsFlagged, sampleCount }` — Per-segment ranking entry.
- `DriftChangePointRank { column, label, isoTime, driftScore, triggerReasons: string[] }` — Change-point ranking entry.
- `DriftQualityIssueRank { column, issue, label, driftScore }` — Quality issue ranking entry.
- `DriftRelationshipRank { leftColumn, rightColumn, reference, comparison, delta, alignedReferenceSamples, alignedComparisonSamples }` — Distributional relationship change between two columns.
- `DriftRankingSummary { features: DriftFeatureRank[], segments: DriftSegmentRank[], changePoints: DriftChangePointRank[], qualityIssues: DriftQualityIssueRank[], relationships: DriftRelationshipRank[] }` — Aggregated ranking container.
- `DriftSegmentGroup { value, sampleCount, overview: DriftInvestigationOverview, featureRanks: DriftFeatureRank[] }` — Segment with its own investigation overview and rankings.
- `DriftQualitySummary { latestMissingRate, latestCompletenessDelta, latestZeroRate, flatline, lowSampleWarning, issues: string[] }` — Quality metrics for a single column.

## Structs (Investigation Response)
- `DriftInvestigationResponse { overview: DriftInvestigationOverview, columns: Record<string, DriftResponse>, rankings: DriftRankingSummary, segments?: { segmentBy, groups: DriftSegmentGroup[] }, quality?: { byColumn: Record<string, DriftQualitySummary> }, relationships?: { mode, pairs: DriftRelationshipRank[] } }` — Full multi-column drift investigation result.

## Functions (Statistical)
- `pub fn ks_test_2sample(a: &[f64], b: &[f64]) -> (f64, f64)` [deps: [ks_pvalue_asymptotic][1]]
  - Two-sample Kolmogorov-Smirnov test. Both slices must be pre-sorted. Returns (D statistic, p-value).
- `pub fn wasserstein_distance_1d(a: &[f64], b: &[f64]) -> f64` [deps: []]
  - 1D Wasserstein-1 distance (Earth Mover's Distance). Both slices must be pre-sorted.
- `pub fn compute_psi(reference: &[f64], current: &[f64], n_bins: usize) -> f64` [deps: [psi_ref_props_from_sorted][2]]
  - Population Stability Index using reference-quantile-based binning.
- `pub fn psi_ref_props_from_sorted(ref_sorted: &[f64], edges: &[f64]) -> f64[]` [deps: [histogram_from_edges][3]]
  - Pre-compute reference bin proportions from sorted data and edges.
- `pub fn compute_psi_with_ref_props(ref_props: &[f64], current: &[f64], edges: &[f64]) -> f64`
  - PSI using pre-computed reference proportions (avoids re-binning reference).
- `pub fn jensen_shannon_divergence_with_ref_props(ref_props: &[f64], current: &[f64], edges: &[f64]) -> f64` [deps: [normalized_histogram_props][3]]
  - Jensen-Shannon divergence using pre-computed reference proportions.

## Functions (Classification)
- `pub fn classify_drift_window(psi, wasserstein, ks_pvalue, es_pvalue, thresholds) -> ('green'|'yellow'|'red', string[])` [deps: []]
  - Classifies a single window's drift level based on aggregated score from PSI/Wasserstein/KS/Epps-Singleton signals.
- `pub fn format_window_label(start_ms, end_ms, window_ms: i64) -> string` [deps: [format_timestamp][3], [same_utc_day][3]]
  - Formats a time-window label; uses hour-only for same-day hourly windows.

## Functions (Core Analysis)
- `pub fn compute_temporal_drift(df: &DataFrame, column: &str, window_ms: i64, ref_start_ms, ref_end_ms, curr_start_ms, curr_end_ms, n_bins, ks_pvalue_threshold, es_pvalue_threshold, wasserstein_threshold, psi_minor, psi_major) -> Result<DriftResponse, AppError>` [deps: [extract_f64_column_opt][shared], [extract_ts_epoch_ms][shared], [classify_drift_window][above]]
  - Computes per-window drift for a single column. Returns `Err` if reference has <5 samples.
- `pub fn compute_drift_investigation(df: &DataFrame, columns: string[], window_ms: i64, ref_start_ms, ref_end_ms, curr_start_ms, curr_end_ms, n_bins, thresholds, segment_column?: string, relationship_mode?: string) -> Result<DriftInvestigationResponse, AppError>` [deps: [compute_temporal_drift][above], [classify_drift_window][above]]
  - Multi-column drift investigation with feature ranking, optional segmentation, and optional distributional relationship analysis.

---
[1]: #ks_test_2sample
[2]: #psi_ref_props_from_sorted
[3]: #internal-helpers
