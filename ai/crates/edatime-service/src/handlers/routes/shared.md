# crates/edatime-service/src/handlers/routes/shared.rs
> Shared helpers for route handlers: filtering preamble and downsampling.

## Functions

- `filter_preamble(state: &AppState, start: DateTime<Utc>, end: DateTime<Utc>, columns: Option<&str>) -> Result<(Vec<String>, LazyFrame), AppError>`
  - Validates time window, resolves numeric columns, applies time filter.
- `downsample_by_stride(lf: LazyFrame, max_points: usize, label: &str) -> Result<LazyFrame, AppError>`
  - Downsample by stride to reduce point count.