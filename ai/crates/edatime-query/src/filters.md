# crates/edatime-query/src/filters.rs
> Shared Polars filter-expression builders for time-range, numeric-range, and adaptive-line filters.

## Structs
- `RangeFilter { column: String, from: f64, to: f64 }`
- `LineFilter { column: String, x1: f64, y1: f64, x2: f64, y2: f64, keep_above: bool }`

## Functions
- `pub fn parse_range_filters(raw: Option<&str>) -> Result<Vec<RangeFilter>, AppError>`
- `pub fn parse_line_filters(raw: Option<&str>) -> Result<Vec<LineFilter>, AppError>`
- `pub fn apply_filters<I: Into<LazyFrame>>(df: I, start_ms: Option<f64>, end_ms: Option<f64>, range_filters: &[RangeFilter], line_filters: &[LineFilter]) -> Result<LazyFrame, AppError>`
  - Applies time range, range filters, and line filters to LazyFrame.