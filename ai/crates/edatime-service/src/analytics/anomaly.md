# crates/edatime-service/src/analytics/anomaly.rs
> Anomaly detection — Z-score and IQR methods.

## Struct

### `AnomalyRegion`
- `column: String`
- `method: String`
- `start_ms: f64`, `end_ms: f64`
- `score: f64`

## Functions

- `detect_anomalies_zscore(df: &DataFrame, columns: &[String], threshold: f64) -> Result<Vec<AnomalyRegion>, AppError>`
- `detect_anomalies_iqr(df: &DataFrame, columns: &[String], k: f64) -> Result<Vec<AnomalyRegion>, AppError>`