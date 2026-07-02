# ai/crates/edatime-service/src/handlers/scatter/mod.md
> Shared scatter HTTP types plus re-exports for points, matrix, export, correlations, and sampling helpers.

## Structs
- `ScatterPointsQuery` — `{ x: String, y: String, color: Option<String>, size: Option<String>, start: Option<f64>, end: Option<f64>, filters: Option<String>, line_filters: Option<String>, limit: usize, format: Option<String> }`
- `ScatterPointsResponse` — `{ x: String, y: String, color: Option<String>, total_points: usize, returned_points: usize, points: Vec<[f64; 2]>, color_values: Option<Vec<f64>>, color_labels: Option<Vec<Option<String>>>, color_min: Option<f64>, color_max: Option<f64>, size_values: Option<Vec<f64>>, size_min: Option<f64>, size_max: Option<f64> }`
- `ScatterMatrixPair` — `{ x: String, y: String }`
- `ScatterMatrixQuery` — `{ pairs: Vec<ScatterMatrixPair>, color: Option<String>, start: Option<f64>, end: Option<f64>, filters: Option<String>, line_filters: Option<String>, limit: usize }`
- `CorrelationItem` — `{ column: String, count: usize, value: Option<f64> }`
- `SuggestionItem` — `{ x: String, y: String, correlation: f64 }`

## Functions
- `numeric_columns<I: Into<LazyFrame>>(df: I) -> Vec<String>`
  - Returns numeric column names from a lazy-frame schema.
