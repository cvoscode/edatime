# crates/edatime-ingest/src/ingest.rs
> Data ingestion, schema detection, CSV/Parquet loading, time column normalization.

## Structs

### `LoadResult`
- `df: DataFrame`
- `time_column_name: Option<String>`
- `column_names: Vec<String>`
- `numeric_columns: Vec<String>`

### `IngestParams`
- `n_rows: Option<usize>` — Cap total rows (None = all)
- `skip_rows: usize` — Rows to skip before reading
- `time_start_ms: Option<i64>` — Filter: keep rows with ts >= this value
- `time_end_ms: Option<i64>` — Filter: keep rows with ts <= this value
- `selected_columns: Option<Vec<String>>` — Only keep these columns
- `time_column: Option<String>` — Explicit time column name
- `time_unit: Option<String>` — Explicit epoch unit: "s", "ms", "us", "ns"

## Functions
- `load_dataframe<P: AsRef<Path>>(path: P) -> PolarsResult<LoadResult>`
- `load_dataframe_partial<P: AsRef<Path>>(path: P, params: &IngestParams) -> PolarsResult<LoadResult>`