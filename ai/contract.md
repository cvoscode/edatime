# ai/contract.md
> Single source of truth for the current Frontend (TypeScript) <-> Backend (Rust) HTTP contract.

All frontend transport calls stay in `frontend/src/services/api/*`. All route handlers live under `crates/edatime-service/src/handlers/routes/*` and `crates/edatime-service/src/handlers/scatter/*`.

## Dataset Bootstrap

### `GET /api/metadata`
- **TS caller:** `fetchMetadata(): Promise<DatasetMetadata>` [deps: [fetchMetadata][1]]
- **Rust handler:** `pub async fn get_metadata(State(state): State<AppState>) -> Result<Json<DatasetMetadata>, AppError>` [deps: [DatasetMetadata][2]]
- **Response `200 OK`:** `DatasetMetadata { revision: number; total_rows: number; columns: ColumnMetadata[]; numeric_columns: string[]; time_column: string | null; time_range: { min: number; max: number } | null; column_profiles: ColumnProfile[] }`
- **Error:** `4xx|5xx` -> `AppError` JSON envelope.

### `GET /api/sample/{name}`
- **TS caller:** `fetchSampleDataset(filename: string): Promise<Blob>` [deps: [fetchSampleDataset][1]]
- **Rust handler:** `pub async fn serve_sample_file(...) -> Result<Response, AppError>`
- **Response `200 OK`:** sample dataset binary body.
- **Error:** `404|500` -> text or `AppError` body.

## Timeseries Page

### `GET /api/data`
- **TS caller:** `fetchData(start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal): Promise<DataObject>` [deps: [fetchData][3]]
- **Rust query:** `DataQuery { start: DateTime<Utc>, end: DateTime<Utc>, width: usize, columns?: String, color_column?: String, format?: String }` [deps: [DataQuery][4]]
- **Rust handler:** `pub async fn get_data(State(state): State<AppState>, Query(params): Query<DataQuery>) -> Result<Response, AppError>`
- **Request contract:** frontend sends `start` and `end` as ISO 8601 strings, `width` as target pixel width, `columns` as a comma-separated list, and optional `color_column`.
- **Response `200 OK` Arrow:** `DataObject { ts: Float64Array; values: Record<string, Float64Array>; color: Array<number | string | null> | null; color_column: string | null; _meta: { downsampled: boolean; downsampleKnown: boolean; returnedRows: number; targetPoints: number } }`
- **Response headers:** `x-edatime-downsampled`, `x-edatime-returned-rows`, `x-edatime-target-points`, `x-edatime-time-column`, optional `x-edatime-color-column`.
- **Response `200 OK` JSON fallback:** `{ "<timeColumn>": number[]; values: Record<string, number[]>; color: Array<number | string | null> | null; color_column: string | null }`
- **Error:** `400` invalid time window, width, or color column; `500` pipeline/serialization failure.

### `GET /api/analytics/rolling`
- **TS caller:** `fetchRollingBands(start: string, end: string, columns: string, window?: number, signal?: AbortSignal): Promise<RollingResponse>` [deps: [fetchRollingBands][5]]
- **Rust query:** `RollingQuery { start: DateTime<Utc>, end: DateTime<Utc>, columns?: String, window?: usize }` [deps: [RollingQuery][6]]
- **Rust handler:** `pub async fn get_rolling(State(state): State<AppState>, Query(params): Query<RollingQuery>) -> Result<impl IntoResponse, AppError>`
- **Response `200 OK`:** `RollingResponse { bands: Array<{ column: string; ts: number[]; mean: (number | null)[]; upper1: (number | null)[]; lower1: (number | null)[]; upper2: (number | null)[]; lower2: (number | null)[] }> }`

### `GET /api/analytics/anomalies`
- **TS caller:** `fetchAnomalies(start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal): Promise<AnomalyResponse>` [deps: [fetchAnomalies][5]]
- **Rust query:** `AnomalyQuery { start: DateTime<Utc>, end: DateTime<Utc>, columns?: String, method?: String, threshold?: f64 }` [deps: [AnomalyQuery][6]]
- **Rust handler:** `pub async fn get_anomalies(State(state): State<AppState>, Query(params): Query<AnomalyQuery>) -> Result<impl IntoResponse, AppError>`
- **Response `200 OK`:** `AnomalyResponse { method: string; threshold: number; regions: Array<{ column: string; method: string; start_ms: number; end_ms: number; score: number }> }`

## FFT / Spectrogram / Heatmap Pages

### `GET /api/analytics/fft`
- **TS caller:** `fetchFft(start: string, end: string, columns: string, maxPoints?: number, signal?: AbortSignal): Promise<FftResponse>` [deps: [fetchFft][5]]
- **Rust query:** `FftQuery { start: DateTime<Utc>, end: DateTime<Utc>, columns?: String, max_points?: usize }` [deps: [FftQuery][6]]
- **Rust handler:** `pub async fn get_fft(State(state): State<AppState>, Query(params): Query<FftQuery>) -> Result<impl IntoResponse, AppError>`
- **Response `200 OK`:** `FftResponse { sample_count: number; results: Array<{ column: string; frequencies: number[]; magnitudes: number[]; psd: number[] }> }`

### `GET /api/analytics/spectral-filter`
- **TS caller:** `fetchSpectralFilter(params: URLSearchParams, signal?: AbortSignal): Promise<SpectralFilterResponse>` [deps: [fetchSpectralFilter][5]]
- **Rust query:** `SpectralFilterQuery { start?: DateTime<Utc>, end?: DateTime<Utc>, column: String, filter_type: String, low_hz?: f64, high_hz?: f64, sample_rate_hz?: f64, max_points?: usize }` [deps: [SpectralFilterQuery][6]]
- **Rust handler:** `pub async fn get_spectral_filter(State(state): State<AppState>, Query(params): Query<SpectralFilterQuery>) -> Result<impl IntoResponse, AppError>`
- **Response `200 OK`:** `SpectralFilterResponse { column: string; ts: number[]; values: number[]; filter_type: string; low_hz?: number; high_hz?: number }`
- **Error:** `400` unknown filter type or invalid cutoffs; `500` compute failure.

### `GET /api/analytics/spectrogram`
- **TS caller:** `fetchSpectrogram(start: string, end: string, column: string, windowSize?: number, hopSize?: number, maxPoints?: number, signal?: AbortSignal): Promise<SpectrogramResponse>` [deps: [fetchSpectrogram][5]]
- **Rust query:** `SpectrogramQuery { start: DateTime<Utc>, end: DateTime<Utc>, column: String, window_size?: usize, hop_size?: usize, max_points?: usize }` [deps: [SpectrogramQuery][6]]
- **Rust handler:** `pub async fn get_spectrogram(State(state): State<AppState>, Query(params): Query<SpectrogramQuery>) -> Result<impl IntoResponse, AppError>`
- **Response `200 OK`:** `SpectrogramResponse { sample_count: number; result: { column: string; times_ms: number[]; frequencies: number[]; magnitudes: number[][] } }`

### `GET /api/scatter/correlations/matrix`
- **TS caller:** `fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>` [deps: [fetchCorrelationMatrix][5]]
- **Rust handler:** `pub async fn get_correlation_matrix(...) -> Result<Json<CorrelationMatrixResponse>, AppError>`
- **Response `200 OK`:** `CorrelationMatrixResponse { columns: string[]; pearson: (number | null)[][]; spearman: (number | null)[][] }`

## Scatter Page

### `GET|POST /api/scatter/points`
- **TS caller:** `fetchScatterPoints(x: string, y: string, limit?: number, color?: string | null, options?: ScatterFetchOptions | null, signal?: AbortSignal): Promise<ScatterPointsResponse>` [deps: [fetchScatterPoints][7]]
- **Rust payload/query:** `ScatterPointsQuery { x: String, y: String, color?: String, size?: String, start?: f64, end?: f64, filters?: String, line_filters?: String, limit: usize, format?: String }` [deps: [ScatterPointsQuery][8]]
- **Rust handlers:** `pub async fn get_scatter_points(...) -> Result<Response, AppError>` and `pub async fn post_scatter_points(...) -> Result<Response, AppError>`
- **Request contract:** frontend currently uses `POST` with JSON; `filters` and `line_filters` are JSON-serialized strings inside the payload.
- **Response `200 OK` Arrow or JSON:** `ScatterPointsResponse { x: string; y: string; color: string | null; total_points: number; returned_points: number; points: Array<[number, number]>; color_values: number[] | null; color_labels: Array<string | null> | null; color_min: number | null; color_max: number | null }`
- **Response headers (Arrow):** `x-edatime-scatter-x`, `x-edatime-scatter-y`, `x-edatime-scatter-color`, `x-edatime-scatter-total`, `x-edatime-scatter-returned`, optional `x-edatime-color-min`, `x-edatime-color-max`.

### `GET /api/scatter/correlations`
- **TS caller:** `fetchScatterCorrelations(base: string | null, threshold?: number): Promise<ScatterCorrelationsResponse>` [deps: [fetchScatterCorrelations][7]]
- **Rust query:** `ScatterCorrelationsQuery { base?: String, threshold?: f64 }` [deps: [ScatterCorrelationsQuery][8]]
- **Response `200 OK`:** `ScatterCorrelationsResponse { base_column: string; threshold: number; numeric_columns: string[]; correlations: CorrelationItem[]; suggestions: CorrelationSuggestion[] }`
- **Suggestion shape (TS):** `CorrelationSuggestion { x: string; y: string; correlation: number }` — explicit base/partner column pair with absolute correlation (mirrors the Rust `SuggestionItem` struct). [deps: [CorrelationSuggestion][10]]
- **Caching:** responses are now backed by a revision-scoped `CorrelationMatrixCacheEntry` on `AppState` (warmup via `spawn_correlation_matrix_warmup`); the cache is invalidated by `replace_dataset` / `clear_correlation_matrix_cache`.

### `POST /api/scatter/export/parquet`
- **TS caller:** `exportScatterToParquet(...)` [deps: [scatterExport][9]]
- **Rust payload:** `Json<ScatterPointsQuery>` [deps: [ScatterPointsQuery][8]]
- **Response `200 OK`:** Parquet binary export.

## Mutations And Derived Data

### `POST /api/transform`
- **TS caller:** `postTransform(expression: string, outputName: string): Promise<TransformResponse>` [deps: [postTransform][5]]
- **Rust payload:** `TransformRequest { expression: String, output_name: String }` [deps: [TransformRequest][6]]
- **Rust handler:** `pub async fn post_transform(State(state): State<AppState>, Json(params): Json<TransformRequest>) -> Result<impl IntoResponse, AppError>`
- **Response `200 OK`:** `TransformResponse { status: string; column: string; expression: string }`
- **Error:** `400` empty or invalid expression/output name; `500` evaluation failure.

### `POST /api/analytics/remove_outliers`
- **TS caller:** `postRemoveOutliers(columns: string[] | null, method?: string, threshold?: number, window?: number): Promise<OutlierRemovalResult>` [deps: [postRemoveOutliers][5]]
- **Rust payload:** `OutlierRemovalRequest { columns?: String, method?: String, threshold?: f64, window?: usize }` [deps: [OutlierRemovalRequest][6]]
- **Response `200 OK`:** `OutlierRemovalResult { method: string; columns: string[]; rows_before: number; rows_after: number; rows_removed: number }`

### `POST /api/analytics/causal`
- **TS caller:** `fetchCausalGraph(columns: string[], tauMax?: number, alpha?: number, method?: string, maxPoints?: number, signal?: AbortSignal, pcAlpha?: number, test?: string, maxCondsDim?: number, fdrMethod?: string): Promise<CausalGraphResponse>` [deps: [fetchCausalGraph][5]]
- **Rust payload:** `CausalGraphRequest { columns: String, tau_max?: usize, alpha?: f64, method?: String, max_points?: usize, pc_alpha?: f64, test?: String, max_conds_dim?: usize, fdr_method?: String }` [deps: [CausalGraphRequest][6]]
- **Response `200 OK`:** `CausalGraphResponse { columns: string[]; tau_max: number; links: CausalLink[]; graph: string[][][]; val_matrix: number[][][]; p_matrix: number[][][] }`

### `POST /api/drift/stats`
- **TS caller:** `fetchDriftStats<T>(payload: unknown, signal?: AbortSignal): Promise<T>` [deps: [fetchDriftStats][10]]
- **Rust payload:** `DriftQuery { column: String, window: String, reference_start: String, reference_end: String }` [deps: [DriftQuery][11]]
- **Rust handler:** `pub async fn post_drift_stats(State(state): State<AppState>, Json(query): Json<DriftQuery>) -> Result<Response, AppError>` [deps: [compute_temporal_drift][13]]
- **Frontend payload shape in practice:** `{ column: string; window: string; reference_start: string; reference_end: string }`
- **Window sizes:** `hourly` (3600s), `daily` (86400s, default), `weekly` (604800s)
- **Response `200 OK`:** `DriftResponse { column: string; reference: WindowDistributionStats; windows: DriftWindowStats[]; thresholds: { ks_threshold: number; wasserstein_threshold: number; psi_minor_threshold: number; psi_major_threshold: number }; metadata?: { computation_time_ms: number; num_windows: number; reference_samples: number; bin_count_warning?: boolean; effective_bins?: number; psi_sample_ratio_warning?: boolean; avg_window_samples?: number } }` [deps: [DriftResponse][14]]
- **Error:** `400` invalid datetime format; `500` compute failure.

## Upload And Database

### `POST /api/upload`
- **TS caller:** `uploadDataset(formData: FormData): Promise<Response>` [deps: [uploadDataset][10]]
- **Rust handler:** `pub async fn upload_data(...) -> Result<impl IntoResponse, AppError>`
- **Request contract:** multipart form upload.
- **Response `200 OK`:** upload completion payload.

### `POST /api/upload/preview`
- **TS caller:** `previewUpload(formData: FormData, signal?: AbortSignal): Promise<Response>` [deps: [previewUpload][10]]
- **Rust handler:** `pub async fn preview_upload_data(...) -> Result<impl IntoResponse, AppError>`
- **Request contract:** multipart form upload preview.
- **Response `200 OK`:** preview payload.

### `POST|DELETE /api/database/connect`
- **TS callers:** `connectDatabase(body: unknown): Promise<unknown>` and `deleteDatabaseConnection(): Promise<Response>` [deps: [connectDatabase][10], [deleteDatabaseConnection][10]]
- **Rust payload:** `ConnectRequest { kind: String, ... }` [deps: [ConnectRequest][12]]
- **Response `200 OK`:** database connection state JSON.

### `GET /api/database/status`
- **TS caller:** `fetchDatabaseStatus(): Promise<unknown>` [deps: [fetchDatabaseStatus][10]]
- **Rust handler:** `pub async fn get_status(...) -> Result<impl IntoResponse, AppError>`
- **Response `200 OK`:** database connection status JSON.

### `GET /api/database/tables`
- **TS caller:** `fetchDatabaseTables(): Promise<unknown>` [deps: [fetchDatabaseTables][10]]
- **Rust handler:** `pub async fn get_tables(...) -> Result<impl IntoResponse, AppError>`
- **Response `200 OK`:** table list JSON.

### `POST /api/database/load`
- **TS caller:** `loadDatabaseTable(body: unknown): Promise<unknown>` [deps: [loadDatabaseTable][10]]
- **Rust payload:** `LoadRequest { ... }` [deps: [LoadRequest][12]]
- **Response `200 OK`:** loaded-dataset metadata JSON.

---
[1]: ./frontend/src/services/api/metadata.md
[2]: ./crates/edatime-service/src/handlers/routes/metadata.md
[3]: ./frontend/src/services/api/timeseries.md#fetchData
[4]: ./crates/edatime-query/src/query.md#dataquery
[5]: ./frontend/src/services/api/analytics.md
[6]: ./crates/edatime-service/src/handlers/routes/analytics.md
[7]: ./frontend/src/services/api/scatter.md
[8]: ./crates/edatime-service/src/handlers/scatter/scatter/mod.md
[9]: ./frontend/src/scatter/export.md
[10]: ./frontend/src/services/api/upload.md
[11]: ./crates/edatime-service/src/handlers/routes/drift.md
[12]: ./crates/edatime-service/src/handlers/routes/database.md
[13]: ./crates/edatime-service/src/analytics/drift.md#compute_temporal_drift
[14]: ./crates/edatime-service/src/analytics/drift.md#DriftResponse
[15]: ./frontend/src/types.md#CorrelationSuggestion
