# ai/contract.md
> Single source of truth for Frontend (TypeScript) ↔ Backend (Rust) communication.

All timestamps in requests/responses are **epoch milliseconds** unless noted.

---

## API Summary

| Method | Path | Format | Description |
|--------|------|--------|-------------|
| GET | `/api/health` | JSON | Health check |
| GET | `/api/data` | Arrow/JSON | Full dataset with LTTB downsampling |
| GET | `/api/aggregate` | JSON | Bucket-aggregated bar/heatmap data |
| GET | `/api/export/parquet` | Binary | Export dataset as Parquet |
| GET | `/api/metadata` | JSON | Dataset column metadata |
| GET | `/api/metrics` | JSON | Application metrics |
| GET/POST | `/api/scatter/points` | Arrow/JSON | Scatter plot points |
| GET | `/api/scatter/correlations` | JSON | Pairwise correlations + suggestions |
| GET | `/api/scatter/correlations/matrix` | JSON | Full N×N correlation matrix |
| POST | `/api/scatter/export/parquet` | Binary | Export scatter as Parquet |
| POST | `/api/upload` | JSON | Upload CSV/Parquet dataset |
| POST | `/api/upload/preview` | JSON | Preview upload without committing |
| GET | `/api/sample/{name}` | Binary | Serve built-in sample dataset |
| POST | `/api/database/connect` | JSON | Connect to Postgres/Sqlite/TimescaleDB |
| DELETE | `/api/database/connect` | JSON | Disconnect database |
| GET | `/api/database/status` | JSON | Database connection status |
| GET | `/api/database/tables` | JSON | List database tables |
| GET | `/api/database/columns` | JSON | List columns for a table |
| POST | `/api/database/load` | JSON | Load table into repository |
| GET/POST | `/api/config/database` | JSON | Get/set database config |
| POST | `/api/transform` | JSON | Column transformation expression |
| POST | `/api/drift/stats` | JSON | Temporal drift analysis |
| GET | `/api/analytics/rolling` | JSON | Rolling mean ±σ bands |
| GET | `/api/analytics/anomalies` | JSON | Z-score / IQR anomaly regions |
| GET | `/api/analytics/fft` | JSON | FFT frequency analysis |
| GET | `/api/analytics/spectrogram` | JSON | STFT spectrogram heatmap |
| GET | `/api/analytics/spectral-filter` | JSON | Frequency-domain filter |
| POST | `/api/analytics/causal` | JSON | PCMCI/PCMCI+ causal graph |
| POST | `/api/analytics/remove_outliers` | JSON | Z-score / IQR outlier removal |

---

## `/api/data` — Full Dataset

**Method:** `GET`
**Query params:**
```
start: ISO 8601 datetime (required)
end: ISO 8601 datetime (required)
width: number (required) — target horizontal pixel width
columns: string (optional) — comma-separated column names
color_column: string (optional) — column to use for point coloring in response
format: "arrow" | "json" (default: arrow)
```

**Handler (Rust):** `get_data(State(state): State<AppState>, Query(params): Query<DataQuery>)` [deps: [DataQuery][1]]

**Response (Arrow):**
- Content-Type: `application/vnd.apache.arrow.stream`
- Body: Apache Arrow IPC flatbuf streaming format
- Headers:
  - `x-edatime-downsampled: "0" | "1"`
  - `x-edatime-returned-rows: number`
  - `x-edatime-target-points: number`
  - `x-edatime-time-column: string`
- When `color_column` is set, the Arrow table includes the color column and the response color header `x-edatime-color-column: string` is added.

**Response (JSON):**
```json
{
  "<ts_column>": [ /* epoch ms */ ],
  "values": {
    "<column>": [ /* float64 */ ],
    ...
  },
  "color": [ /* number | string | null */ ] | null,
  "color_column": "string" | null
}
```
- Headers: `x-edatime-time-column: string`

**[1]: [../../crates/edatime-query/src/query.md][1]**

---

## `/api/aggregate` — Bucket Aggregation

**Method:** `GET`
**Query params:**
```
start: ISO 8601 datetime (required)
end: ISO 8601 datetime (required)
columns: string (optional)
buckets: number (default: 50)
window_mode: "buckets" | "tumbling" | "sliding" (default: buckets)
window_ms: number (optional)
step_ms: number (optional)
agg: "mean" | "sum" | "min" | "max" | "count" (default: mean)
format: "arrow" | "json" (optional)
```

**Handler (Rust):** `get_aggregate` [deps: [AggregateQuery][2]]

**Response:** JSON `{ "<ts_col>": [...], "values": { "<col>": [...] } }`

**[2]: [../../crates/edatime-query/src/query.md][2]**

---

## `/api/analytics/rolling` — Rolling Bands

**Method:** `GET`
**Query params:**
```
start: ISO 8601 datetime
end: ISO 8601 datetime
columns: string (comma-separated)
window: number (default: 50)
```

**Handler (Rust):** `get_rolling` [deps: [RollingQuery][3]]

**Response:**
```json
{
  "bands": [{
    "column": "string",
    "ts": [/* epoch ms */],
    "mean": [(number | null)],
    "upper1": [(number | null)],
    "lower1": [(number | null)],
    "upper2": [(number | null)],
    "lower2": [(number | null)]
  }]
}
```

**[3]: [../../crates/edatime-service/src/handlers/routes/analytics.md][3]**

---

## `/api/analytics/anomalies` — Anomaly Detection

**Method:** `GET`
**Query params:**
```
start: ISO 8601 datetime
end: ISO 8601 datetime
columns: string
method: "zscore" | "iqr" (default: zscore)
threshold: number (default: 3.0 for zscore, 1.5 for iqr)
```

**Handler (Rust):** `get_anomalies` [deps: [AnomalyQuery][4]]

**Response:**
```json
{
  "method": "zscore" | "iqr",
  "threshold": number,
  "regions": [{
    "column": "string",
    "method": "string",
    "start_ms": number,
    "end_ms": number,
    "score": number
  }]
}
```

**[4]: [../../crates/edatime-service/src/handlers/routes/analytics.md][4]**

---

## `/api/analytics/fft` — FFT

**Method:** `GET`
**Query params:**
```
start: ISO 8601 datetime
end: ISO 8601 datetime
columns: string
max_points: number (default: 8192)
```

**Handler (Rust):** `get_fft`

**Response:**
```json
{
  "sample_count": number,
  "results": [{
    "column": "string",
    "frequencies": [/* Hz */],
    "magnitudes": [/* */],
    "psd": [/* */],
    "sample_rate_hz": number,
    "nyquist_hz": number,
    "dominant_peaks": [{
      "frequency_hz": number,
      "magnitude": number,
      "power": number,
      "rank": number
    }]
  }]
}
```

---

## `/api/analytics/spectrogram` — STFT Spectrogram

**Method:** `GET`
**Query params:**
```
start: ISO 8601 datetime
end: ISO 8601 datetime
column: string (single column)
window_size: number (default: 256)
hop_size: number (optional)
max_points: number (default: 32768)
```

**Handler (Rust):** `get_spectrogram`

**Response:**
```json
{
  "sample_count": number,
  "result": {
    "column": "string",
    "times_ms": [/* epoch ms */],
    "frequencies": [/* Hz */],
    "magnitudes": [[/* per window */]]
  }
}
```

---

## `/api/analytics/spectral-filter` — Frequency-Domain Filter

**Method:** `GET`
**Query params:**
```
start: ISO 8601 datetime (optional)
end: ISO 8601 datetime (optional)
column: string
filter_type: "lowpass" | "highpass" | "bandpass" | "bandstop"
low_hz: number (required for highpass/bandpass/bandstop)
high_hz: number (required for lowpass/bandpass/bandstop)
sample_rate_hz: number (optional, auto-detected)
max_points: number (default: 16384)
```

**Handler (Rust):** `get_spectral_filter`

**Response:**
```json
{
  "column": "string",
  "ts": [/* epoch ms */],
  "values": [/* filtered signal */],
  "filter_type": "string",
  "low_hz": number | null,
  "high_hz": number | null,
  "sample_count": number
}
```

---

## `/api/analytics/causal` — Causal Graph (PCMCI)

**Method:** `POST`
**Request body:**
```json
{
  "columns": "col1,col2,...",
  "tau_max": 3,
  "pc_alpha": 0.2,
  "alpha": 0.05,
  "method": "pcmci" | "pcmciplus" | "fullci" | "bivci" | "lpcmci",
  "test": "par_corr" | "cmi_knn" | "robust_parcorr" | "gsquared" | "cmi_symb",
  "max_points": 5000,
  "max_conds_dim": number | null,
  "fdr_method": "none" | "fdr_bh",
  "n_preliminary_iterations": 1,
  "knn": 10,
  "sig_samples": 200
}
```

**Handler (Rust):** `post_causal_graph` [deps: [CausalGraphRequest][5]]

**Response:**
```json
{
  "columns": ["col1", "col2", ...],
  "tau_max": number,
  "links": [{
    "source": "string",
    "target": "string",
    "lag": number,
    "type": "string",
    "value": number,
    "pvalue": number
  }],
  "graph": [[["string"]]],
  "val_matrix": [[[number]]],
  "p_matrix": [[[number]]]
}
```

**[5]: [../../crates/edatime-service/src/handlers/routes/analytics.md][5]**

---

## `/api/analytics/remove_outliers` — Outlier Removal

**Method:** `POST`
**Request body:**
```json
{
  "columns": "col1,col2,...",
  "method": "zscore" | "iqr",
  "threshold": number,
  "window": number | null
}
```

**Handler (Rust):** `post_remove_outliers`

**Response:**
```json
{
  "method": "string",
  "columns": ["string"],
  "rows_before": number,
  "rows_after": number,
  "rows_removed": number
}
```

---

## `/api/scatter/points` — Scatter Points

**Method:** `GET` or `POST`
**Request body (POST) or query params (GET):**
```json
{
  "x": "column_name",
  "y": "column_name",
  "color": "column_name" | null,
  "size": "column_name" | null,
  "start": epoch_ms | null,
  "end": epoch_ms | null,
  "filters": "[{...}]" | null,
  "line_filters": "[{...}]" | null,
  "limit": 1000000,
  "format": "arrow" | "json" (default: arrow for GET)
}
```

**Handler (Rust):** `get_scatter_points`, `post_scatter_points` [deps: [ScatterPointsQuery][6]]

**Response (Arrow):**
- Content-Type: `application/vnd.apache.arrow.stream`
- Columns: `x`, `y`, `color_value` (numeric) or `color_label` (categorical) — standardized names
- Headers:
  - `x-edatime-scatter-x` — original x column name
  - `x-edatime-scatter-y` — original y column name
  - `x-edatime-scatter-color` — original color/timestamp column name (used as fallback for column resolution)
  - `x-edatime-scatter-total`
  - `x-edatime-scatter-returned`
  - `x-edatime-color-min`, `x-edatime-color-max`
  - `x-edatime-scatter-color-kind: "continuous" | "categorical"`

**Response (JSON):**
```json
{
  "x": "string",
  "y": "string",
  "color": "string | null",
  "total_points": number,
  "returned_points": number,
  "points": [[x, y], ...],
  "color_values": [/* number */] | null,
  "color_labels": ["string" | null] | null,
  "color_min": number | null,
  "color_max": number | null
}
```

**[6]: [crates/edatime-service/src/handlers/scatter/scatter/points.md][6]**

---

## `/api/scatter/correlations` — Pairwise Correlations

**Method:** `GET`
**Query params:**
```
base: string (optional) — base column
threshold: number (default: 0.7)
```

**Handler (Rust):** `get_scatter_correlations` [deps: [ScatterCorrelationsQuery][7]]

**Response:**
```json
{
  "base_column": "string",
  "threshold": number,
  "numeric_columns": ["string"],
  "correlations": [{
    "column": "string",
    "count": number,
    "pearson": number | null,
    "spearman": number | null
  }],
  "suggestions": [{
    "x": "string",
    "y": "string",
    "correlation": number
  }]
}
```

**[7]: [crates/edatime-service/src/handlers/scatter/scatter/correlations.md][7]**

---

## `/api/scatter/correlations/matrix` — Correlation Matrix

**Method:** `GET`
**Handler (Rust):** `get_correlation_matrix`

**Response:**
```json
{
  "columns": ["string"],
  "pearson": [[number | null]],
  "spearman": [[number | null]]
}
```

---

## `/api/upload` — Dataset Upload

**Method:** `POST`
**Content-Type:** `multipart/form-data`
**Body:** CSV or Parquet file

**Handler (Rust):** `upload_data` [deps: [load_dataframe][8]]

**Response:**
```json
{ "status": "ok", "columns": ["string"] }
```

---

## `/api/metadata` — Dataset Metadata

**Method:** `GET`
**Handler (Rust):** `get_metadata`

**Response (TypeScript):** `DatasetMetadata` [deps: [types.ts][9]]
```typescript
interface DatasetMetadata {
  revision?: number;
  total_rows: number;
  columns: { name: string; dtype: string }[];
  numeric_columns: string[];
  time_column: string | null;
  time_range: { min: number; max: number } | null;
  column_profiles: ColumnProfile[];
}
```

**[9]: [frontend/src/types.ts][9]**

---

## `/api/transform` — Column Transformation

**Method:** `POST`
**Request body:**
```json
{
  "expression": "col_a / col_b",
  "output_name": "result_column"
}
```

**Handler (Rust):** `post_transform`

**Response:**
```json
{ "status": "ok", "column": "string", "expression": "string" }
```

---

## `/api/drift/stats` — Drift Detection

**Method:** `POST`
**Request body:**
```json
{
  "columns": "col1,col2,...",
  "window_ms": number,
  "method": "string"
}
```

**Handler (Rust):** `post_drift_stats`