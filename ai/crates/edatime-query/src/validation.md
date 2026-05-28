# crates/edatime-query/src/validation.rs
> Request validation helpers for time windows, widths, column counts, and numeric column checks.

## Functions
- `pub fn validate_time_window(start: DateTime<Utc>, end: DateTime<Utc>) -> Result<(), AppError>`
- `pub fn validate_width(width: usize, limits: &ValidationSettings) -> Result<(), AppError>`
- `pub fn validate_bucket_count(buckets: usize, limits: &ValidationSettings) -> Result<(), AppError>`
- `pub fn validate_window_ms(window_ms: i64, step_ms: Option<i64>) -> Result<(), AppError>`
- `pub fn validate_scatter_limit(limit: usize, limits: &ValidationSettings) -> Result<(), AppError>`
- `pub fn validate_upload_size_with_limit(total_bytes: usize, max_upload_bytes: usize) -> Result<(), AppError>`
- `pub fn validate_numeric_columns(df: &DataFrame, columns: &[String], limits: &ValidationSettings) -> Result<Vec<String>, AppError>`
- `pub fn validate_numeric_columns_lazy(lf: &LazyFrame, columns: &[String], limits: &ValidationSettings) -> Result<Vec<String>, AppError>`