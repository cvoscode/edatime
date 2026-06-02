# crates/edatime-service/src/handlers/routes/drift.rs
> `POST /api/drift/stats` — temporal drift analysis for a single column over time windows.

## Struct (Request)

### `DriftQuery`
- `column: String` — target column name
- `window: String` — window size keyword: `"hourly"`, `"daily"` (default), `"weekly"`
- `reference_start: String` — reference period start (RFC3339 or `YYYY-MM-DDTHH:MM`)
- `reference_end: String` — reference period end (RFC3339 or `YYYY-MM-DDTHH:MM`)

## Handler

- `pub async fn post_drift_stats(State(state): State<AppState>, Json(query): Json<DriftQuery>) -> Result<Response, AppError>` [deps: [compute_temporal_drift][1]]
  - Filters dataset to reference window + all subsequent data; computes per-window drift stats (KS, Wasserstein, PSI, Epps-Singleton); returns `DriftResponse`.

---
[1]: ../../analytics/drift.md#compute_temporal_drift