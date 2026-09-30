# crates/edatime-service/src/streaming_export.rs
> Bounded-memory streaming Parquet export responses for cleaning-plan data and other lazy outputs.

## Function
- `pub async fn lazy_parquet_response(executor: &QueryExecutor, frame: LazyFrame, download_name: &str) -> Result<Response, AppError>`
  - Delegates to `lazy_parquet_response_with_path`, discarding the returned path.
- `async fn lazy_parquet_response_with_path(executor: &QueryExecutor, frame: LazyFrame, download_name: &str) -> Result<(Response, std::path::PathBuf), AppError>` (file-private)
  - Allocates a unique `tempfile::TempPath` with prefix `edatime-export-` and suffix `.parquet.tmp`.
  - Removes the placeholder file (Polars' sink creates and truncates its own file at the same path).
  - Calls `executor.sink_parquet_async(frame, path.clone()).await` to materialize the lazy frame as Parquet on the blocking pool.
  - Opens the completed file via `tokio::fs::File::open(...)`, reads `metadata().len()` to set `Content-Length`.
  - Wraps the file in a `ReaderStream` and pairs it with the `TempPath` inside a `futures_util::stream::unfold` so the `TempPath` lives until EOF — the temp file is removed when the stream finishes reading the last chunk.
  - Sets the response headers:
    - `content-type: application/x-parquet`
    - `content-length: {byte_size}`
    - `content-disposition: attachment; filename={download_name}`

## Notes
- Temp file lifetime: the `TempPath` is moved into the stream's state, so the file is deleted after the response body is consumed end-to-end (or when a disconnected client drops the body). Tests in the source file verify both the success path (`!path.exists()` after `to_bytes`) and the unread-drop path (`!path.exists()` after `drop(response)`).
- The sink is delegated to `QueryExecutor::sink_parquet_async`, which runs on a blocking thread to avoid Polars' streaming runtime colliding with the Tokio worker thread.
- The exported bytes preserve the lazy plan's projection and row order; column types are whatever Polars writes in Parquet for the resolved `LazyFrame`.

## Cross-references
- Used by `routes/cleaning::export_data` (`POST /api/v1/cleaning/export/data`) and any other handler that needs a memory-bounded Parquet response.
- `QueryExecutor` / `ExecutionContext`: see [`../edatime-query/src/executor.md`](../edatime-query/src/executor.md).
- Execution-identity headers (`x-edatime-source-version`, etc.) are attached by the caller via `routes/shared::add_execution_identity_headers` — not by this module.
