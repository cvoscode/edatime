# ai/frontend/src/services/api/analytics.md
> Frontend API client for analytics endpoints — rolling bands, anomaly detection, FFT, spectrogram, causal graph, transforms, outlier removal, spectral filtering.

## Interfaces (request/response shapes)
- `export interface RollingBand { ts[], mean[], upper1[], lower1[], upper2[], lower2[] }`, `RollingResponse { column, window_size, bands: RollingBand[] }` — Rolling band request/response.
- `export interface AnomalyRegion { start_ms, end_ms, score, severity }`, `AnomalyResponse { regions: AnomalyRegion[] }` — IQR/Z-score anomaly detection response.
- `export interface FrequencyPeak { frequency, power, amplitude }, FftResult { frequencies[], powers[], amplitudes[] }, FftResponse { column, result: FftResult }` — FFT computation response.
- `export interface SpectrogramResult { time[], freq[], power[] }, SpectrogramResponse { result: SpectrogramResult }`, `SpectrogramScaleOptions { scale?: 'log' | 'linear', filter_type?: string }` — STFT spectrogram request/response with optional spectral filtering.
- `export interface CausalLink { from, to, strength, p_value }`, `CausalGraphResponse { nodes[], edges: CausalLink[] }` — Causal inference graph response.
- `export interface TransformResponse { columns: string[], result: Record<string, number[]> }` — Column transform response (apply transformation and return new column).
- `export interface CorrelationMatrixResponse { columns[], pearson_raw?, spearman_raw?, kendall_raw? }` — NxN correlation matrix.
- `export interface OutlierRemovalResult { removed_count, stats: Record<string, number[]> }`, `SpectralFilterResponse { filtered: Record<string, number[]>, original: Record<string, number[]> }` — Outlier removal and spectral filter responses.

## Functions
- `async function fetchRollingBands(payload): Promise<RollingResponse>` [deps: [ROLLING_ENDPOINT][1]]
  - POST to rolling band endpoint with window size and column configuration.

- `async function fetchAnomalies(payload): Promise<AnomalyResponse>` — POST to anomaly detection endpoint.

- `async function fetchFft(payload): Promise<FftResponse>` — POST to FFT computation endpoint.

- `async function fetchSpectrogram(payload): Promise<SpectrogramResponse>` — POST to spectrogram/STFT endpoint with optional scale/filter options.

- `async function fetchCausalGraph(payload): Promise<CausalGraphResponse>` — POST to causal inference endpoint.

- `async function applyTransform(payload): Promise<TransformResponse>` — POST column transform (e.g., log, diff).

- `async function fetchCorrelationMatrix(mode?): Promise<CorrelationMatrixResponse>` — GET correlation matrix with optional mode filter.

- `async function removeOutliers(payload): Promise<OutlierRemovalResult>` — POST outlier removal endpoint.

- `async function applySpectralFilter(payload): Promise<SpectralFilterResponse>` — POST spectral filtering endpoint.

---
[1]: ../../constants.md#ROLLING_ENDPOINT