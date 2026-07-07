# ai/frontend/src/services/api/analytics.md
> Frontend client for rolling-band, anomaly, FFT, spectrogram, causal, transform, correlation-matrix, outlier-removal, and spectral-filter endpoints.

## Interfaces
- `RollingBand`
  - `{ column: string; ts: number[]; mean: (number | null)[]; upper1: (number | null)[]; lower1: (number | null)[]; upper2: (number | null)[]; lower2: (number | null)[] }`
- `RollingResponse`
  - `{ bands: RollingBand[] }`
- `AnomalyRegion`
  - `{ column: string; method: string; start_ms: number; end_ms: number; score: number }`
- `SummaryStats`
  - `{ mean: number; std: number; min: number; max: number }`
- `AnomalyResponse`
  - `{ method: string; threshold: number; regions: AnomalyRegion[]; summary_stats?: SummaryStats | null }`
- `FrequencyPeak`
  - `{ frequency_hz: number; magnitude: number; power: number; rank: number }`
- `FftResult`
  - `{ column: string; frequencies: number[]; magnitudes: number[]; psd: number[]; sample_rate_hz: number; nyquist_hz: number; dominant_peaks: FrequencyPeak[] }`
- `FftResponse`
  - `{ sample_count: number; results: FftResult[] }`
- `SpectrogramResult`
  - `{ column: string; times_ms: number[]; frequencies: number[]; magnitudes: number[][] }`
- `SpectrogramResponse`
  - `{ sample_count: number; result: SpectrogramResult }`
- `SpectrogramScaleOptions`
  - `{ normalize?: string; clip?: string; clipParam?: number }`
- `CausalLink`
  - `{ source: string; target: string; lag: number; type: string; value: number; pvalue: number }`
- `CausalGraphResponse`
  - `{ columns: string[]; tau_max: number; links: CausalLink[]; graph: string[][][]; val_matrix: number[][][]; p_matrix: number[][][] }`
- `TransformResponse`
  - `{ status: string; column: string; expression: string }`
- `CorrelationMatrixResponse`
  - `{ columns: string[]; pearson?: (number | null)[][]; spearman?: (number | null)[][]; pearson_raw?: (number | null)[][]; spearman_raw?: (number | null)[][]; kendall_raw?: (number | null)[][]; pearson_diff?: (number | null)[][]; spearman_diff?: (number | null)[][]; kendall_diff?: (number | null)[][] }`
- `OutlierRemovalResult`
  - `{ method: string; columns: string[]; rows_before: number; rows_after: number; rows_removed: number }`
- `SpectralFilterResponse`
  - `{ column: string; ts: number[]; values: number[]; filter_type: string; low_hz?: number; high_hz?: number }`

## Functions
- `fetchRollingBands(start: string, end: string, columns: string, window?: number, signal?: AbortSignal): Promise<RollingResponse>`
- `fetchAnomalies(start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal): Promise<AnomalyResponse>`
- `fetchFft(start: string, end: string, columns: string, maxPoints?: number, signal?: AbortSignal): Promise<FftResponse>`
- `fetchSpectrogram(start: string, end: string, column: string, windowSize?: number, hopSize?: number, maxPoints?: number, signal?: AbortSignal, scaleOptions?: SpectrogramScaleOptions): Promise<SpectrogramResponse>`
- `fetchCausalGraph(columns: string[], tauMax?: number, alpha?: number, method?: string, maxPoints?: number, signal?: AbortSignal, pcAlpha?: number, test?: string, maxCondsDim?: number, fdrMethod?: string): Promise<CausalGraphResponse>`
- `postTransform(expression: string, outputName: string): Promise<TransformResponse>`
- `fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>`
- `postRemoveOutliers(columns: string[] | null, method?: string, threshold?: number, window?: number): Promise<OutlierRemovalResult>`
- `fetchSpectralFilter(params: URLSearchParams, signal?: AbortSignal): Promise<SpectralFilterResponse>`
