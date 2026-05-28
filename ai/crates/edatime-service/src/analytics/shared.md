# ai/crates/edatime-service/src/analytics/shared.md

> Shared helpers used across all analytics submodules.

## Functions

- `pub fn extract_ts_epoch_ms(df: &DataFrame) -> Result<Vec<f64>, AppError>`
  - Extracts the timestamp column as epoch-millisecond f64 values.
- `pub fn extract_ts_epoch_ms_with_col(df: &DataFrame, ts_col: &str) -> Result<Vec<f64>, AppError>`
  - Extracts the timestamp column as epoch-millisecond f64 values using explicit column name.
- `fn find_ts_column(df: &DataFrame) -> Result<String, AppError>`
  - Finds the timestamp column by looking for a Datetime column (internal).
- `pub fn extract_f64_column_opt(df: &DataFrame, col_name: &str) -> Result<Vec<Option<f64>>, AppError>`
  - Extracts a named column as Vec<Option<f64>>, filtering non-finite values to None.
- `pub fn extract_f64_column(df: &DataFrame, col_name: &str) -> Result<Vec<f64>, AppError>`
  - Extracts a named column as Vec<f64>, replacing non-finite/null values with 0.0.
- `pub fn extract_columns_f64_mean(df: &DataFrame, col_names: &[String], max_points: usize) -> Result<Vec<Vec<f64>>, AppError>`
  - Extracts multiple columns as Vec<Vec<f64>> with optional subsampling, replacing NaN with column mean.
- `pub fn estimate_sample_rate_hz(ts_ms: &[f64]) -> f64`
  - Estimates sample rate in Hz from epoch-ms timestamps using median delta.