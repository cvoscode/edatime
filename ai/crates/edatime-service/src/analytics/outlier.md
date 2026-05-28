# crates/edatime-service/src/analytics/outlier.rs
> Outlier removal — global and windowed IQR/Z-score methods.

## Struct: OutlierRemovalResult
- `{ method: String, columns: Vec<String>, rows_before: usize, rows_after: usize, rows_removed: usize }`

## Functions
- `pub fn remove_outliers_global(df: &DataFrame, columns: &[String], method: &str, threshold: f64) -> Result<(DataFrame, OutlierRemovalResult), AppError>`
- `pub fn remove_outliers_windowed(df: &DataFrame, columns: &[String], method: &str, threshold: f64, window_size: usize) -> Result<(DataFrame, OutlierRemovalResult), AppError>`