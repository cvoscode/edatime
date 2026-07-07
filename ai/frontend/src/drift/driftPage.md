# ai/frontend/src/drift/driftPage.md
> Drift analysis page that owns drift compute orchestration, chart rendering, empty states, and result/status summaries.

## Types
- `WindowDistributionStats`
- `DriftWindowStats`
- `DriftResponse`
- `DriftInvestigationResponse`
- `DriftEvaluationMode = 'all' | 'latest' | 'latest-n'`
- `EChartLike`

## Module-level state
- `driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`
- `driftPageCleanup: (() => void) | null`

## Functions
- `initDriftPage(metadata: any): Promise<void>`
  - Initializes drift controls, request orchestration, charts, page runtime, and exports.
  - Supports both `/api/drift/stats` and `/api/drift/investigate`.
  - Updates `#drift-status` through an idle/computed status path built from `statusSummary(...)`, and binds `onSelectionChange` so column-selection changes reset the page back to the idle prompt.
