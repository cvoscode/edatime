# crates/edatime-service/src/handlers/scatter/scatter/collect.rs
> Scatter data collection — filter + project LazyFrame for scatter rendering, temporal color bucketing, and categorical cardinality capping.

## Structs
- `ColorCardinality` — `{ used: usize, bucketed: usize }` — describes how a categorical color column was collapsed. `used` = distinct labels kept; `bucketed` = distinct labels folded into `"Other (N)"`.

## Functions
- `pub fn series_to_scatter_values(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, AppError>`
  - Converts numeric/temporal column to f64 values in ms.
- `pub fn series_to_label_values(df: &DataFrame, name: &str) -> Result<Vec<Option<String>>, AppError>`
  - Converts column to String labels for categorical coloring.
- `pub fn series_to_time_bucket_labels(df: &DataFrame, name: &str) -> Result<Vec<Option<String>>, AppError>`
  - Buckets a `Datetime` or `Date` column into 24 hour-of-day labels (`"00–01"` … `"23–00"`). Preserves `None` for nulls; does NOT bucket by day-of-week.
- `pub fn collect_xy_pairs(df: &DataFrame, x: &str, y: &str) -> Result<Vec<[f64; 2]>, AppError>`
  - Collects x/y pairs filtering out non-finite values.
- `pub fn collect_filtered_scatter_frame<I: Into<LazyFrame>>(df: I, x: &str, y: &str, color: Option<&str>, size: Option<&str>, time_column: Option<&str>, start: Option<f64>, end: Option<f64>, filters: &[ScatterFilterSpec], line_filters: &[ScatterLineFilterSpec]) -> Result<LazyFrame, AppError>`
  - Core LazyFrame filter + project for scatter. Accepts `time_column` for time-based filtering.
- `pub fn cap_categorical_cardinality(labels: Vec<Option<String>>, max_cardinality: usize) -> (Vec<Option<String>>, ColorCardinality)`
  - Collapses a categorical color label vector to at most `max_cardinality` distinct labels by frequency, replacing the rest with `"Other (N)"`. Returns the rewritten labels and cardinality stats so the route handler can relay `color_cardinality` to the frontend.
