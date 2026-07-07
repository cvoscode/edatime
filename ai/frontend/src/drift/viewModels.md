# ai/frontend/src/drift/viewModels.md
> Drift view-model types plus timeline/detail/window-list formatting helpers.

## Interfaces and types
- `WindowDistributionStats`
- `DriftWindowStats extends WindowDistributionStats`
- `DriftResponse`
- `DriftEvaluationMode = 'all' | 'latest' | 'latest-n'`
- `DriftInvestigationOverview`
- `DriftFeatureRank`
- `DriftSegmentRank`
- `DriftChangePointRank`
- `DriftQualityIssueRank`
- `DriftRelationshipRank`
- `DriftSegmentGroup`
- `DriftQualitySummary`
- `DriftInvestigationResponse`
- `ColumnDriftSummary`
- `GlobalDriftSummary`
- `TimelineOptionContext`
- `DetailOptionContext`
- `DetailStatRow`

## Functions
- `COLOR_REF(): string`
- `TOOLTIP_BG(): string`
- `DRIFT_TEXT(): string`
- `DRIFT_TEXT_DIM(): string`
- `DRIFT_DIM(): string`
- `driftColor(level: string): string`
- `formatValue(v: number): string`
- `toDatetimeLocal(ms: number): string`
- `hashColor(text: string, fallbackIndex: number): string`
- `normalizeDensity(stats: WindowDistributionStats): Array<[number, number]>`
- `severityScore(level: DriftWindowStats['drift_level']): number`
- `formatTriggerReason(reason: string): string`
- `formatTriggerReasons(reasons: string[] | null | undefined): string`
- `filterResponseForEvaluation(response: DriftResponse, mode: DriftEvaluationMode, latestN?: number): DriftResponse`
- `buildColumnSummary(response: DriftResponse): ColumnDriftSummary`
- `buildGlobalSummary(responsesByColumn: Map<string, DriftResponse>): GlobalDriftSummary`
- `sortedWindowIndices(response: DriftResponse): number[]`
- `statusSummary(responsesByColumn: Map<string, DriftResponse>, failedColumns?: string[]): { totalColumns: number; failedColumns: number; flaggedColumns: number; windowsTotal: number; flaggedTotal: number }`
- `buildTimelineOption(ctx: TimelineOptionContext): Record<string, unknown>`
  - Compacts same-day labels down to the start date and labels the Y axis as `Drift score`.
- `buildDetailOption(ctx: DetailOptionContext): Record<string, unknown>`
- `buildDetailStatRows(win: DriftWindowStats | null): DetailStatRow[]`
- `buildWindowListHtml(windows: DriftWindowStats[], selectedIdx: number | null, selectedColumn: string | null): string`
  - Uses compact `Day N · YYYY-MM-DD` labels for same-day windows.
