# frontend/src/drift/viewModels.ts
> Pure drift formatting and view-model helpers for chart colors, status summaries, tooltips, detail rows, ECharts option building, and multi-column investigation response types.

## Constants
- `COLOR_GREEN: string` — Green severity color (`'#00C896'`).
- `COLOR_YELLOW: string` — Yellow severity color (`'#FFC041'`).
- `COLOR_RED: string` — Red severity color (`'#FF6B6B'`).
- `COLUMN_PALETTE: string[]` — Per-column palette colors.
- `COLOR_REF_FALLBACK: string`, `COLOR_TEXT_FALLBACK: string`, `COLOR_TEXT_DIM_FALLBACK: string`, `COLOR_DIM_FALLBACK: string` — Backwards-compatible fallbacks for theme-resolved helpers.

## Theme-resolved color functions (read active data-theme palette)
- `COLOR_REF(): string`, `TOOLTIP_BG(): string`, `DRIFT_TEXT(): string`, `DRIFT_TEXT_DIM(): string`, `DRIFT_DIM(): string`
  - Return current-palette colors; fall back to `_FALLBACK` constants.

## Interfaces (Distribution Stats — mirror of Rust types)
### `WindowDistributionStats`
- `start_ms: number`, `end_ms: number`, `label: string`, `count: number`, `null_count: number`, `completeness: number`, `mean: number`, `std: number`, `min: number`, `max: number`, `quantiles: number[]`, `hist_bins: number[]`, `hist_counts: number[]`, `ecdf_x: number[]`, `ecdf_y: number[]`

### `DriftWindowStats extends WindowDistributionStats`
- `ks_stat, ks_pvalue, es_stat, es_pvalue, wasserstein, psi, jensen_shannon: number` — drift metrics.
- `drift_level: 'green' | 'yellow' | 'red'`, `trigger_reasons: string[]`, `completeness_delta: number`, `low_sample_warning: boolean`.

### `DriftResponse`
- `column: string`, `reference: WindowDistributionStats`, `windows: DriftWindowStats[]`
- `thresholds: { ks_pvalue_threshold, es_pvalue_threshold, wasserstein_threshold, psi_minor_threshold, psi_major_threshold: number }`
- `metadata?: { computation_time_ms, num_windows, reference_samples: number; bin_count_warning?, effective_bins?, psi_sample_ratio_warning?, avg_window_samples? }`

## Interfaces (Investigation — new in refactor)
### `DriftInvestigationOverview` [new]
- `driftScore: number`, `worstLevel: DriftWindowStats['drift_level']`, `columnsFlagged, totalColumns, windowsFlagged: number`, `firstChangePoint: string | null`.

### `DriftFeatureRank` [new]
- `column: string`, `driftScore: number`, `latestLevel: DriftWindowStats['drift_level']`, `flaggedWindows: number`, `firstChangePoint: string | null`.

### `DriftSegmentRank` [new]
- `segmentValue: string`, `driftScore: number`, `columnsFlagged: number`, `sampleCount: number`.

### `DriftChangePointRank` [new]
- `column: string`, `label: string`, `isoTime: string`, `driftScore: number`, `triggerReasons: string[]`.

### `DriftQualityIssueRank` [new]
- `column: string`, `issue: string`, `label: string`, `driftScore: number`.

### `DriftRelationshipRank` [new]
- `leftColumn, rightColumn: string`, `reference, comparison, delta: number`, `alignedReferenceSamples, alignedComparisonSamples: number`.

### `DriftSegmentGroup` [new]
- `value: string`, `sampleCount: number`, `overview: DriftInvestigationOverview`, `featureRanks: DriftFeatureRank[]`.

### `DriftQualitySummary` [new]
- `latestMissingRate, latestCompletenessDelta, latestZeroRate: number`, `flatline: boolean`, `lowSampleWarning: boolean`, `issues: string[]`.

### `DriftInvestigationResponse` [new]
- `overview: DriftInvestigationOverview`, `columns: Record<string, DriftResponse>`, `rankings: { features, segments, changePoints, qualityIssues, relationships }`, `segments?: { segmentBy, groups }, quality?: { byColumn }, relationships?: { mode, pairs }`.

## Interfaces (Summary helpers — new)
### `ColumnDriftSummary` [new]
- `column, latestLabel: string`, `currentLevel, worstLevel: DriftWindowStats['drift_level']`, `flaggedWindows, totalWindows: number`, `strongestReasons: string[]`, `latestMetrics: { psi, wasserstein, ksPvalue, esPvalue }`.

### `GlobalDriftSummary` [new]
- `anyDrift: boolean`, `columnsFlagged, totalColumns: number`, `latestSeverity, worstSeverity: DriftWindowStats['drift_level']`.

## Type aliases
- `DriftEvaluationMode = 'all' | 'latest' | 'latest-n'` — Window filtering mode.

## Option contexts
### `TimelineOptionContext`
- `responsesByColumn: Map<string, DriftResponse>`, `activeDetailColumn: string | null`, `selectedWindowIdx: number | null`.

### `DetailOptionContext`
- `responsesByColumn: Map<string, DriftResponse>`, `activeDetailColumn: string | null`, `selectedWindowIdx: number | null`, `plotType: string`.

## Interfaces (UI)
### `DetailStatRow` [new]
- `label: string`, `value: string`, `className?: string`.

## Functions — Formatters
- `driftColor(level: string): string` — Maps drift severity to palette color.
- `formatValue(v: number): string` — Compact numeric formatting.
- `toDatetimeLocal(ms: number): string` — Epoch ms → `YYYY-MM-DDTHH:MM`.
- `hashColor(text: string, fallbackIndex: number): string` — Deterministic palette color from text.
- `normalizeDensity(stats: WindowDistributionStats): Array<[number, number]>` — Histogram → normalized density points.
- `severityScore(level: DriftWindowStats['drift_level']): number` — Sortable numeric score for severity.
- `formatTriggerReason(reason: string): string` — Formats single trigger reason key to display text.
- `formatTriggerReasons(reasons: string[] | null | undefined): string` — Joins formatted trigger reasons.

## Functions — Analysis helpers [new]
- `filterResponseForEvaluation(response: DriftResponse, mode: DriftEvaluationMode, latestCount?: number): DriftResponse` — Filters window array by evaluation mode.
- `buildColumnSummary(response: DriftResponse): ColumnDriftSummary` — Aggregates per-column drift summary.
- `buildGlobalSummary(responsesByColumn: Map<string, DriftResponse>): GlobalDriftSummary` — Computes global drift severity across all columns.
- `sortedWindowIndices(response: DriftResponse, windowSort: string): number[]` — Window indices sorted by time/PSI/Wasserstein/severity.

## Functions — Status
- `statusSummary(responsesByColumn: Map<string, DriftResponse>, failedColumns?: string[]): { text, windowsTotal, flaggedTotal, refSamples, computeMs, psiWarning, binWarning }` — Builds drift status summary with warning flags.

## Functions — ECharts option builders
- `timelineTooltipFormatter(params: any): string` — Tooltip HTML formatter for timeline boxplot.
- `buildTimelineOption(ctx: TimelineOptionContext): Record<string, unknown>` — Drift timeline (multi-column boxplot) ECharts option.
- `buildDetailOption(ctx: DetailOptionContext): Record<string, unknown>` — Detail view ECharts option supporting histogram/ecdf/violin/boxplot plot types.

## Functions — UI builders
- `buildDetailStatRows(win: DriftWindowStats | null): DetailStatRow[]` — Statistics rows for active window detail panel.
- `buildWindowListHtml(response: DriftResponse, selectedWindowIdx: number | null, orderedIdxs: number[]): { html: string; selectedIdx: number | null }` — Window list HTML with selection state.

## Dependencies (imports)
- `import type { EChartLike } from './types.js'` [deps: []]
- `getChartPalette, getPaletteColor from '../utils/theme.js'` [deps: []]
