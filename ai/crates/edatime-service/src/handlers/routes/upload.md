# crates/edatime-service/src/handlers/routes/upload.rs
> `POST /api/v1/upload`, `POST /api/v1/upload/preview`, `GET /api/v1/sample/{name}` — data file upload and preview.

## Handlers

- `upload_data(State(state): State<AppState>, ...) -> Result<impl IntoResponse, AppError>`
  - Accepts CSV/Parquet files, loads via edatime-ingest [deps: [../../../../edatime-ingest/src/ingest][1]], replaces dataset.
- `preview_upload_data(...) -> Result<impl IntoResponse, AppError>`
  - Returns preview of uploaded file without committing.
- `serve_sample_file(Path(name): Path<String>, ...) -> impl IntoResponse`
  - Serves built-in sample datasets.

---
[1]: ../../../../edatime-ingest/src/ingest.md