# API Reference

All API routes are mounted under both `/api` and `/api/v1`.

## Core Data Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/metadata` | Dataset schema, numeric columns, time range, profiles |
| `GET` | `/data` | Time-filtered and optionally downsampled timeseries payload (Arrow IPC) |
| `GET` | `/aggregate` | Aggregated statistics |
| `GET` | `/metrics` | Runtime counters and cache metrics |

## Scatter And Distribution Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` or `POST` | `/scatter/points` | Scatter data with filters and optional color column |
| `POST` | `/scatter/export/parquet` | Export filtered scatter rows as Parquet |
| `GET` | `/scatter/correlations` | Correlation suggestions and candidate columns |
| `GET` | `/scatter/correlations/matrix` | Full Pearson and Spearman correlation matrix |
| `GET` or `POST` | `/scatter/distributions` | Distribution summaries for scatter-related columns |

## Upload And Database Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/upload` | Ingest CSV or Parquet into the in-memory dataset |
| `POST` | `/upload/preview` | Profile an upload before ingest |
| `POST` | `/database/connect` | Open a database connection |
| `DELETE` | `/database/connect` | Close the current database connection |
| `GET` | `/database/status` | Inspect current database connection state |
| `GET` | `/database/tables` | List tables or hypertables |
| `GET` | `/database/columns` | List columns for a selected table |
| `POST` | `/database/load` | Load a database table into the in-memory dataset |

## Analytics Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/analytics/rolling` | Rolling statistics overlays |
| `GET` | `/analytics/anomalies` | Anomaly detection payloads |
| `GET` | `/analytics/fft` | FFT or PSD traces |
| `GET` | `/analytics/spectrogram` | Time-frequency heatmap payload |
| `POST` | `/analytics/causal` | Tigramite-backed causal graph generation |
| `GET` | `/analytics/time_distributions` | Distribution windows across the time axis |
| `POST` | `/analytics/remove_outliers` | Remove outliers from the dataset |
| `POST` | `/transform` | Apply column transforms and create derived columns |

## Export Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/export/parquet` | Export filtered timeseries rows as Parquet |

## Notes

- `/data` is the main Arrow IPC endpoint and is the critical path for timeseries rendering.
- Scatter-oriented endpoints intentionally use JSON because the payload shape is nested and interaction-heavy.
- If you add a route or change a contract, update this reference and the developer docs together.