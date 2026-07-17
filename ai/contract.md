# ai/contract.md
> Single source of truth for the current Frontend (TypeScript) <-> Backend (Rust) HTTP contract.

> **Canonical base path:** `/api/v1`. The legacy `/api` alias was retired; new clients
> must target `/api/v1/*` only. All endpoint modules under `frontend/src/services/api/*`
> build URLs with the `/api/v1` prefix. The contract is pinned by
> `frontend/src/services/api/__contract__.test.ts`.

## Dataset

### `GET /api/v1/metadata`
- **TS caller:** `fetchMetadata(): Promise<DatasetMetadata>` [deps: [metadata_api][1]]
- **Response `200 OK`:** `DatasetMetadata { total_rows: number; columns: string[]; numeric_columns: string[]; time_range, column_profiles, table_id, ... }`

### `GET /api/v1/sample/:name`
- **TS caller:** `fetchSampleDataset(filename: string): Promise<Blob>` [deps: [metadata_api][1]]

## Timeseries

### `GET /api/v1/data`
- **TS caller:** `fetchData(start: string, end: string, width: number, columns?: string, colorColumn?: string | null, lookaroundMs?: number, signal?: AbortSignal): Promise<DataObject>` [deps: [timeseries_api][1]]
- **Rust query:** `DataQuery { start, end, width, columns?, color_column?, lookaround_ms?, format? }`
- **Request contract:** frontend sends ISO `start` / `end`, integer `width`, comma-separated `columns`, optional `color_column`, and optional `lookaround_ms` to fetch a buffered window around the viewport.
- **Response `200 OK` Arrow:** Arrow IPC table with timestamp column plus requested numeric/color columns.
- **Response headers used by frontend:** `x-edatime-downsampled`, `x-edatime-returned-rows`, `x-edatime-target-points`, `x-edatime-time-column`.
- **Additional response headers emitted by backend:** `x-edatime-empty`, `x-edatime-filtered-rows`, `x-edatime-dropped-rows`.

## Scatter

### `GET|POST /api/v1/scatter/points`
- **TS caller:** `fetchScatterPoints(x: string, y: string, limit?: number, color?: string | null, options?: ScatterFetchOptions | null, signal?: AbortSignal): Promise<ScatterPointsResponse>` [deps: [scatter_api][2]]
- **Rust payload/query:** `ScatterPointsQuery { x: String, y: String, color?: String, size?: String, start?: f64, end?: f64, filters?: String, line_filters?: String, limit: usize, format?: String }`
- **Request contract:** frontend uses `POST` with JSON; `filters` and `line_filters` are JSON-serialized strings inside the payload body.
- **Response `200 OK` Arrow or JSON:** `ScatterPointsResponse { x: string; y: string; color: string | null; total_points: number; returned_points: number; points: Array<[number, number]>; color_values: number[] | null; color_labels: Array<string | null> | null; color_min: number | null; color_max: number | null; color_cardinality: { used: number; bucketed: number } | null }`
- **Arrow headers:** `x-edatime-scatter-x`, `x-edatime-scatter-y`, `x-edatime-scatter-color`, `x-edatime-scatter-total`, `x-edatime-scatter-returned`, optional `x-edatime-color-min`, `x-edatime-color-max`, `x-edatime-cache`.

### `POST /api/v1/scatter/matrix`
- **TS caller:** `fetchScatterMatrix(pairs: ScatterMatrixPair[], color?: string | null, options?: ScatterFetchOptions | null, limit?: number, signal?: AbortSignal): Promise<ScatterMatrixResponse>` [deps: [scatter_api][2]]
- **Rust payload:** `ScatterMatrixQuery { pairs: Vec<ScatterMatrixPair>, color?: String, start?: f64, end?: f64, filters?: String, line_filters?: String, limit: usize }`
- **Request contract:** frontend sends `pairs` as `Array<{ x: string; y: string }>` plus optional `color`, `start`, `end`, and JSON-stringified `filters` / `line_filters`.
- **Response `200 OK` Arrow:** Arrow IPC table with columns `cell_id`, `x`, `y`, `color_value`, `color_label`.
- **Response headers:** `x-edatime-matrix-cells`, optional `x-edatime-scatter-color`, and `x-edatime-cache`.
- **Decoded TS shape:** `ScatterMatrixResponse { cells: Map<string, { totalPoints: number; points: [number, number][]; colorValues: number[] | null; colorLabels: (string | null)[] | null }> }`

### `GET /api/v1/scatter/correlations`
- **TS caller:** `fetchScatterCorrelations(base: string | null, threshold?: number, mode?: CorrelationMetric): Promise<ScatterCorrelationsResponse>` [deps: [scatter_api][2]]
- **Rust query:** `ScatterCorrelationsQuery { base?: String, threshold?: f64, mode?: CorrelationMode }`
- **Response `200 OK`:** `ScatterCorrelationsResponse { mode: CorrelationMetric; base_column: string; threshold: number; numeric_columns: string[]; correlations: Array<{ column: string; count: number; value: number | null }>; suggestions: CorrelationSuggestion[]; top_pairs: Array<{ x: string; y: string; correlation: number; count: number }> }`

### `GET /api/v1/scatter/correlations/matrix`
- **TS caller:** `fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>` [deps: [analytics_api][3]]
- **Rust query:** `CorrelationMatrixQuery { mode?: CorrelationMode }`
- **Response `200 OK`:** `CorrelationMatrixResponse { columns: string[]; pearson?: (number | null)[][]; spearman?: (number | null)[][]; pearson_raw?: (number | null)[][]; spearman_raw?: (number | null)[][]; kendall_raw?: (number | null)[][]; pearson_diff?: (number | null)[][]; spearman_diff?: (number | null)[][]; kendall_diff?: (number | null)[][] }`

## Analytics

### `GET /api/v1/analytics/anomalies`
- **TS caller:** `fetchAnomalies(start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal): Promise<AnomalyResponse>` [deps: [analytics_api][3]]
- **Rust query:** `AnomalyQuery { start: DateTime<Utc>, end: DateTime<Utc>, columns?: String, method?: String, threshold?: f64 }`
- **Response `200 OK`:** `AnomalyResponse { method: string; threshold: number; regions: Array<{ column: string; method: string; start_ms: number; end_ms: number; score: number }>; summary_stats?: { mean: number; std: number; min: number; max: number } | null }`

### `GET /api/v1/analytics/fft`
- **TS caller:** `fetchFft(start: string, end: string, columns: string, maxPoints?: number, signal?: AbortSignal): Promise<FftResponse>` [deps: [analytics_api][3]]
- **Rust query:** `FftQuery { start: DateTime<Utc>, end: DateTime<Utc>, columns?: String, max_points?: usize }`
- **Response `200 OK`:** `FftResponse { sample_count: number; results: Array<{ column: string; frequencies: number[]; magnitudes: number[]; psd: number[]; sample_rate_hz: number; nyquist_hz: number; dominant_peaks: Array<{ frequency_hz: number; magnitude: number; power: number; rank: number }> }> }`

### `GET /api/v1/analytics/spectrogram`
- **TS caller:** `fetchSpectrogram(start: string, end: string, column: string, windowSize?: number, hopSize?: number, maxPoints?: number, signal?: AbortSignal, scaleOptions?: { normalize?: string; clip?: string; clipParam?: number }): Promise<SpectrogramResponse>` [deps: [analytics_api][3]]
- **Rust query:** `SpectrogramQuery { start: DateTime<Utc>, end: DateTime<Utc>, column: String, window_size?: usize, hop_size?: usize, max_points?: usize, normalize?: String, clip?: String, clip_param?: f64 }`
- **Request contract:** frontend may send `hop_size`, `normalize`, `clip`, and `clip_param` when those controls are enabled.
- **Response `200 OK`:** `SpectrogramResponse { sample_count: number; result: { column: string; times_ms: number[]; frequencies: number[]; magnitudes: number[][] } }`

## Drift

### `POST /api/v1/drift/stats`
- **TS caller:** `fetchDriftStats<T>(payload: DriftQueryPayload, signal?: AbortSignal): Promise<T>`
- **Rust payload:** `DriftQuery { column: String, window: String, reference_start: String, reference_end: String, ks_pvalue_threshold?: f64, es_pvalue_threshold?: f64, psi_minor_threshold?: f64, psi_major_threshold?: f64, wasserstein_std_multiplier?: f64 }`
- **Response `200 OK`:** `DriftResponse`

### `POST /api/v1/drift/investigate`
- **TS caller:** `fetchDriftInvestigation(payload: DriftInvestigateQueryPayload, signal?: AbortSignal): Promise<DriftInvestigationResponse>`
- **Rust payload:** `DriftInvestigateQuery { columns: Vec<String>, window: String, reference_start: String, reference_end: String, comparison_start?: String, comparison_end?: String, segment_by?: String, segment_limit?: usize, ks_pvalue_threshold?: f64, es_pvalue_threshold?: f64, psi_minor_threshold?: f64, psi_major_threshold?: f64, wasserstein_std_multiplier?: f64, include_quality?: bool, include_change_points?: bool, include_correlations?: bool }`
- **Response `200 OK`:** `DriftInvestigationResponse { overview, columns, rankings, segments?, quality?, relationships? }`

## Export

### `GET /api/v1/export/parquet`
- **TS caller:** `exportParquet(params: URLSearchParams, signalOrOptions?: AbortSignal | ApiRequestOptions): Promise<Blob>` [deps: [export_api][4]]
- **Request contract:** caller passes serialized `URLSearchParams` containing filter / range selectors; backend returns Parquet bytes.

### `POST /api/v1/scatter/export/parquet`
- **TS caller:** `exportScatterParquet(payload: unknown, signalOrOptions?: AbortSignal | ApiRequestOptions): Promise<Blob>` [deps: [export_api][4]]
- **Request contract:** JSON payload mirrors the scatter query body; response is Parquet bytes.

## Upload & Database

### `POST /api/v1/upload`
- **TS caller:** `uploadDataset(formData: FormData): Promise<Response>` [deps: [upload_api][5]]

### `POST /api/v1/upload/preview`
- **TS caller:** `previewUpload(formData: FormData, signal?: AbortSignal): Promise<Response>` [deps: [upload_api][5]]

### `GET /api/v1/database/tables` / `POST /api/v1/database/connect` / `DELETE /api/v1/database/connect` / `GET /api/v1/database/status` / `POST /api/v1/database/load`
- **TS callers:** `fetchDatabaseTables`, `connectDatabase`, `deleteDatabaseConnection`, `fetchDatabaseStatus`, `loadDatabaseTable` [deps: [upload_api][5]]
- Database status / tables / connect calls pass `{ datasetScoped: false }`; load calls remain dataset-scoped.

## Transform & Analytics Helpers

### `POST /api/v1/transform`
- **TS caller:** `postTransform(expression: string, outputName: string): Promise<TransformResponse>` [deps: [analytics_api][3]]
- **Response `200 OK`:** `TransformResponse { status: string; column: string; expression: string }`

### `GET /api/v1/analytics/rolling`
- **TS caller:** `fetchRollingBands(start, end, columns, window?: number, signalOrOptions?): Promise<RollingResponse>`

### `POST /api/v1/analytics/remove_outliers`
- **TS caller:** `postRemoveOutliers(columns: string[] | null, method?: string, threshold?: number, window?: number): Promise<OutlierRemovalResult>` [deps: [analytics_api][3]]
- **Response `200 OK`:** `OutlierRemovalResult { method; columns; rows_before; rows_after; rows_removed }`

### `GET /api/v1/analytics/spectral-filter`
- **TS caller:** `fetchSpectralFilter(params: URLSearchParams, signalOrOptions?: AbortSignal | ApiRequestOptions): Promise<SpectralFilterResponse>` [deps: [analytics_api][3]]

### `POST /api/v1/analytics/causal`
- **TS caller:** `fetchCausalGraph(columns, tauMax?, alpha?, method?, maxPoints?, signalOrOptions?, pcAlpha?, test?, maxCondsDim?, fdrMethod?): Promise<CausalGraphResponse>` [deps: [analytics_api][3]]

## Cleaning

> Cleaning-plan lifecycle endpoints. The plan is a serializable artifact that can be validated, previewed, applied (creating a new dataset version), exported as data / plan / code / manifest / bundle, and listed as dataset versions.

### `POST /api/v1/cleaning/validate`
- Validate a cleaning plan payload without applying it.

### `POST /api/v1/cleaning/preview`
- Preview a cleaning plan's effect on the dataset.

### `POST /api/v1/cleaning/propose/outliers`
- Generate an outlier-cleaning plan proposal from the current dataset.

### `POST /api/v1/cleaning/apply`
- Apply a cleaning plan to the dataset. Creates a new dataset version on success.

### `POST /api/v1/cleaning/export/data`
- Export the post-cleaning dataset.

### `POST /api/v1/cleaning/export/plan`
- Export the cleaning plan as a portable artifact (JSON / plan format).

### `POST /api/v1/cleaning/export/code`
- Export the cleaning plan as code (e.g. reproducible Python / Polars snippet).

### `POST /api/v1/cleaning/export/manifest`
- Export a manifest describing the cleaning plan and its provenance.

### `POST /api/v1/cleaning/export/bundle`
- Export a bundle combining data, plan, code, and manifest.

## Jobs

### `GET /api/v1/jobs`
- List background jobs (cleaning, profile, correlation warmups, etc.).

### `GET /api/v1/jobs/{id}`
- Fetch a single job's status and (if complete) result payload.

### `DELETE /api/v1/jobs/{id}`
- Cancel a running background job.

## Datasets

### `GET /api/v1/datasets/versions`
- List all dataset versions on disk (cleaning-plan versions).

### `POST /api/v1/datasets/versions/select`
- Switch the in-memory dataset to a previously saved version. Body: `{ version_id: string }`.

### `GET /api/v1/datasets/storage`
- Return disk-usage information for the dataset artifact store.

## Profile

### `GET /api/v1/profile`
- Read the cached column profile for the active dataset (if computed).

### `POST /api/v1/profile`
- Start a fresh column-profile job for the active dataset.

### `GET /api/v1/profile/sample`
- Read the cached column profile for a sample dataset (if computed).

### `POST /api/v1/profile/sample`
- Start a fresh column-profile job for a sample dataset.

## Config

### `GET /api/v1/config/database`
- Read the current database-connection configuration.

### `POST /api/v1/config/database`
- Update database-connection configuration.

## Aggregate

### `GET /api/v1/aggregate`
- Bucket-aggregated bar/heatmap data with support for tumbling and sliding windows.

## Database (additional)

### `GET /api/v1/database/columns`
- List columns of a connected database table.

## Health & Metrics

### `GET /api/v1/health`
- Liveness probe. Returns `{ "status": "ok" }`.

### `GET /api/v1/metrics`
- In-memory runtime metrics: request counts, cache hits/misses, rate-limit rejections, scatter sampling stats, dataset revision.

---
[1]: ./frontend/src/services/api/metadata.md
[2]: ./frontend/src/services/api/scatter.md
[3]: ./frontend/src/services/api/analytics.md
[4]: ./frontend/src/services/api/export.md
[5]: ./frontend/src/services/api/upload.md
