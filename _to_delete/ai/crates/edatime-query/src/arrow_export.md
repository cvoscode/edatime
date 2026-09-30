# crates/edatime-query/src/arrow_export.rs
> Arrow IPC and Parquet export utilities.

## Functions
- `pub fn dataframe_to_arrow_ipc(mut df: DataFrame) -> PolarsResult<Vec<u8>>`
  - Serializes DataFrame to Arrow IPC format.
- `pub fn dataframe_to_parquet(mut df: DataFrame) -> PolarsResult<Vec<u8>>`
  - Serializes DataFrame to Parquet format.