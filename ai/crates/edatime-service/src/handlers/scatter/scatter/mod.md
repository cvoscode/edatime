# crates/edatime-service/src/handlers/scatter/scatter/mod.rs
> Scatter analytics module.

## Re-exports
- `ScatterPointsQuery`, `ScatterPointsResponse`
- `CorrelationItem`, `SuggestionItem`, `CorrelationMatrixResponse`
- `ScatterLineFilterSpec`, `ScatterFilterSpec`
- `apply_scatter_filters`, `parse_scatter_line_filters`, `parse_scatter_filters`
- `collect_filtered_scatter_frame`, `collect_xy_pairs`
- `get_scatter_points`, `post_scatter_points`
- `get_scatter_correlations`, `get_correlation_matrix`
- `post_scatter_export_parquet`
- `numeric_columns(lf: I) -> Vec<String>`

## Types

### `ScatterPointsQuery`
- `x: String`, `y: String`
- `color: Option<String>`, `size: Option<String>`
- `start: Option<f64>`, `end: Option<f64>`
- `filters: Option<String>`, `line_filters: Option<String>`
- `limit: usize` (default: 1_000_000)
- `format: Option<String>` — "arrow" or "json"

### `ScatterPointsResponse`
- `x`, `y`, `color`
- `total_points: usize`, `returned_points: usize`
- `points: Vec<[f64; 2]>`
- `color_values: Option<Vec<f64>>`, `color_labels: Option<Vec<Option<String>>>`
- `color_min: Option<f64>`, `color_max: Option<f64>`
- `size_values: Option<Vec<f64>>`, `size_min: Option<f64>`, `size_max: Option<f64>`

### `CorrelationItem`
- `column: String`, `count: usize`
- `pearson: Option<f64>`, `spearman: Option<f64>`

### `SuggestionItem`
- `x: String`, `y: String`, `correlation: f64`

### `ScatterCorrelationsQuery`
- `base: Option<String>`, `threshold: Option<f64>`

### `ScatterCorrelationsResponse`
- `base_column: String`, `threshold: f64`
- `numeric_columns: Vec<String>`, `correlations: Vec<CorrelationItem>`, `suggestions: Vec<SuggestionItem>`

### `CorrelationMatrixResponse`
- `columns: Vec<String>`
- `pearson: Vec<Vec<Option<f64>>>`
- `spearman: Vec<Vec<Option<f64>>>`