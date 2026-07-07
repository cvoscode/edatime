# ai/crates/edatime-service/src/analytics/anomaly.md
> Analytics helpers for anomaly-region detection and global summary statistics.

## Structs
- `AnomalyRegion`
  - `{ column: String, method: String, start_ms: f64, end_ms: f64, score: f64 }`
- `SummaryStats`
  - `{ mean: f64, std: f64, min: f64, max: f64 }`

## Functions
- `compute_summary_stats(df: &DataFrame, columns: &[String]) -> Result<Option<SummaryStats>, AppError>`
  - Computes aggregate summary statistics across all finite values from the requested columns.
- `detect_anomalies_zscore(df: &DataFrame, columns: &[String], threshold: f64) -> Result<Vec<AnomalyRegion>, AppError>`
- `detect_anomalies_iqr(df: &DataFrame, columns: &[String], k: f64) -> Result<Vec<AnomalyRegion>, AppError>`
