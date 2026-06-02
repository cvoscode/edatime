# ai/frontend/src/drift/driftPage.md
> Temporal distribution and drift analysis page using ECharts for timeline and detail views. Owns chart/render orchestration, delegates to controls, runtime, and view-model helpers.

## Types (imported from ./types.ts and ./viewModels.ts)
- `WindowDistributionStats` — `{ start_ms: number; end_ms: number; label: string; count: number; null_count: number; completeness: number; mean: number; std: number; min: number; max: number; quantiles: number[]; hist_bins: number[]; hist_counts: number[]; ecdf_x: number[]; ecdf_y: number[] }`
- `DriftWindowStats extends WindowDistributionStats` — adds `{ ks_stat: number; ks_pvalue: number; es_stat: number; es_pvalue: number; wasserstein: number; psi: number; drift_level: 'green' | 'yellow' | 'red'; low_sample_warning: boolean }`
- `DriftResponse` — `{ column: string; reference: WindowDistributionStats; windows: DriftWindowStats[]; thresholds: { ks_threshold: number; wasserstein_threshold: number; psi_minor_threshold: number; psi_major_threshold: number }; metadata?: { computation_time_ms: number; num_windows: number; reference_samples: number; bin_count_warning?: boolean; effective_bins?: number; psi_sample_ratio_warning?: boolean; avg_window_samples?: number } }`
- `EChartLike` — partial ECharts interface (`setOption`, `clear`, `resize`, `on`, `showLoading`, `hideLoading`, `dispatchAction`, `getDataURL`) [deps: [EChartLike][1]]

## Module-level State
- `driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null` — page lifecycle handle
- `driftPageCleanup: (() => void) | null` — mount cleanup handle

## Functions

### _setEchartsModule
- `_setEchartsModule(m: typeof import('echarts') | null): void`
  - Test isolation hook to reset the ECharts module cache.

### initDriftPage
- `initDriftPage(metadata: any): Promise<void>` [deps: [createRequestTask][2], [createAnalysisPageRuntime][3], [bindDriftControls][4], [fetchDriftStats][5]]
  - Initialises drift page: binds controls, sets up chart resize observer, registers with `createAnalysisPageRuntime`, and schedules initial chart refresh.
  - Uses `createRequestTask` for abortable compute requests (cancel-before-new semantics).
  - Uses `createAnalysisPageRuntime` for page lifecycle management (mount, onEveryPageChange, bindExports for CSV/JSON export).

---
[1]: ./types.md#EChartLike
[2]: ../pages/shared/requestTask.md#createRequestTask
[3]: ../pages/shared/analysisPageRuntime.md#createAnalysisPageRuntime
[4]: ./controls.md#bindDriftControls
[5]: ../services/api/index.md#fetchDriftStats