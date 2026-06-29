# ai/frontend/src/drift/viewModels.md
> View model types and HTML rendering utilities for the drift page — distribution stats, window rankings, timeline/detail options.

## Interfaces (mirror of Rust structs)
- `export interface WindowDistributionStats { start_ms, end_ms, label, count, null_count, completeness, mean, std, min, max, quantiles[], hist_bins[], hist_counts[], ecdf_x[], ecdf_y[] }` — Distribution statistics for a single window.
- `export interface DriftWindowStats extends WindowDistributionStats { ks_stat, ks_pvalue, es_stat, es_pvalue, wasserstein, psi, jensen_shannon, drift_level, trigger_reasons[], completeness_delta, low_sample_warning }` — Per-window drift metrics with level classification.
- `export interface DriftResponse { column, reference: WindowDistributionStats, windows: DriftWindowStats[], thresholds: DriftThresholds, metadata: DriftMetadata }` — Full response for a single-column drift analysis.
- `export type DriftEvaluationMode = 'all' | 'latest' | 'latest-n'` — Controls which windows are shown in the UI.
- `export interface DriftInvestigationOverview { drift_score, worst_level, columns_flagged, total_columns, windows_flagged, first_change_point? }` — Summary overview of investigation.
- `export interface DriftFeatureRank { column, drift_score, latest_level, flagged_windows, first_change_point? }`, `DriftSegmentRank { segment_value, drift_score, columns_flagged, sample_count }`, `DriftChangePointRank { column, label, iso_time, drift_score, trigger_reasons[] }`, `DriftQualityIssueRank { column, issue, label, drift_score }`, `DriftRelationshipRank { left_column, right_column, reference, comparison, delta, aligned_reference_samples, aligned_comparison_samples }` — Ranked drift findings.
- `export interface DriftSegmentGroup { value, sample_count, overview: DriftInvestigationOverview, feature_ranks[] }` — Segment group with overview and feature ranks.
- `export interface DriftQualitySummary { latest_missing_rate, latest_completeness_delta, latest_zero_rate, flatline, low_sample_warning, issues[] }`, `DriftRelationshipSection { mode, pairs[] }` — Quality/relationship sections.
- `export interface DriftInvestigationResponse { overview: DriftInvestigationOverview, columns: Record<string, DriftResponse>, rankings, segments?, quality?, relationships? }` — Full investigation response with optional sections.

## Helper Functions
- `export function COLOR_REF(): string`, `TOOLTIP_BG(): string`, `DRIFT_TEXT(): string`, `DRIFT_TEXT_DIM(): string`, `DRIFT_DIM(): string` — CSS color constants for drift UI theming.
- `export function driftColor(level): string` — Returns color hex for a drift level ("green"/"yellow"/"red").
- `export function formatValue(v: number): string` — Formats a numeric value with appropriate precision.
- `export function toDatetimeLocal(ms: number): string`, `formatToDatetimeLocal(ms)` [deps: [formatToDatetimeLocal][1]] — Converts epoch ms to HTML datetime-local string.
- `export function hashColor(text, fallbackIndex): string` — Deterministic color from text for segment visualization.
- `export function normalizeDensity(stats): Array<[number, number]>` — Normalizes ECDF data for rendering.
- `export function severityScore(level): number`, `formatTriggerReason(reason): string`, `formatTriggerReasons(reasons[]): string` — Severity and reason formatting utilities.
- `export function filterResponseForEvaluation(response, mode) -> DriftInvestigationResponse` — Filters investigation response based on evaluation mode (all/latest/latest-n).
- `export function buildColumnSummary(response): ColumnDriftSummary`, `buildGlobalSummary(responses[])` — Builds summary views for single column and global overview.
- `export function sortedWindowIndices(response) -> number[]` — Returns window indices sorted by drift severity.
- `export function statusSummary(status, columnsFlagged, windowsFlagged) -> string` — Formats a status string from investigation results.

## Timeline/Detail Rendering
- `interface TimelineOptionContext { response, column, evaluationMode }`, `DetailOptionContext { win: DriftWindowStats | null, column }` [deps: [DriftWindowStats][2], [DriftResponse][3]] — Context objects for chart option builders.
- `export function buildTimelineOption(ctx): Record<string, unknown>` — Builds ECharts timeline option with window distribution charts and drift level indicators.
- `export function buildDetailOption(ctx): Record<string, unknown>` — Builds ECharts detail view option (histogram + ECDF) for a single window.

## Detail Stats & HTML Rendering
- `interface DetailStatRow { label, value, color? }` [deps: [DriftWindowStats][2]] — One row of drift stats table.
- `export function buildDetailStatRows(win): DetailStatRow[]` — Builds stat rows from a single window's metrics.
- `export function buildWindowListHtml(windows[], selectedId, onToggle) -> string` — Renders the window list sidebar HTML with click handlers.

---
[1]: ../utils/format.ts#formatToDatetimeLocal
[2]: #DriftWindowStats
[3]: #DriftResponse