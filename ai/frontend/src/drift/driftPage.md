# frontend/src/drift/driftPage.ts
> Temporal distribution and drift analysis page using ECharts for timeline and detail views. Owns chart/render orchestration, delegates to controls, runtime, view-model helpers, and supports multi-column investigation via `POST /api/drift/investigate`.

## Types (imported from ./viewModels.ts)
- `WindowDistributionStats` — `{ start_ms: number; end_ms: number; label: string; count: number; null_count: number; completeness: number; mean: number; std: number; min: number; max: number; quantiles: number[]; hist_bins: number[]; hist_counts: number[]; ecdf_x: number[]; ecdf_y: number[] }`
- `DriftWindowStats extends WindowDistributionStats` — adds `{ ks_stat, ks_pvalue, es_stat, es_pvalue, wasserstein, psi, jensen_shannon: number; drift_level: 'green' | 'yellow' | 'red'; trigger_reasons: string[]; completeness_delta: number; low_sample_warning: boolean }`
- `DriftResponse` — `{ column: string; reference: WindowDistributionStats; windows: DriftWindowStats[]; thresholds: { ks_pvalue_threshold, es_pvalue_threshold, wasserstein_threshold, psi_minor_threshold, psi_major_threshold: number }; metadata?: { computation_time_ms, num_windows, reference_samples, bin_count_warning?, effective_bins?, psi_sample_ratio_warning?, avg_window_samples? } }`
- `DriftInvestigationResponse` [from ./viewModels.ts] — `{ overview, columns: Record<string, DriftResponse>, rankings: { features, segments, changePoints, qualityIssues, relationships }, segments?, quality?, relationships? }`
- `DriftEvaluationMode = 'all' | 'latest' | 'latest-n'` — window filtering mode [from ./viewModels.ts]
- `EChartLike` — partial ECharts interface (`setOption`, `clear`, `resize`, `on`, `showLoading`, `hideLoading`, `dispatchAction`, `getDataURL`)

## Module-level State
- `driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null` — page lifecycle handle
- `driftPageCleanup: (() => void) | null` — mount cleanup handle

## Functions

### initDriftPage [new]
- `initDriftPage(metadata: any): Promise<void>` [deps: [createRequestTask][2], [createAnalysisPageRuntime][3], [bindDriftControls][4], [fetchDriftStats][5], [fetchDriftInvestigation][5]]
  - Initialises drift page: binds controls, sets up chart resize observer, registers with `createAnalysisPageRuntime`, and schedules initial chart refresh.
  - Uses `createRequestTask` for abortable compute requests (cancel-before-new semantics).
  - Supports both single-column stats (`/api/drift/stats`) and multi-column investigation (`/api/drift/investigate`).
  - Uses `createAnalysisPageRuntime` for page lifecycle management (mount, onEveryPageChange, bindExports for CSV/JSON/PNG export).

## Dependencies (imports)
- From `./viewModels.ts`: all type interfaces, formatters, ECharts option builders [deps: []]
- From `./runtime.ts`: createDriftComputeTask, export helpers [deps: []]
- From `./controls.ts`: bindDriftControls [deps: []]
- From `../services/api/upload.ts`: fetchDriftStats, fetchDriftInvestigation [deps: []]

---
[2]: ../pages/shared/requestTask.md#createRequestTask
[3]: ../pages/shared/analysisPageRuntime.md#createAnalysisPageRuntime
[4]: ./controls.md#bindDriftControls
[5]: ../services/api/upload.md
