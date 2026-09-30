# crates/edatime-service/src/analytics/transform.rs
> Column transformations — expression parsing and application.

## Functions
- `pub fn apply_column_transform(df: &DataFrame, expression: &str, output_name: &str) -> Result<DataFrame, AppError>`
- `pub fn apply_column_transform_lazy(lf: &LazyFrame, expression: &str, output_name: &str) -> Result<DataFrame, AppError>`