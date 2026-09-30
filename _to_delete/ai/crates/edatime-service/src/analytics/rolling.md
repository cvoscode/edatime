# crates/edatime-service/src/analytics/rolling.rs
> Rolling statistics — mean and ±1σ/±2σ bands.

## Struct

### `RollingBands`
- `column: String`
- `ts: Vec<f64>` — timestamps in epoch-ms
- `mean: Vec<Option<f64>>`
- `upper1: Vec<Option<f64>>`, `lower1: Vec<Option<f64>>` — ±1σ
- `upper2: Vec<Option<f64>>`, `lower2: Vec<Option<f64>>` — ±2σ

## Functions

- `compute_rolling_bands(df: &DataFrame, columns: &[String], window_size: usize) -> Result<Vec<RollingBands>, AppError>`