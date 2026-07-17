# frontend/src/services/api/analytics.ts
> Frontend client for rolling-band, anomaly, FFT, spectrogram, spectral-filter, causal, and correlation-matrix endpoints. All endpoints require an active cleaning plan and attach it via `cleaningPlanStore`.

## Re-exports
- Re-exports all analytics DTO types from `../../contracts/api/v1/analytics.js` (`RollingBand`, `RollingResponse`, `AnomalyRegion`, `AnomalyResponse`, `FrequencyPeak`, `FftResult`, `FftResponse`, `SpectrogramResult`, `SpectrogramResponse`, `SpectrogramScaleOptions`, `CausalLink`, `CausalGraphResponse`, `CorrelationMatrixResponse`, `SpectralFilterResponse`).

## Functions
- `fetchRollingBands(start, end, columns, window = 50, options?: ApiRequestOptions): Promise<RollingResponse>`
- `fetchAnomalies(start, end, columns, method = 'zscore', threshold?, options?): Promise<AnomalyResponse>`
- `fetchFft(start, end, columns, maxPoints = 8192, options?): Promise<FftResponse>`
- `fetchSpectrogram(start, end, column, windowSize = 96, hopSize?, maxPoints = 32768, options?, scaleOptions?: SpectrogramScaleOptions): Promise<SpectrogramResponse>`
  - Forwards `normalize`, `clip`, `clip_param` from `scaleOptions` to the backend.
- `fetchCausalGraph(columns: string[], tauMax = 3, alpha = 0.05, method = 'pcmci', maxPoints = 5000, options?, pcAlpha = 0.2, test = 'par_corr', maxCondsDim?, fdrMethod = 'none'): Promise<CausalGraphResponse>`
  - Sends `{ columns, tau_max, alpha, method, max_points, pc_alpha, test, fdr_method, [max_conds_dim], cleaning_plan }`.
- `fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>` — duplicates `fetchCorrelationMatrix` from `./scatter-matrix.ts`. Both POST `/api/v1/scatter/correlations/matrix` (the source file shows this).
- `fetchSpectralFilter(params: URLSearchParams, options?): Promise<SpectralFilterResponse>`
  - Converts `URLSearchParams` to a JSON body, parses `low_hz`/`high_hz`/`sample_rate_hz`/`max_points` to numbers, attaches cleaning plan.

---
[deps: [http][1], [routes][2], [cleaning/store][3], [cleaning/compiler][4], [contracts/analytics][5]]

[1]: ./http.md
[2]: ../contracts/api/v1/routes.md
[3]: ../cleaning/store.md
[4]: ../cleaning/compiler.md
[5]: ../contracts/api/v1/analytics.md