# ai/frontend/src/drift/driftPage.md
> Temporal distribution and drift analysis page that orchestrates ECharts rendering, drift fetches, and detail/timeline views while delegating runtime and formatting helpers.

## Types (imported from ./types.ts and ./viewModels.ts)
- `WindowDistributionStats` — `{ start_ms: number; end_ms: number; label: string; count: number; null_count: number; completeness: number; mean: number; std: number; min: number; max: number; quantiles: number[]; hist_bins: number[]; hist_counts: number[]; ecdf_x: number[]; ecdf_y: number[] }`
- `DriftWindowStats extends WindowDistributionStats` — adds `{ ks_stat: number; ks_pvalue: number; es_stat: number; es_pvalue: number; wasserstein: number; psi: number; drift_level: 'green' | 'yellow' | 'red'; low_sample_warning: boolean }`
- `DriftResponse` — `{ column: string; reference: WindowDistributionStats; windows: DriftWindowStats[]; thresholds: { ks_threshold: number; wasserstein_threshold: number; psi_minor_threshold: number; psi_major_threshold: number }; metadata?: { computation_time_ms: number; num_windows: number; reference_samples: number; bin_count_warning?: boolean; effective_bins?: number; psi_sample_ratio_warning?: boolean; avg_window_samples?: number } }`
- `EChartLike` — partial ECharts interface (`setOption`, `clear`, `resize`, `on`, `showLoading`, `hideLoading`, `dispatchAction`, `getDataURL`) [deps: [types][1]]

## Module-level State
- `driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null` — page lifecycle handle
- `driftPageCleanup: (() => void) | null` — mount cleanup handle

## Functions
- `_setEchartsModule(m: typeof import('echarts') | null): void` — test isolation hook to reset the ECharts module cache [deps: [_setEchartsModule][2]]
- `initDriftPage(metadata: any): Promise<void>` [deps: [createRequestTask][3], [bindDriftControls][4], [getEChartsModule][2], [syncDriftEmptyState][2]]
  - Initialises the drift page, owns chart/render orchestration, and composes runtime and view-model helpers.

---
[1]: ./types.md
[2]: ./runtime.md
[3]: ../pages/shared/requestTask.md#createRequestTask
[4]: ./controls.md#bindDriftControls
