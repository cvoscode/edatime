# ai/frontend/src/drift/driftPage.md
> Temporal distribution and drift analysis page with ECharts timeline box summaries and interactive detail views.

## Types
- `WindowDistributionStats` — `{ start_ms: number; end_ms: number; label: string; count: number; null_count: number; completeness: number; mean: number; std: number; min: number; max: number; quantiles: number[]; hist_bins: number[]; hist_counts: number[]; ecdf_x: number[]; ecdf_y: number[] }`
- `DriftWindowStats extends WindowDistributionStats` — adds `{ ks_stat: number; ks_pvalue: number; es_stat: number; es_pvalue: number; wasserstein: number; psi: number; drift_level: 'green' | 'yellow' | 'red'; low_sample_warning: boolean }`
- `DriftResponse` — `{ column: string; reference: WindowDistributionStats; windows: DriftWindowStats[]; thresholds: { ks_threshold: number; wasserstein_threshold: number; psi_minor_threshold: number; psi_major_threshold: number }; metadata?: { computation_time_ms: number; num_windows: number; reference_samples: number; bin_count_warning?: boolean; effective_bins?: number; psi_sample_ratio_warning?: boolean; avg_window_samples?: number } }`
- `EChartLike` — partial ECharts interface (`setOption`, `clear`, `resize`, `on`, `showLoading`, `hideLoading`, `dispatchAction`, `getDataURL`)

## Module-level State
- `driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null` — page lifecycle handle
- `driftPageCleanup: (() => void) | null`
- `_syncDriftEmptyState: (show: boolean, message?: string) => void` — external empty-state sync wrapper
- `_echartsModule: typeof import('echarts') | null` — Cached ECharts import to avoid re-importing on every page visit (issue #3)

## Functions
- `syncDriftEmptyState(show: boolean, message?: string): void` — external empty-state sync wrapper
- `_setEchartsModule(m: typeof import('echarts') | null): void` — test isolation hook to reset the ECharts module cache
- `getECharts(): Promise<typeof import('echarts')>` — returns cached ECharts module, loading it on first call
- `timelineTooltipFormatter(params: any): string` — module-level tooltip formatter to avoid per-render closure creation (issue #10)
- `driftColor(level: string): string` — returns COLOR_GREEN / COLOR_YELLOW / COLOR_RED
- `formatValue(v: number): string` — formats numbers with SI suffixes (k/M) and appropriate precision
- `toDatetimeLocal(ms: number): string` — converts epoch ms to `YYYY-MM-DDTHH:MM`
- `hashColor(text: string, fallbackIndex: number): string` — deterministic palette color from column name
- `normalizeDensity(stats: WindowDistributionStats): Array<[number, number]>` — converts histogram to density points
- `initDriftPage(metadata: any): Promise<void>` [deps: [fetchDriftStats][1], [bindDriftControls][2], [exportEChartsPNG][3], [createAnalysisPageRuntime][4]]
  - Initialises the drift page: column picker, window/plot type controls, reference preset, compute button, timeline chart, detail chart, resize observer, and page-change listener.

---
[1]: ../services/api/index.md#fetchDriftStats
[2]: ./controls.md#bindDriftControls
[3]: ../../utils/chartExport.md#exportEChartsPNG
[4]: ../../pages/shared/analysisPageRuntime.md#createAnalysisPageRuntime
