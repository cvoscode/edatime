# ai/frontend/src/drift/viewModels.md
> Pure drift formatting and view-model helpers for chart colors, status summaries, tooltips, detail rows, and ECharts option building.

## Constants
- `COLOR_GREEN: string`
- `COLOR_YELLOW: string`
- `COLOR_RED: string`
- `COLOR_DIM: string`
- `COLOR_REF: string`
- `COLOR_TEXT: string`
- `COLOR_TEXT_DIM: string`
- `COLUMN_PALETTE: string[]`

## Interface: WindowDistributionStats
- `start_ms: number`
- `end_ms: number`
- `label: string`
- `count: number`
- `null_count: number`
- `completeness: number`
- `mean: number`
- `std: number`
- `min: number`
- `max: number`
- `quantiles: number[]`
- `hist_bins: number[]`
- `hist_counts: number[]`
- `ecdf_x: number[]`
- `ecdf_y: number[]`

## Interface: DriftWindowStats
- `ks_stat: number`
- `ks_pvalue: number`
- `es_stat: number`
- `es_pvalue: number`
- `wasserstein: number`
- `psi: number`
- `drift_level: 'green' | 'yellow' | 'red'`
- `low_sample_warning: boolean`

## Interface: DriftResponse
- `column: string`
- `reference: WindowDistributionStats`
- `windows: DriftWindowStats[]`
- `thresholds: { ks_threshold: number; wasserstein_threshold: number; psi_minor_threshold: number; psi_major_threshold: number }`
- `metadata?: { computation_time_ms: number; num_windows: number; reference_samples: number; bin_count_warning?: boolean; effective_bins?: number; psi_sample_ratio_warning?: boolean; avg_window_samples?: number }`

## Interface: TimelineOptionContext
- `responsesByColumn: Map<string, DriftResponse>`
- `activeDetailColumn: string | null`
- `selectedWindowIdx: number | null`

## Interface: DetailOptionContext
- `response: DriftResponse | null`
- `activeDetailColumn: string | null`
- `selectedWindowIdx: number | null`
- `plotType: string`

## Interface: DetailStatRow
- `label: string`
- `value: string`
- `tone?: 'good' | 'warn' | 'bad' | 'muted'`

## Functions
- `driftColor(level: string): string`
  - Maps drift severity to its palette color.
- `formatValue(v: number): string`
  - Formats numeric drift metrics with compact precision rules.
- `toDatetimeLocal(ms: number): string`
  - Converts epoch milliseconds to `YYYY-MM-DDTHH:MM`.
- `hashColor(text: string, fallbackIndex: number): string`
  - Picks a deterministic palette color from text.
- `normalizeDensity(stats: WindowDistributionStats): Array<[number, number]>`
  - Converts histogram bins/counts into normalized density points.
- `severityScore(level: DriftWindowStats['drift_level']): number`
  - Converts drift severity to a sortable numeric score.
- `sortedWindowIndices(response: DriftResponse, windowSort: string): number[]`
  - Returns window indices sorted by the requested drift sort mode.
- `statusSummary(responsesByColumn: Map<string, DriftResponse>, failedColumns?: string[]): { text: string; windowsTotal: number; flaggedTotal: number; refSamples: number; computeMs: number; psiWarning: boolean; binWarning: boolean }`
  - Builds the drift status summary and warning flags.
- `timelineTooltipFormatter(params: any): string`
  - Formats ECharts tooltip HTML for drift timeline points.
- `buildTimelineOption(ctx: TimelineOptionContext): Record<string, unknown>`
  - Builds the drift timeline ECharts option object.
- `buildDetailOption(ctx: DetailOptionContext): Record<string, unknown>`
  - Builds the drift detail-view ECharts option object.
- `buildDetailStatRows(win: DriftWindowStats | null): DetailStatRow[]`
  - Returns the drift detail statistics rows for the active window.
- `buildWindowListHtml(response: DriftResponse | null, activeDetailColumn: string | null, selectedWindowIdx: number | null, windowSort: string): string`
  - Builds the drift window-list HTML fragment.
