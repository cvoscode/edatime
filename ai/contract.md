# ai/contract.md
> Single source of truth for the current Frontend (TypeScript) <-> Backend (Rust) HTTP contract.

## Scatter

### `GET|POST /api/scatter/points`
- **TS caller:** `fetchScatterPoints(x: string, y: string, limit?: number, color?: string | null, options?: ScatterFetchOptions | null, signal?: AbortSignal): Promise<ScatterPointsResponse>` [deps: [scatter_api][1]]
- **Rust payload/query:** `ScatterPointsQuery { x: String, y: String, color?: String, size?: String, start?: f64, end?: f64, filters?: String, line_filters?: String, limit: usize, format?: String }` [deps: [scatter_types][2]]
- **Request contract:** frontend uses `POST` with JSON; `filters` and `line_filters` are JSON-serialized strings inside the payload body.
- **Response `200 OK` Arrow or JSON:** `ScatterPointsResponse { x: string; y: string; color: string | null; total_points: number; returned_points: number; points: Array<[number, number]>; color_values: number[] | null; color_labels: Array<string | null> | null; color_min: number | null; color_max: number | null; color_cardinality: { used: number; bucketed: number } | null }`
- **Arrow headers:** `x-edatime-scatter-x`, `x-edatime-scatter-y`, `x-edatime-scatter-color`, `x-edatime-scatter-total`, `x-edatime-scatter-returned`, optional `x-edatime-color-min`, `x-edatime-color-max`, `x-edatime-cache`.

### `POST /api/scatter/matrix`
- **TS caller:** `fetchScatterMatrix(pairs: ScatterMatrixPair[], color?: string | null, options?: ScatterFetchOptions | null, limit?: number, signal?: AbortSignal): Promise<ScatterMatrixResponse>` [deps: [scatter_api][1]]
- **Rust payload:** `ScatterMatrixQuery { pairs: Vec<ScatterMatrixPair>, color?: String, start?: f64, end?: f64, filters?: String, line_filters?: String, limit: usize }` [deps: [scatter_types][2]]
- **Request contract:** frontend sends `pairs` as `Array<{ x: string; y: string }>` plus optional `color`, `start`, `end`, and JSON-stringified `filters` / `line_filters`.
- **Response `200 OK` Arrow:** Arrow IPC table with columns `cell_id`, `x`, `y`, `color_value`, `color_label`.
- **Response headers:** `x-edatime-matrix-cells` (base64 JSON array of `{ cell_id, x, y, total_points, returned_points, color_min, color_max, color_kind }`), optional `x-edatime-scatter-color`, and `x-edatime-cache`.
- **Decoded TS shape:** `ScatterMatrixResponse { cells: Map<string, { totalPoints: number; points: [number, number][]; colorValues: number[] | null; colorLabels: (string | null)[] | null }> }`

### `GET /api/scatter/correlations`
- **TS caller:** `fetchScatterCorrelations(base: string | null, threshold?: number, mode?: CorrelationMetric): Promise<ScatterCorrelationsResponse>` [deps: [scatter_api][1]]
- **Rust query:** `ScatterCorrelationsQuery { base?: String, threshold?: f64, mode?: CorrelationMode }`
- **Response `200 OK`:** `ScatterCorrelationsResponse { mode: CorrelationMetric; base_column: string; threshold: number; numeric_columns: string[]; correlations: Array<{ column: string; count: number; value: number | null }>; suggestions: CorrelationSuggestion[]; top_pairs: Array<{ x: string; y: string; correlation: number; count: number }> }`

### `GET /api/scatter/correlations/matrix`
- **TS caller:** `fetchCorrelationMatrix(mode?: CorrelationMetric): Promise<CorrelationMatrixResponse>`
- **Rust query:** `CorrelationMatrixQuery { mode?: CorrelationMode }`
- **Response `200 OK`:** `CorrelationMatrixResponse { columns: string[]; pearson_raw?: (number | null)[][]; spearman_raw?: (number | null)[][]; kendall_raw?: (number | null)[][]; pearson_diff?: (number | null)[][]; spearman_diff?: (number | null)[][]; kendall_diff?: (number | null)[][] }`

## FFT / Spectrogram

### `GET /api/analytics/fft`
- **TS caller:** `fetchFft(start: string, end: string, columns: string, maxPoints?: number, signal?: AbortSignal): Promise<FftResponse>`
- **Rust query:** `FftQuery { start: DateTime<Utc>, end: DateTime<Utc>, columns?: String, max_points?: usize }`
- **Response `200 OK`:** `FftResponse { sample_count: number; results: Array<{ column: string; frequencies: number[]; magnitudes: number[]; psd: number[]; sample_rate_hz: number; nyquist_hz: number; dominant_peaks: Array<{ frequency_hz: number; magnitude: number; power: number; rank: number }> }> }`

### `GET /api/analytics/spectrogram`
- **TS caller:** `fetchSpectrogram(start: string, end: string, column: string, windowSize?: number, hopSize?: number, maxPoints?: number, signal?: AbortSignal, scaleOptions?: { normalize?: string; clip?: string; clipParam?: number }): Promise<SpectrogramResponse>`
- **Rust query:** `SpectrogramQuery { start: DateTime<Utc>, end: DateTime<Utc>, column: String, window_size?: usize, hop_size?: usize, max_points?: usize, normalize?: String, clip?: String, clip_param?: f64 }`
- **Request contract:** frontend may send `hop_size`, `normalize`, `clip`, and `clip_param` when those controls are enabled.
- **Response `200 OK`:** `SpectrogramResponse { sample_count: number; result: { column: string; times_ms: number[]; frequencies: number[]; magnitudes: number[][] } }`

## Drift

### `POST /api/drift/stats`
- **TS caller:** `fetchDriftStats<T>(payload: DriftQueryPayload, signal?: AbortSignal): Promise<T>`
- **Rust payload:** `DriftQuery { column: String, window: String, reference_start: String, reference_end: String, ks_pvalue_threshold?: f64, es_pvalue_threshold?: f64, psi_minor_threshold?: f64, psi_major_threshold?: f64, wasserstein_std_multiplier?: f64 }` with camelCase TS keys.
- **Response `200 OK`:** `DriftResponse`

### `POST /api/drift/investigate`
- **TS caller:** `fetchDriftInvestigation(payload: DriftInvestigateQueryPayload, signal?: AbortSignal): Promise<DriftInvestigationResponse>`
- **Rust payload:** `DriftInvestigateQuery { columns: Vec<String>, window: String, reference_start: String, reference_end: String, comparison_start?: String, comparison_end?: String, segment_by?: String, segment_limit?: usize, ks_pvalue_threshold?: f64, es_pvalue_threshold?: f64, psi_minor_threshold?: f64, psi_major_threshold?: f64, wasserstein_std_multiplier?: f64, include_quality?: bool, include_change_points?: bool, include_correlations?: bool }` with camelCase TS keys.
- **Response `200 OK`:** `DriftInvestigationResponse { overview, columns, rankings, segments?, quality?, relationships? }`

---
[1]: ./frontend/src/services/api/scatter.md
[2]: ./crates/edatime-service/src/handlers/scatter/mod.md
