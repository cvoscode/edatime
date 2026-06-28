# crates/edatime-service/src/handlers/scatter/mod.rs
> Scatter data collection — filter + project LazyFrame for scatter rendering.

## Module
- `#[allow(clippy::module_inception)] pub mod scatter` — rename to avoid clippy false positive on `scatter/scatter` name.

## Functions
- `pub fn series_to_scatter_values(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, AppError>`
  - Converts numeric/temporal column to f64 values in ms.
- `pub fn series_to_label_values(df: &DataFrame, name: &str) -> Result<Vec<Option<String>>, AppError>`
  - Converts column to String labels for categorical coloring.
- `pub fn collect_xy_pairs(df: &DataFrame, x: &str, y: &str) -> Result<Vec<[f64; 2]>, AppError>`
  - Collects x/y pairs filtering out non-finite values.
- `pub fn collect_filtered_scatter_frame<I: Into<LazyFrame>>(df: I, x: &str, y: &str, color: Option<&str>, size: Option<&str>, start: Option<f64>, end: Option<f64>, filters: &[ScatterFilterSpec], line_filters: &[ScatterLineFilterSpec]) -> Result<LazyFrame, AppError>`
  - Core LazyFrame filter + project for scatter.