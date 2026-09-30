# crates/edatime-query/src/query.rs
> Shared query parameter types and parsing utilities.

## Structs

### `DataQuery`
- `start: DateTime<Utc>`
- `end: DateTime<Utc>`
- `width: usize`
- `columns: Option<String>`
- `color_column: Option<String>`
- `format: Option<String>` — `"arrow"` (default) or `"json"`

### `AggregateQuery`
- `start: DateTime<Utc>`
- `end: DateTime<Utc>`
- `columns: Option<String>`
- `buckets: usize` (default: 50)
- `window_mode: AggregateWindowMode`
- `window_ms: Option<i64>`
- `step_ms: Option<i64>`
- `agg: AggFn`
- `format: Option<String>`

### `QueryEntry`
- `id: u64`
- `timestamp: DateTime<Utc>`
- `route: String`
- `start_ms: Option<i64>`
- `end_ms: Option<i64>`
- `width: Option<usize>`
- `columns: Vec<String>`
- `color_column: Option<String>`
- `format: String`
- `reduction: Option<ReductionSpec>`
- `ts_dtype: String`

## Enums

### `AggFn`
- `Mean`, `Sum`, `Min`, `Max`, `Count`

### `AggregateWindowMode`
- `Buckets`, `Tumbling`, `Sliding`

### `ReductionSpec`
- `Lttb { target_points: usize }`
- `BucketAgg { buckets: usize, agg: String }`
- `WindowAgg { window_ms: i64, step_ms: i64, agg: String }`
- `None`

### `OutputFormat`
- `Arrow`, `Json`

## Functions
- `parse_columns(raw: Option<&str>) -> Vec<String>`
  - Parse the `columns` query param into a list of column name strings.
- `output_format(raw: Option<&str>) -> OutputFormat`
  - Determine the requested output format (defaults to `"arrow"`).