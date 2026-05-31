# ai/frontend/src/services/api/analytics.md
> Analytics wrappers for rolling bands, anomaly detection, FFT, spectrogram, causal graph, transforms, correlation matrix, outlier removal, and spectral filtering.

## Interfaces
- `RollingBand { column: string; ts: number[]; mean: (number | null)[]; upper1: (number | null)[]; lower1: (number | null)[]; upper2: (number | null)[]; lower2: (number | null)[] }`
- `RollingResponse { bands: RollingBand[] }`
- `AnomalyRegion { column: string; method: string; start_ms: number; end_ms: number; score: number }`
- `AnomalyResponse { method: string; threshold: number; regions: AnomalyRegion[] }`
- `FftResult { column: string; frequencies: number[]; magnitudes: number[]; psd: number[] }`
- `FftResponse { sample_count: number; results: FftResult[] }`
- `SpectrogramResult { column: string; times_ms: number[]; frequencies: number[]; magnitudes: number[][] }`
- `SpectrogramResponse { sample_count: number; result: SpectrogramResult }`
- `CausalLink { source: string; target: string; lag: number; type: string; value: number; pvalue: number }`
- `CausalGraphResponse { columns: string[]; tau_max: number; links: CausalLink[]; graph: string[][][]; val_matrix: number[][][]; p_matrix: number[][][] }`
- `TransformResponse { status: string; column: string; expression: string }`
- `CorrelationMatrixResponse { columns: string[]; pearson: (number | null)[][]; spearman: (number | null)[][] }`
- `OutlierRemovalResult { method: string; columns: string[]; rows_before: number; rows_after: number; rows_removed: number }`
- `SpectralFilterResponse { column: string; ts: number[]; values: number[]; filter_type: string; low_hz?: number; high_hz?: number }`

## Functions
- `fetchRollingBands(start: string, end: string, columns: string, window?: number, signal?: AbortSignal): Promise<RollingResponse>`
  - Fetches rolling band statistics (mean, 1σ/2σ bounds) for specified columns over a time range. [deps: [http][1]]
- `fetchAnomalies(start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal): Promise<AnomalyResponse>`
  - Detects anomalous regions in the specified columns using configurable threshold methods. [deps: [http][1]]
- `fetchFft(start: string, end: string, columns: string, maxPoints?: number, signal?: AbortSignal): Promise<FftResponse>`
  - Computes FFT power spectral density for specified columns. [deps: [http][1]]
- `fetchSpectrogram(start: string, end: string, column: string, windowSize?: number, hopSize?: number, maxPoints?: number, signal?: AbortSignal): Promise<SpectrogramResponse>`
  - Computes STFT spectrogram for a single column. [deps: [http][1]]
- `fetchCausalGraph(columns: string[], tauMax?: number, alpha?: number, method?: string, maxPoints?: number, signal?: AbortSignal, pcAlpha?: number, test?: string, maxCondsDim?: number, fdrMethod?: string): Promise<CausalGraphResponse>`
  - Runs Tigramite PCMCI causal discovery on the selected columns. [deps: [http][1]]
- `postTransform(expression: string, outputName: string): Promise<TransformResponse>`
  - Applies a live expression transform and names the output column. [deps: [http][1]]
- `fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>`
  - Fetches Pearson and Spearman correlation matrices for all numeric columns. [deps: [http][1]]
- `postRemoveOutliers(columns: string[] | null, method?: string, threshold?: number, window?: number): Promise<OutlierRemovalResult>`
  - Removes outliers from specified columns using z-score or IQR methods. [deps: [http][1]]
- `fetchSpectralFilter(params: URLSearchParams, signal?: AbortSignal): Promise<SpectralFilterResponse>`
  - Applies a spectral filter (low/high/band-pass) to a column. [deps: [http][1]]

---
[1]: ./http.md