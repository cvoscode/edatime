# ai/frontend/src/drift/driftPage.md
> Temporal distribution and drift analysis page with ECharts timeline box summaries and interactive detail views.

## Types
- `WindowDistributionStats` — `{ start_ms: number; end_ms: number; label: string; count: number; null_count: number; completeness: number; mean: number; std: number; min: number; max: number; quantiles: number[]; hist_bins: number[]; hist_counts: number[]; ecdf_x: number[]; ecdf_y: number[] }`
- `DriftWindowStats extends WindowDistributionStats` — adds `{ ks_stat: number; ks_pvalue: number; es_stat: number; es_pvalue: number; wasserstein: number; psi: number; drift_level: 'green' | 'yellow' | 'red'; low_sample_warning: boolean }`
- `DriftResponse` — `{ column: string; reference: WindowDistributionStats; windows: DriftWindowStats[]; thresholds: { ks_threshold: number; wasserstein_threshold: number; psi_minor_threshold: number; psi_major_threshold: number }; metadata?: { computation_time_ms: number; num_windows: number; reference_samples: number; bin_count_warning?: boolean; effective_bins?: number; psi_sample_ratio_warning?: boolean; avg_window_samples?: number } }`
- `EChartLike` — partial ECharts interface (`setOption`, `clear`, `resize`, `on`, `showLoading`, `hideLoading`, `dispatchAction`, `getDataURL`)

## Functions
- `initDriftPage(metadata: any): Promise<void>` — Initialises the drift page: column picker, window/plot type controls, reference preset, compute button, timeline chart, and detail chart.
- `_setEchartsModule(m: typeof import('echarts') | null): void` — Test isolation hook to reset the ECharts module cache.

## Module-level State
- `_echartsModule: typeof import('echarts') | null` — Cached ECharts import to avoid re-importing on every page visit.

---
[1]: ../services/api/index.md#fetchDriftStats
[2]: ../utils/chartExport.md#exportEChartsPNG
